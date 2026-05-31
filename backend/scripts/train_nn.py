"""Entrena las redes neuronales del Stack Expert y persiste pesos NumPy (.npz).

Pipeline reproducible (seed fija):
  1. Carga dataset (Repository: stories.jsonl + builds.jsonl + semillas).
  2. Embeddings con all-MiniLM-L6-v2 (384d, normalizados).
  3. Split estratificado train/val/test.
  4. Entrena 4 redes (story_type, story_area, effort, completeness) con
     class-weights + early stopping (Template Method).
  5. Evalúa en test y persiste {kind}.npz + {kind}.meta.json en ml_models/.

Uso:
  python -m scripts.train_nn
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.ml_service.app.data.seeds import (  # noqa: E402
    STORY_TYPES, STORY_AREAS, FIBONACCI, TYPE_TO_IDX, AREA_TO_IDX,
    points_to_class, SEED_STORIES, SEED_BUILDS,
)
from services.ml_service.app.nn.nets import build_net, head_config  # noqa: E402
from services.ml_service.app.nn.trainer import (  # noqa: E402
    ClassifierTrainer, OrdinalTrainer, RegressorTrainer, export_state_to_npz_dict,
    _accuracy, _macro_f1,
)
from services.ml_service.app.nn.features import (  # noqa: E402
    completeness_features, manifest_to_files, COMPLETENESS_DIM, COMPLETENESS_FEATURE_NAMES,
)

SEED = 13
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services",
                                        "ml_service", "app", "data", "generated"))
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml_models"))


# --- Repository ------------------------------------------------------------
def load_stories() -> list[dict]:
    rows: list[dict] = []
    path = os.path.join(DATA_DIR, "stories.jsonl")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    if not rows:  # fallback a semillas si no se generó dataset
        rows = [{"text": t, "type": ty, "area": a, "story_points": p}
                for t, ty, a, p in SEED_STORIES]
    return rows


def load_builds() -> list[dict]:
    rows: list[dict] = []
    path = os.path.join(DATA_DIR, "builds.jsonl")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows or list(SEED_BUILDS)


def embed_texts(texts: list[str]) -> np.ndarray:
    from services.ml_service.app.models.embedder import embed_many
    vecs = embed_many(texts)
    return np.asarray(vecs, dtype=np.float32)


def stratified_split(y: np.ndarray, ratios=(0.7, 0.15, 0.15), seed=SEED):
    rng = np.random.default_rng(seed)
    tr, va, te = [], [], []
    for c in np.unique(y):
        idx = np.where(y == c)[0]
        rng.shuffle(idx)
        n = len(idx)
        n_tr = max(1, int(round(n * ratios[0])))
        n_va = max(1, int(round(n * ratios[1]))) if n - n_tr > 1 else 0
        tr.extend(idx[:n_tr])
        va.extend(idx[n_tr:n_tr + n_va])
        te.extend(idx[n_tr + n_va:])
    rng.shuffle(tr); rng.shuffle(va); rng.shuffle(te)
    return np.array(tr), np.array(va), np.array(te)


def class_weights(y: np.ndarray, n_classes: int) -> np.ndarray:
    counts = np.bincount(y, minlength=n_classes).astype(np.float32)
    counts[counts == 0] = 1.0
    w = counts.sum() / (n_classes * counts)
    return (w / w.mean()).astype(np.float32)


def kfold_indices(y: np.ndarray, k: int = 5, seed: int = SEED):
    """Folds estratificados por clase."""
    rng = np.random.default_rng(seed)
    folds = [[] for _ in range(k)]
    for c in np.unique(y):
        idx = np.where(y == c)[0]
        rng.shuffle(idx)
        for j, i in enumerate(idx):
            folds[j % k].append(i)
    return [np.array(sorted(f)) for f in folds]


def cross_validate(kind: str, X: np.ndarray, y: np.ndarray, n_classes: int, k: int = 5):
    """K-fold CV: devuelve media±std de la métrica clave (acc para clasificación,
    within_1 para esfuerzo)."""
    folds = kfold_indices(y, k)
    key = "within_1" if kind == "effort" else "accuracy"
    scores = []
    for i in range(k):
        te = folds[i]
        tr = np.concatenate([folds[j] for j in range(k) if j != i])
        # mini-val desde tr (último 15%)
        cut = int(len(tr) * 0.85)
        tr_i, va_i = tr[:cut], tr[cut:]
        net = build_net(kind, in_dim=X.shape[1], n_classes=n_classes)
        if kind == "effort":
            trainer = OrdinalTrainer(net, n_classes=n_classes, seed=SEED, epochs=300, patience=50)
        else:
            wd = 6e-2 if kind == "story_area" else 3e-2
            cw = class_weights(y[tr_i], n_classes)
            trainer = ClassifierTrainer(net, n_classes=n_classes, class_weights=cw,
                                        seed=SEED, weight_decay=wd)
        trainer.fit(X[tr_i], y[tr_i], X[va_i], y[va_i])
        m = trainer.evaluate(X[te], y[te])
        scores.append(m[key])
    return {"metric": key, "mean": float(np.mean(scores)), "std": float(np.std(scores)),
            "folds": [round(s, 4) for s in scores]}


E_MEMBERS = 5  # tamaño del ensemble (redes con distinta semilla, salidas promediadas)


def persist(kind: str, model, meta: dict) -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    npz = export_state_to_npz_dict(model)
    np.savez(os.path.join(MODELS_DIR, f"{kind}.npz"), **npz)
    with open(os.path.join(MODELS_DIR, f"{kind}.meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def persist_ensemble(kind: str, nets: list, meta: dict) -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    merged: dict[str, np.ndarray] = {}
    for e, net in enumerate(nets):
        for k, v in export_state_to_npz_dict(net).items():
            merged[f"m{e}__{k}"] = v
    np.savez(os.path.join(MODELS_DIR, f"{kind}.npz"), **merged)
    meta = {**meta, "n_members": len(nets)}
    with open(os.path.join(MODELS_DIR, f"{kind}.meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def _avg_member_output(kind: str, nets: list, X: np.ndarray) -> np.ndarray:
    """Promedio de salidas post-activación de los miembros (en torch)."""
    import torch
    outs = []
    xt = torch.as_tensor(X, dtype=torch.float32)
    for net in nets:
        net.eval()
        with torch.no_grad():
            z = net(xt)
            if kind in ("story_type", "story_area"):
                p = torch.softmax(z, dim=-1)
            else:  # effort -> sigmoid de logits acumulativos
                p = torch.sigmoid(z)
        outs.append(p.cpu().numpy())
    return np.mean(outs, axis=0)


def _ensemble_metrics(kind: str, nets: list, X_te: np.ndarray, y_te: np.ndarray,
                      n_classes: int) -> dict:
    avg = _avg_member_output(kind, nets, X_te)
    if kind in ("story_type", "story_area"):
        pred = avg.argmax(axis=1)
        top3 = np.argsort(-avg, axis=1)[:, :3]
        return {
            "accuracy": _accuracy(y_te, pred),
            "macro_f1": _macro_f1(y_te, pred, n_classes),
            "top3_accuracy": float(np.mean([y_te[i] in top3[i] for i in range(len(y_te))])),
        }
    # effort
    pred = (avg > 0.5).sum(axis=1)
    return {
        "accuracy": _accuracy(y_te, pred),
        "within_1": float((np.abs(y_te - pred) <= 1).mean()),
        "mae_classes": float(np.abs(y_te - pred).mean()),
    }


def _top3_accuracy(net, X_te: np.ndarray, y_te: np.ndarray) -> float:
    import torch
    net.eval()
    with torch.no_grad():
        logits = net(torch.as_tensor(X_te, dtype=torch.float32)).cpu().numpy()
    top3 = np.argsort(-logits, axis=1)[:, :3]
    return float(np.mean([y_te[i] in top3[i] for i in range(len(y_te))]))


def train_classifier(kind: str, X: np.ndarray, y: np.ndarray, labels: list[str]) -> dict:
    n = len(labels)
    tr, va, te = stratified_split(y)
    cfg = head_config(kind)
    wd = 6e-2 if kind == "story_area" else 3e-2  # área sobreajusta rápido
    cw = class_weights(y[tr], n)
    nets = []
    for e in range(E_MEMBERS):
        net = build_net(kind, in_dim=X.shape[1], n_classes=n)
        trainer = ClassifierTrainer(net, n_classes=n, class_weights=cw,
                                    seed=SEED + e * 101, weight_decay=wd)
        trainer.fit(X[tr], y[tr], X[va], y[va])
        nets.append(net)
    test_metric = _ensemble_metrics(kind, nets, X[te], y[te], n)
    meta = {
        "kind": kind, "in_dim": int(X.shape[1]), "n_classes": n,
        "blocks": cfg["blocks"], "hidden": cfg["hidden"], "labels": labels,
        "samples": {"train": len(tr), "val": len(va), "test": len(te)},
        "metrics": {k: round(float(v), 4) for k, v in test_metric.items()},
    }
    persist_ensemble(kind, nets, meta)
    print(f"[{kind}] ENSEMBLE({E_MEMBERS}) test acc={test_metric['accuracy']:.3f} "
          f"f1={test_metric['macro_f1']:.3f} top3={test_metric['top3_accuracy']:.3f}")
    return meta


def train_effort(X: np.ndarray, y: np.ndarray, emb_dim: int) -> dict:
    n = len(FIBONACCI)
    tr, va, te = stratified_split(y)
    cfg = head_config("effort")
    nets = []
    for e in range(E_MEMBERS):
        net = build_net("effort", in_dim=X.shape[1], n_classes=n)
        trainer = OrdinalTrainer(net, n_classes=n, seed=SEED + e * 101,
                                 epochs=400, patience=60)
        trainer.fit(X[tr], y[tr], X[va], y[va])
        nets.append(net)
    test_metric = _ensemble_metrics("effort", nets, X[te], y[te], n)
    meta = {
        "kind": "effort", "in_dim": int(X.shape[1]), "n_classes": n,
        "input_mode": "emb+effort", "emb_dim": int(emb_dim),
        "blocks": cfg["blocks"], "hidden": cfg["hidden"], "fibonacci": FIBONACCI,
        "samples": {"train": len(tr), "val": len(va), "test": len(te)},
        "metrics": {k: round(float(v), 4) for k, v in test_metric.items()},
    }
    persist_ensemble("effort", nets, meta)
    print(f"[effort] ENSEMBLE({E_MEMBERS}) test exact={test_metric['accuracy']:.3f} "
          f"within_1={test_metric['within_1']:.3f} mae={test_metric['mae_classes']:.3f}")
    return meta


_COMPLETENESS_DOMAINS = {
    "nextjs-fastapi-postgres": [
        ["product", "inventory", "supplier"], ["product", "cart", "order"],
        ["appointment", "professional", "patient"], ["invoice", "payment", "report"],
        ["property", "client", "deal"], ["course", "lesson", "enrollment"],
        ["ticket", "agent", "sla"], ["restaurant", "menu", "order"],
    ],
    "nextjs-static": [
        ["service", "project", "contact"], ["project", "post", "about"],
        ["feature", "pricing", "testimonial"], ["agenda", "speaker", "register"],
    ],
}


def build_completeness_dataset(builds: list[dict], seed=SEED):
    """Positivos = manifiestos COMPLETOS construidos desde el blueprint real;
    negativos = degradados (dropeando archivos). Label suave en [0,1] =
    completitud media de tiers * gate de entrypoints. Así la red aprende un
    límite real donde 'completo' ≈ 1.0 y deploy_ready se decide bien."""
    from shared.stacks.stack_blueprints import get_blueprint, split_by_tier, completeness_score
    from services.ml_service.app.nn.features import blueprint_full_manifest
    rng = np.random.default_rng(seed)
    X, y = [], []

    def label_for(files, stack):
        bp = get_blueprint(stack)
        buckets = split_by_tier(files, stack)
        tier_scores = [completeness_score(buckets.get(t.name, []), t) for t in bp.tiers]
        mean_score = float(np.mean(tier_scores)) if tier_scores else 0.0
        all_eps = all(
            all(ep in {(f.get("path") or "").lstrip("/") for f in buckets.get(t.name, [])}
                for ep in t.entrypoints)
            for t in bp.tiers
        )
        return mean_score * (1.0 if all_eps else 0.45)

    # fuente de manifiestos completos: dominios por stack (alineados al blueprint)
    full_manifests = []
    for stack, domains in _COMPLETENESS_DOMAINS.items():
        for entities in domains:
            full_manifests.append((stack, blueprint_full_manifest(stack, entities)))
    # + los builds curados (también alineados)
    for b in builds:
        full_manifests.append((b["stack"], b["manifest"]))

    for stack, manifest in full_manifests:
        full_files = manifest_to_files(manifest, stack)
        # positivo (completo)
        X.append(completeness_features(full_files, stack))
        y.append(min(1.0, label_for(full_files, stack)))
        # negativos: dropear k archivos al azar (varios niveles)
        n_full = len(full_files)
        for _ in range(14):
            k = int(rng.integers(1, max(2, n_full)))
            keep_idx = rng.choice(n_full, size=max(1, n_full - k), replace=False)
            partial = [full_files[i] for i in sorted(keep_idx)]
            X.append(completeness_features(partial, stack))
            y.append(label_for(partial, stack))
        # vacío total (negativo fuerte)
        X.append(completeness_features([], stack))
        y.append(0.0)

    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.float32)


def train_completeness(builds: list[dict]) -> dict:
    X, y = build_completeness_dataset(builds)
    # split simple (no estratificado: target continuo)
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(X))
    n_tr = int(len(X) * 0.7)
    n_va = int(len(X) * 0.15)
    tr, va, te = idx[:n_tr], idx[n_tr:n_tr + n_va], idx[n_tr + n_va:]
    net = build_net("completeness", in_dim=X.shape[1])
    trainer = RegressorTrainer(net, seed=SEED, epochs=500, patience=80, lr=2e-3)
    val_metric = trainer.fit(X[tr], y[tr], X[va], y[va])
    test_metric = trainer.evaluate(X[te], y[te])
    meta = {
        "kind": "completeness", "in_dim": int(X.shape[1]), "blocks": 1, "hidden": 128,
        "feature_names": COMPLETENESS_FEATURE_NAMES,
        "samples": {"train": len(tr), "val": len(va), "test": len(te)},
        "metrics": {k: round(float(v), 4) for k, v in test_metric.items()},
        "val_metrics": {k: round(float(v), 4) for k, v in val_metric.items()},
    }
    persist("completeness", net, meta)
    print(f"[completeness] test mae={test_metric['mae']:.3f} "
          f"decision_acc={test_metric['decision_accuracy']:.3f}")
    return meta


def main() -> None:
    print("Cargando dataset…")
    stories = load_stories()
    builds = load_builds()
    print(f"  historias={len(stories)}  builds={len(builds)}")
    print(f"  tipos={dict(Counter(s['type'] for s in stories))}")

    texts = [s["text"] for s in stories]
    print("Embeddings…")
    X = embed_texts(texts)
    print(f"  X={X.shape}")

    y_type = np.array([TYPE_TO_IDX[s["type"]] for s in stories])
    y_area = np.array([AREA_TO_IDX[s["area"]] for s in stories])
    y_eff = np.array([points_to_class(int(s["story_points"])) for s in stories])

    # K-fold CV (métricas confiables, no un solo split)
    if "--cv" in sys.argv:
        from services.ml_service.app.nn.features import effort_features
        X_eff = np.concatenate(
            [X, np.array([effort_features(t) for t in texts], dtype=np.float32)], axis=1)
        print("\nK-fold CV (5 folds):")
        for kind, yy, nc, XX in [("story_type", y_type, len(STORY_TYPES), X),
                                 ("story_area", y_area, len(STORY_AREAS), X),
                                 ("effort", y_eff, len(FIBONACCI), X_eff)]:
            cv = cross_validate(kind, XX, yy, nc, k=5)
            print(f"  {kind:12s} {cv['metric']}: {cv['mean']:.3f} ± {cv['std']:.3f}  folds={cv['folds']}")

    report = {}
    print("\nEntrenando redes finales…")
    report["story_type"] = train_classifier("story_type", X, y_type, STORY_TYPES)
    report["story_area"] = train_classifier("story_area", X, y_area, STORY_AREAS)
    # esfuerzo: input híbrido embedding + features léxicas de tamaño
    from services.ml_service.app.nn.features import effort_features
    X_eff = np.concatenate(
        [X, np.array([effort_features(t) for t in texts], dtype=np.float32)], axis=1)
    report["effort"] = train_effort(X_eff, y_eff, emb_dim=X.shape[1])
    report["completeness"] = train_completeness(builds)

    with open(os.path.join(MODELS_DIR, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nModelos persistidos en {MODELS_DIR}")
    print(f"  COMPLETENESS_DIM={COMPLETENESS_DIM}")


if __name__ == "__main__":
    main()
