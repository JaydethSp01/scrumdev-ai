"""Entrenamiento con Template Method + persistencia a NPZ.

BaseTrainer.fit() define el esqueleto (optimizer, AdamW + scheduler, early
stopping sobre validación, restauración del mejor estado). Las subclases
implementan los hooks específicos de la tarea:

  - _loss(logits, y)            -> escalar
  - _predict(logits)            -> etiquetas/valores
  - _metric(y_true, y_pred)     -> dict de métricas (mayor 'score' = mejor)

Subclases: ClassifierTrainer (cross-entropy), OrdinalTrainer (CORAL),
RegressorTrainer (MSE en [0,1]).
"""
from __future__ import annotations

from typing import Any

import numpy as np
import torch
import torch.nn as nn


def export_state_to_npz_dict(model: nn.Module) -> dict[str, np.ndarray]:
    """Serializa el state_dict a arrays NumPy con claves seguras para .npz.

    Reemplaza '.' por '__' porque np.savez no admite puntos en los nombres.
    """
    out: dict[str, np.ndarray] = {}
    for k, v in model.state_dict().items():
        out[k.replace(".", "__")] = v.detach().cpu().numpy().astype(np.float32)
    return out


class BaseTrainer:
    """Esqueleto de entrenamiento (Template Method)."""

    def __init__(self, model: nn.Module, *, lr: float = 3e-3, weight_decay: float = 1e-2,
                 epochs: int = 300, patience: int = 40, batch_size: int = 64, seed: int = 13):
        self.model = model
        self.lr = lr
        self.weight_decay = weight_decay
        self.epochs = epochs
        self.patience = patience
        self.batch_size = batch_size
        self.seed = seed

    # --- hooks que definen las subclases ---
    def _loss(self, logits: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError

    def _predict(self, logits: torch.Tensor) -> np.ndarray:
        raise NotImplementedError

    def _metric(self, y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
        raise NotImplementedError

    def _to_target(self, y: np.ndarray) -> torch.Tensor:
        return torch.as_tensor(y, dtype=torch.long)

    # --- template method ---
    def fit(self, X_tr: np.ndarray, y_tr: np.ndarray,
            X_val: np.ndarray, y_val: np.ndarray) -> dict[str, Any]:
        torch.manual_seed(self.seed)
        np.random.seed(self.seed)

        Xtr = torch.as_tensor(X_tr, dtype=torch.float32)
        ytr = self._to_target(y_tr)
        Xval = torch.as_tensor(X_val, dtype=torch.float32)

        opt = torch.optim.AdamW(self.model.parameters(), lr=self.lr,
                                weight_decay=self.weight_decay)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=self.epochs)

        n = Xtr.shape[0]
        best_score = -1e9
        best_state = None
        best_epoch = -1
        bad = 0

        for epoch in range(self.epochs):
            self.model.train()
            perm = torch.randperm(n)
            for i in range(0, n, self.batch_size):
                idx = perm[i:i + self.batch_size]
                opt.zero_grad()
                logits = self.model(Xtr[idx])
                loss = self._loss(logits, ytr[idx])
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), 5.0)
                opt.step()
            sched.step()

            # validación
            self.model.eval()
            with torch.no_grad():
                val_logits = self.model(Xval)
            y_pred = self._predict(val_logits)
            m = self._metric(y_val, y_pred)
            score = m["score"]
            if score > best_score + 1e-6:
                best_score = score
                best_state = {k: v.detach().clone() for k, v in self.model.state_dict().items()}
                best_epoch = epoch
                bad = 0
            else:
                bad += 1
                if bad >= self.patience:
                    break

        if best_state is not None:
            self.model.load_state_dict(best_state)

        # métrica final sobre val con el mejor estado
        self.model.eval()
        with torch.no_grad():
            y_pred = self._predict(self.model(Xval))
        final_metric = self._metric(y_val, y_pred)
        final_metric["best_epoch"] = best_epoch
        return final_metric

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict[str, float]:
        self.model.eval()
        with torch.no_grad():
            y_pred = self._predict(self.model(torch.as_tensor(X, dtype=torch.float32)))
        return self._metric(y, y_pred)


def _accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float((y_true == y_pred).mean())


def _macro_f1(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> float:
    f1s = []
    for c in range(n_classes):
        tp = float(((y_pred == c) & (y_true == c)).sum())
        fp = float(((y_pred == c) & (y_true != c)).sum())
        fn = float(((y_pred != c) & (y_true == c)).sum())
        if tp == 0 and (fp == 0 or fn == 0):
            f1s.append(0.0)
            continue
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if (prec + rec) else 0.0)
    return float(np.mean(f1s)) if f1s else 0.0


class ClassifierTrainer(BaseTrainer):
    def __init__(self, model, n_classes: int, class_weights: np.ndarray | None = None, **kw):
        super().__init__(model, **kw)
        self.n_classes = n_classes
        w = None
        if class_weights is not None:
            w = torch.as_tensor(class_weights, dtype=torch.float32)
        self.criterion = nn.CrossEntropyLoss(weight=w, label_smoothing=0.05)

    def _loss(self, logits, y):
        return self.criterion(logits, y)

    def _predict(self, logits):
        return logits.argmax(dim=-1).cpu().numpy()

    def _metric(self, y_true, y_pred):
        acc = _accuracy(y_true, y_pred)
        f1 = _macro_f1(y_true, y_pred, self.n_classes)
        return {"score": 0.5 * acc + 0.5 * f1, "accuracy": acc, "macro_f1": f1}


class OrdinalTrainer(BaseTrainer):
    """CORAL: target = vector binario acumulado [y>0, y>1, ..., y>K-2]."""

    def __init__(self, model, n_classes: int, **kw):
        super().__init__(model, **kw)
        self.n_classes = n_classes
        self.criterion = nn.BCEWithLogitsLoss()

    def _to_target(self, y: np.ndarray) -> torch.Tensor:
        # (N, K-1) binario acumulado
        levels = np.arange(self.n_classes - 1)[None, :]
        cum = (y[:, None] > levels).astype(np.float32)
        return torch.as_tensor(cum, dtype=torch.float32)

    def _loss(self, logits, y):
        return self.criterion(logits, y)

    def _predict(self, logits):
        probs = torch.sigmoid(logits)
        # clase = nº de umbrales superados (prob > 0.5)
        return (probs > 0.5).sum(dim=-1).cpu().numpy()

    def _metric(self, y_true, y_pred):
        acc = _accuracy(y_true, y_pred)
        mae = float(np.abs(y_true - y_pred).mean())       # error ordinal (clases)
        within1 = float((np.abs(y_true - y_pred) <= 1).mean())
        # score prioriza cercanía ordinal: penaliza poco ±1
        return {"score": within1 - 0.1 * mae, "accuracy": acc,
                "mae_classes": mae, "within_1": within1}


class RegressorTrainer(BaseTrainer):
    def __init__(self, model, **kw):
        super().__init__(model, **kw)
        self.criterion = nn.MSELoss()

    def _to_target(self, y: np.ndarray) -> torch.Tensor:
        return torch.as_tensor(y, dtype=torch.float32)

    def _loss(self, logits, y):
        return self.criterion(logits, y)

    def _predict(self, logits):
        return logits.cpu().numpy()

    def _metric(self, y_true, y_pred):
        mae = float(np.abs(y_true - y_pred).mean())
        # accuracy de la decisión deploy-ready (umbral 0.5)
        acc = float(((y_pred >= 0.5) == (y_true >= 0.5)).mean())
        return {"score": acc - mae, "mae": mae, "decision_accuracy": acc}
