"""Inferencia de las redes con NumPy puro (sin torch) + Registry + Adapter.

Reconstruye el forward EXACTO de nets.py a partir de los pesos .npz y el
meta.json. Así producción/cloud no necesita PyTorch: solo numpy (ya es dep del
ml_service por el embedder).

Patrones:
  - ModelRegistry  -> Singleton/Registry que carga y cachea los modelos.
  - Adapter        -> nn_classify_story / nn_estimate_effort / nn_score_completeness
                      devuelven el MISMO shape que los pipelines heurísticos
                      previos, con fallback automático si faltan pesos.
"""
from __future__ import annotations

import json
import math
import os
from functools import lru_cache
from typing import Any

import numpy as np

from shared.observability import get_logger

logger = get_logger(__name__)

# ml_models/ vive en la raíz del backend (junto a services/, shared/)
_MODELS_DIR = os.environ.get(
    "ML_MODELS_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "ml_models"),
)
_MODELS_DIR = os.path.abspath(_MODELS_DIR)

_SQRT_2_OVER_PI = math.sqrt(2.0 / math.pi)


# --- primitivas NumPy (espejo exacto de los módulos PyTorch) ---------------
def _linear(x: np.ndarray, w: np.ndarray, b: np.ndarray | None) -> np.ndarray:
    y = x @ w.T
    if b is not None:
        y = y + b
    return y


def _gelu_tanh(x: np.ndarray) -> np.ndarray:
    # idéntico a nn.GELU(approximate='tanh')
    return 0.5 * x * (1.0 + np.tanh(_SQRT_2_OVER_PI * (x + 0.044715 * x ** 3)))


def _layernorm(x: np.ndarray, g: np.ndarray, b: np.ndarray, eps: float = 1e-5) -> np.ndarray:
    mu = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return (x - mu) / np.sqrt(var + eps) * g + b


def _softmax(x: np.ndarray) -> np.ndarray:
    z = x - x.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _backbone_forward(x: np.ndarray, W: dict[str, np.ndarray], blocks: int) -> np.ndarray:
    h = _gelu_tanh(_linear(x, W["backbone__proj__weight"], W["backbone__proj__bias"]))
    for i in range(blocks):
        p = f"backbone__blocks__{i}__"
        n = _layernorm(h, W[p + "norm__weight"], W[p + "norm__bias"])
        z = _gelu_tanh(_linear(n, W[p + "fc1__weight"], W[p + "fc1__bias"]))
        z = _linear(z, W[p + "fc2__weight"], W[p + "fc2__bias"])
        h = h + z
    return _layernorm(h, W["backbone__out_norm__weight"], W["backbone__out_norm__bias"])


# --- modelo cargado --------------------------------------------------------
class LoadedModel:
    def __init__(self, kind: str, members: list[dict[str, np.ndarray]], meta: dict):
        self.kind = kind
        self.members = members          # lista de dicts de pesos (ensemble)
        self.W = members[0]             # compat
        self.meta = meta
        self.blocks = int(meta.get("blocks", 2))
        self.n_classes = int(meta.get("n_classes", 0))
        self.labels = meta.get("labels", [])

    def _member_output(self, W: dict, x: np.ndarray) -> np.ndarray:
        """Salida post-activación de UN miembro (probs / cum_probs / value)."""
        feat = _backbone_forward(x, W, self.blocks)
        if self.kind in ("story_type", "story_area"):
            return _softmax(_linear(feat, W["head__weight"], W["head__bias"]))
        if self.kind == "effort":
            return _sigmoid(_linear(feat, W["fc__weight"], None) + W["biases"])
        if self.kind == "completeness":
            return _sigmoid(_linear(feat, W["head__weight"], W["head__bias"])).squeeze(-1)
        raise ValueError(f"kind desconocido: {self.kind}")

    def predict(self, x: np.ndarray) -> dict[str, Any]:
        x = np.asarray(x, dtype=np.float32)
        single = x.ndim == 1
        if single:
            x = x[None, :]
        # ENSEMBLE: promedio de las salidas de todos los miembros
        avg = np.mean([self._member_output(W, x) for W in self.members], axis=0)

        if self.kind in ("story_type", "story_area"):
            out = {"probs": avg}
        elif self.kind == "effort":
            out = {"class": (avg > 0.5).sum(axis=-1), "cum_probs": avg}
        else:  # completeness
            out = {"value": avg}

        if single:
            out = {k: (v[0] if hasattr(v, "__len__") else v) for k, v in out.items()}
        return out


