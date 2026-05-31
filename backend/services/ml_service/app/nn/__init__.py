"""Red neuronal del Stack Expert de ScrumDev AI.

Entrenamiento con PyTorch (CPU); inferencia con forward-pass NumPy puro a partir
de pesos .npz (sin dependencia de torch en producción/cloud).

Patrones de diseño aplicados:
  - Factory          -> nets.build_net / build_head_config
  - Template Method  -> trainer.BaseTrainer.fit
  - Registry/Singleton -> inference.ModelRegistry
  - Adapter          -> inference.nn_classify_story / nn_estimate_effort / ...
  - Strategy         -> selección runtime nn-vs-heurística (con fallback)
"""
