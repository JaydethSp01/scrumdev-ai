"""Extracción de features de completitud (compartida train + inferencia).

Vector de longitud FIJA (independiente del stack) que resume qué tan completo
está un proyecto generado vs su blueprint. Lo usa tanto el script de
entrenamiento (sobre los manifiestos de BuildMemory) como el endpoint de
completitud del ml_service, garantizando consistencia.
"""
from __future__ import annotations

from shared.stacks.stack_blueprints import (
    get_blueprint,
    split_by_tier,
    completeness_score,
)

COMPLETENESS_FEATURE_NAMES = [
    "frontend_score",       # cobertura de required_files del tier frontend
    "frontend_entrypoints", # fracción de entrypoints frontend presentes
    "frontend_files_norm",  # nº archivos frontend normalizado
    "backend_score",
    "backend_entrypoints",
    "backend_files_norm",
    "total_files_norm",     # nº total de archivos / 60
    "tiers_covered",        # fracción de tiers con score>0
    "needs_backend",        # 1 si el stack requiere backend
    "global_blueprint_score",  # promedio determinista por tier
]
COMPLETENESS_DIM = len(COMPLETENESS_FEATURE_NAMES)


def _tier_entrypoints_ratio(tier_files: list[dict], tier) -> float:
    if not tier.entrypoints:
        return 1.0
    have = {(f.get("path") or "").lstrip("/") for f in tier_files}
    present = sum(1 for ep in tier.entrypoints if ep in have)
    return present / len(tier.entrypoints)


def completeness_features(files: list[dict], stack: str) -> list[float]:
    bp = get_blueprint(stack)
    buckets = split_by_tier(files, stack)

    frontend = next((t for t in bp.tiers if t.framework in ("nextjs", "static")), None)
    backend = next((t for t in bp.tiers if t.framework == "fastapi"), None)

    def tier_feats(tier):
        if tier is None:
            return 0.0, 0.0, 0.0
        tf = buckets.get(tier.name, [])
        score = completeness_score(tf, tier)
        eps = _tier_entrypoints_ratio(tf, tier)
        files_norm = min(len(tf) / 20.0, 1.0)
        return score, eps, files_norm

    f_score, f_eps, f_files = tier_feats(frontend)
    b_score, b_eps, b_files = tier_feats(backend)

    total_files = sum(len(v) for v in buckets.values())
    tiers_with = sum(1 for t in bp.tiers if completeness_score(buckets.get(t.name, []), t) > 0)
    tiers_covered = tiers_with / len(bp.tiers) if bp.tiers else 0.0
    global_score = (
        sum(completeness_score(buckets.get(t.name, []), t) for t in bp.tiers) / len(bp.tiers)
        if bp.tiers else 0.0
    )

    return [
        round(f_score, 4), round(f_eps, 4), round(f_files, 4),
        round(b_score, 4), round(b_eps, 4), round(b_files, 4),
        round(min(total_files / 60.0, 1.0), 4),
        round(tiers_covered, 4),
        1.0 if bp.needs_backend else 0.0,
        round(global_score, 4),
    ]


# --- features léxicas de ESFUERZO (señal de tamaño que el embedding no capta) -
_KW_HIGH = [
    "integracion", "integración", "integration", "pago", "payment", "stripe",
    "checkout", "real-time", "tiempo real", "websocket", "streaming",
    "machine learning", "prediccion", "predicción", "mfa", "oauth", "saml", "sso",
    "migracion", "migración", "compliance", "gdpr", "pci", "encryption", "cifrado",
    "facturacion electronica", "facturación electrónica", "dian", "end-to-end",
    "multiples", "múltiples", "completo", "módulo completo", "motor",
]
_KW_MED = [
    "api", "endpoint", "crud", "validacion", "validación", "busqueda", "búsqueda",
    "filtro", "reporte", "report", "dashboard", "export", "import", "notificacion",
    "notificación", "email", "agendar", "calendario", "rol", "permiso",
]
_KW_LOW = [
    "typo", "color", "texto", "etiqueta", "icono", "ícono", "tooltip", "renombrar",
    "ajuste menor", "label", "boton", "botón", "copy", "espaciado",
]

# longitud fija del vector de features de esfuerzo
EFFORT_FEATURE_DIM = 8


def effort_features(text: str) -> list[float]:
    t = (text or "").lower()
    words = t.split()
    n_high = sum(t.count(k) for k in _KW_HIGH)
    n_med = sum(t.count(k) for k in _KW_MED)
    n_low = sum(t.count(k) for k in _KW_LOW)
    return [
        min(len(t) / 220.0, 1.5),            # longitud caracteres
        min(len(words) / 40.0, 1.5),         # nº palabras
        min(n_high / 3.0, 1.0),              # densidad complejidad alta
        min(n_med / 3.0, 1.0),               # densidad complejidad media
        min(n_low / 2.0, 1.0),               # densidad trivial
        1.0 if n_high > 0 else 0.0,          # tiene señal épica
        1.0 if n_low > 0 and n_high == 0 else 0.0,  # claramente trivial
        min((n_high * 3 + n_med - n_low) / 6.0, 1.5),  # score de complejidad
    ]


def blueprint_full_manifest(stack: str, entities: list[str] | None = None) -> dict:
    """Manifiesto COMPLETO y alineado al contrato del blueprint (required_files +
    entrypoints) + archivos por entidad de dominio. Es la fuente de verdad de
    'cómo se ve un proyecto exitoso' para el few-shot y el entrenamiento de
    completitud."""
    bp = get_blueprint(stack)
    entities = entities or []
    manifest: dict[str, list[str]] = {}
    for tier in bp.tiers:
        files = list(tier.required_files) + list(tier.entrypoints)
        if tier.framework == "fastapi":
            for e in entities:
                files += [f"app/models/{e}.py", f"app/routers/{e}.py", f"app/schemas/{e}.py"]
            files += ["app/config.py", "app/services/__init__.py"]
        elif tier.framework in ("nextjs", "static"):
            for e in entities:
                files += [f"app/{e}/page.tsx", f"components/{e.capitalize()}Card.tsx"]
            files += ["lib/types.ts"]
        manifest[tier.name] = list(dict.fromkeys(files))
    return manifest


def manifest_to_files(manifest: dict, stack: str) -> list[dict]:
    """Convierte {tier: [paths]} de BuildMemory a [{path}] con prefijo de tier."""
    bp = get_blueprint(stack)
    prefix_by_tier = {t.name: t.path_prefix for t in bp.tiers}
    files: list[dict] = []
    for tier_name, paths in manifest.items():
        prefix = prefix_by_tier.get(tier_name, "")
        for p in paths:
            files.append({"path": f"{prefix}{p}"})
    return files