# --- Registry (Singleton) --------------------------------------------------
class ModelRegistry:
    _instance: "ModelRegistry | None" = None

    def __init__(self):
        self._cache: dict[str, LoadedModel | None] = {}

    @classmethod
    def instance(cls) -> "ModelRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get(self, kind: str) -> LoadedModel | None:
        if kind in self._cache:
            return self._cache[kind]
        model = self._load(kind)
        self._cache[kind] = model
        return model

    def _load(self, kind: str) -> LoadedModel | None:
        npz_path = os.path.join(_MODELS_DIR, f"{kind}.npz")
        meta_path = os.path.join(_MODELS_DIR, f"{kind}.meta.json")
        if not (os.path.exists(npz_path) and os.path.exists(meta_path)):
            logger.info("nn_model_absent", kind=kind, dir=_MODELS_DIR)
            return None
        try:
            data = np.load(npz_path)
            all_w = {k: data[k] for k in data.files}
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            n_members = int(meta.get("n_members", 1))
            if n_members > 1 and any(k.startswith("m0__") for k in all_w):
                members = []
                for e in range(n_members):
                    pref = f"m{e}__"
                    members.append({k[len(pref):]: v for k, v in all_w.items()
                                    if k.startswith(pref)})
            else:
                members = [all_w]
            logger.info("nn_model_loaded", kind=kind, members=len(members),
                        acc=meta.get("metrics", {}).get("accuracy"))
            return LoadedModel(kind, members, meta)
        except Exception:
            logger.exception("nn_model_load_failed", kind=kind)
            return None

    def available(self) -> dict[str, bool]:
        return {k: self.get(k) is not None
                for k in ("story_type", "story_area", "effort", "completeness")}


def is_trained() -> bool:
    reg = ModelRegistry.instance()
    return reg.get("story_type") is not None


# --- Adapters (mismo shape que los pipelines heurísticos) ------------------
@lru_cache(maxsize=1024)
def _embed(text: str) -> tuple:
    from services.ml_service.app.models.embedder import embed_one
    return tuple(embed_one(text))


def nn_classify_story(text: str) -> dict | None:
    """Adapter: clasifica tipo+área con las redes. None si no hay modelos."""
    reg = ModelRegistry.instance()
    mt = reg.get("story_type")
    ma = reg.get("story_area")
    if mt is None or ma is None:
        return None
    x = np.asarray(_embed(text), dtype=np.float32)
    tp = mt.predict(x)["probs"]
    ar = ma.predict(x)["probs"]
    t_idx = np.argsort(-tp)[:3]
    a_idx = np.argsort(-ar)[:3]
    return {
        "type": mt.labels[int(t_idx[0])],
        "type_confidence": float(tp[t_idx[0]]),
        "type_top3": [{"label": mt.labels[int(i)], "score": float(tp[i])} for i in t_idx],
        "area": ma.labels[int(a_idx[0])],
        "area_confidence": float(ar[a_idx[0]]),
        "area_top3": [{"label": ma.labels[int(i)], "score": float(ar[i])} for i in a_idx],
        "engine": "neural_net",
    }


def nn_estimate_effort(text: str) -> dict | None:
    """Adapter: estima story points (ordinal) con la red. None si no hay modelo."""
    reg = ModelRegistry.instance()
    me = reg.get("effort")
    if me is None:
        return None
    fib = me.meta.get("fibonacci", [1, 2, 3, 5, 8, 13, 21])
    x = np.asarray(_embed(text), dtype=np.float32)
    # input híbrido: si el modelo se entrenó con features léxicas, concatenarlas
    if me.meta.get("input_mode") == "emb+effort":
        from services.ml_service.app.nn.features import effort_features
        x = np.concatenate([x, np.asarray(effort_features(text), dtype=np.float32)])
    res = me.predict(x)
    cls = int(res["class"])
    cls = max(0, min(cls, len(fib) - 1))
    points = int(fib[cls])
    cum = res["cum_probs"]
    confidence = float(np.mean(np.abs(cum - 0.5)) * 2)  # 0..1, qué tan decididos los umbrales
    return {
        "story_points": points,
        "ordinal_class": cls,
        "confidence": round(confidence, 4),
        "estimated_hours_range": [points * 2, points * 6],
        "text_length_chars": len(text),
        "engine": "neural_net",
    }


def nn_score_completeness(features: list[float]) -> float | None:
    """Adapter: predice probabilidad deploy-ready a partir de features de manifiesto."""
    reg = ModelRegistry.instance()
    mc = reg.get("completeness")
    if mc is None:
        return None
    x = np.asarray(features, dtype=np.float32)
    return float(mc.predict(x)["value"])
