"""Arquitecturas de red (PyTorch) + Factory.

Todas las cabezas comparten una espina MLP residual sobre los embeddings de
384 dims del encoder (all-MiniLM-L6-v2), con LayerNorm + GELU + Dropout. Son
redes pequeñas (decenas de miles de parámetros) entrenables en CPU en segundos,
pero con suficiente capacidad para superar a los centroides zero-shot previos.

Factory:
  build_net(kind, in_dim, n_classes) -> nn.Module

Tipos de cabeza ("kind"):
  - "story_type"   : clasificación 6 clases (feature/bug/...)
  - "story_area"   : clasificación 7 clases (frontend/backend/...)
  - "effort"       : clasificación ordinal 7 clases (Fibonacci) con CORAL-like
  - "completeness" : regresión [0,1] de deploy-readiness (features de manifiesto)
"""
from __future__ import annotations

import torch
import torch.nn as nn


class ResidualBlock(nn.Module):
    """Bloque MLP con conexión residual, LayerNorm pre-activación y dropout."""

    def __init__(self, dim: int, dropout: float = 0.2):
        super().__init__()
        self.norm = nn.LayerNorm(dim)
        self.fc1 = nn.Linear(dim, dim * 2)
        self.fc2 = nn.Linear(dim * 2, dim)
        # approximate='tanh' para poder replicar el forward exacto en NumPy.
        self.act = nn.GELU(approximate="tanh")
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.norm(x)
        h = self.fc1(h)
        h = self.act(h)
        h = self.drop(h)
        h = self.fc2(h)
        return x + h


class MLPBackbone(nn.Module):
    """Proyecta el embedding a un espacio latente y aplica N bloques residuales."""

    def __init__(self, in_dim: int, hidden: int = 256, blocks: int = 2, dropout: float = 0.2):
        super().__init__()
        self.proj = nn.Linear(in_dim, hidden)
        self.act = nn.GELU(approximate="tanh")
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([ResidualBlock(hidden, dropout) for _ in range(blocks)])
        self.out_norm = nn.LayerNorm(hidden)
        self.hidden = hidden

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.drop(self.act(self.proj(x)))
        for blk in self.blocks:
            h = blk(h)
        return self.out_norm(h)


class ClassifierNet(nn.Module):
    """Backbone MLP + cabeza lineal de clasificación (softmax cross-entropy)."""

    def __init__(self, in_dim: int, n_classes: int, hidden: int = 256,
                 blocks: int = 2, dropout: float = 0.2):
        super().__init__()
        self.backbone = MLPBackbone(in_dim, hidden, blocks, dropout)
        self.head = nn.Linear(hidden, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))


class OrdinalNet(nn.Module):
    """Regresión ordinal estilo CORAL para los story points (orden importa).

    En vez de K logits independientes, predice K-1 umbrales acumulativos
    P(y > k). Penaliza menos confundir 5 con 8 que 1 con 21 (coherente con la
    naturaleza ordinal de la escalera Fibonacci).
    """

    def __init__(self, in_dim: int, n_classes: int, hidden: int = 256,
                 blocks: int = 2, dropout: float = 0.2):
        super().__init__()
        self.backbone = MLPBackbone(in_dim, hidden, blocks, dropout)
        self.fc = nn.Linear(hidden, 1, bias=False)
        # K-1 biases (umbrales) ordenados implícitamente vía la pérdida.
        self.biases = nn.Parameter(torch.zeros(n_classes - 1))
        self.n_classes = n_classes

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # logits acumulativos: (batch, K-1)
        z = self.fc(self.backbone(x))  # (batch, 1)
        return z + self.biases         # broadcasting -> (batch, K-1)


class RegressorNet(nn.Module):
    """Backbone MLP + cabeza sigmoide para regresión en [0,1] (completeness)."""

    def __init__(self, in_dim: int, hidden: int = 128, blocks: int = 1, dropout: float = 0.1):
        super().__init__()
        self.backbone = MLPBackbone(in_dim, hidden, blocks, dropout)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.head(self.backbone(x))).squeeze(-1)


# --- Factory ---------------------------------------------------------------
# Config por cabeza. 'area' usa menos capacidad + más dropout porque la frontera
# entre áreas es difusa y sobreajusta rápido con redes grandes.
_HEAD_DEFAULTS = {
    "story_type":   {"hidden": 256, "blocks": 2, "dropout": 0.25},
    "story_area":   {"hidden": 160, "blocks": 1, "dropout": 0.40},
    "effort":       {"hidden": 256, "blocks": 2, "dropout": 0.30},
    "completeness": {"hidden": 128, "blocks": 1, "dropout": 0.10},
}


def head_config(kind: str) -> dict:
    """Devuelve la config (hidden/blocks/dropout) de una cabeza (para el meta)."""
    return dict(_HEAD_DEFAULTS.get(kind, {"hidden": 256, "blocks": 2, "dropout": 0.2}))


def build_net(kind: str, in_dim: int, n_classes: int = 0) -> nn.Module:
    """Factory: construye la red adecuada para cada tarea."""
    cfg = _HEAD_DEFAULTS.get(kind, {"hidden": 256, "blocks": 2, "dropout": 0.2})
    if kind == "effort":
        return OrdinalNet(in_dim, n_classes, **cfg)
    if kind == "completeness":
        return RegressorNet(in_dim, **cfg)
    # story_type / story_area / genérico
    return ClassifierNet(in_dim, n_classes, **cfg)
