"""Extractor de riesgos por keywords + scoring de severidad."""
from __future__ import annotations

import re

RISK_CATALOG = [
    {"keyword": r"pago|payment|cobro|stripe|checkout", "type": "financial", "severity": "high",
     "description": "Manejo de pagos: cumplimiento PCI-DSS, idempotencia, reconciliacion."},
    {"keyword": r"password|contrasena|credential", "type": "auth", "severity": "high",
     "description": "Credenciales: hash bcrypt, evitar logging, rotacion."},
    {"keyword": r"oauth|sso|saml|jwt|token", "type": "auth", "severity": "medium",
     "description": "Autenticacion federada: validar issuer/audience, expirations."},
    {"keyword": r"upload|file|archivo", "type": "input", "severity": "medium",
     "description": "Carga de archivos: validar tipo MIME, tamano, antivirus, ruta."},
    {"keyword": r"email|correo|smtp|notification", "type": "communication", "severity": "low",
     "description": "Envio de emails: SPF/DKIM, anti-spam, idempotencia."},
    {"keyword": r"gdpr|lgpd|hipaa|pci", "type": "compliance", "severity": "high",
     "description": "Compliance: retencion, anonimizacion, derecho al olvido, auditoria."},
    {"keyword": r"webhook|callback|external api", "type": "integration", "severity": "medium",
     "description": "Webhooks: validar firma, reintentos, idempotencia, timeout."},
    {"keyword": r"real[- ]?time|websocket|streaming", "type": "performance", "severity": "medium",
     "description": "Tiempo real: backpressure, escalabilidad horizontal, reconexion."},
    {"keyword": r"machine learning|ml model|llm|embedding|agente|agent", "type": "ml", "severity": "medium",
     "description": "ML/AI: drift detection, prompt injection, costo de inferencia, fallback."},
    {"keyword": r"sql|database|migracion|migration", "type": "data", "severity": "medium",
     "description": "Datos: backups, migraciones reversibles, indices, lock contention."},
    {"keyword": r"admin|root|superuser|privileged", "type": "authorization", "severity": "high",
     "description": "Privilegios elevados: RBAC, principio de menor privilegio, auditoria."},
    {"keyword": r"public|publico|anonimo|guest", "type": "exposure", "severity": "medium",
     "description": "Endpoints publicos: rate limiting, validacion estricta, anti-abuse."},
]

SEVERITY_SCORE = {"low": 1, "medium": 3, "high": 5}


def extract_risks(text: str) -> dict:
    t = text.lower()
    found: list[dict] = []
    total_score = 0
    seen_types: set[str] = set()
    for entry in RISK_CATALOG:
        if re.search(entry["keyword"], t):
            if entry["type"] in seen_types:
                continue
            seen_types.add(entry["type"])
            found.append(
                {
                    "type": entry["type"],
                    "severity": entry["severity"],
                    "description": entry["description"],
                }
            )
            total_score += SEVERITY_SCORE[entry["severity"]]

    if total_score >= 10:
        overall = "high"
    elif total_score >= 5:
        overall = "medium"
    elif total_score >= 1:
        overall = "low"
    else:
        overall = "minimal"

    return {
        "overall_risk": overall,
        "risk_score": total_score,
        "risks": found,
        "count": len(found),
    }
