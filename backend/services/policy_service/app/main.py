"""Policy Service - evalua artefactos contra politicas YAML ejecutables.

Politicas en `app/policies/*.yaml`. Endpoints:
  GET  /policies                            lista politicas
  GET  /policies/{name}                     YAML de una politica
  POST /policy/evaluate                     evalua un artefacto contra politicas
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("policy-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Policy Service", version="0.2.0")
instrument_app(app, "policy-service")

POLICIES_DIR = Path(__file__).parent / "policies"


class EvaluateRequest(BaseModel):
    project_key: str
    artifact_type: str
    artifact_reference: str | None = None
    content: str | None = None
    policies: list[str] = []
    context: dict | None = None


def _load_policy(name: str) -> dict[str, Any] | None:
    path = POLICIES_DIR / f"{name}.yaml"
    if not path.exists():
        return None
    return yaml.safe_load(path.read_text())


def _list_policies() -> list[str]:
    return sorted(p.stem for p in POLICIES_DIR.glob("*.yaml"))


def _eval_architecture_policy(content: str, policy: dict) -> list[dict]:
    violations: list[dict] = []
    for rule in policy.get("rules", []):
        pattern = rule.get("pattern")
        if not pattern:
            continue
        try:
            if re.search(pattern, content, re.MULTILINE):
                violations.append(
                    {
                        "policy": policy.get("policy"),
                        "rule": rule["id"],
                        "severity": rule.get("severity", "medium"),
                        "message": rule.get("description", ""),
                    }
                )
        except re.error:
            continue
    return violations


def _eval_twelve_factor(content: str, policy: dict) -> list[dict]:
    violations: list[dict] = []
    tf = policy.get("twelve_factor", {})
    if tf.get("config", {}).get("hardcoded_secrets_forbidden"):
        for pattern in [
            r'password\s*=\s*"[^"]+"',
            r'api[_-]?key\s*=\s*"[^"]+"',
            r'secret\s*=\s*"[^"]{8,}"',
        ]:
            if re.search(pattern, content, re.IGNORECASE):
                violations.append(
                    {
                        "policy": policy.get("policy"),
                        "rule": "hardcoded_secrets_forbidden",
                        "severity": "high",
                        "message": "Posible secreto hardcoded detectado.",
                    }
                )
                break
    if tf.get("logs", {}).get("stdout_required"):
        if re.search(r"\.write\(.*log", content) or "log_file" in content.lower():
            violations.append(
                {
                    "policy": policy.get("policy"),
                    "rule": "logs_must_be_stdout",
                    "severity": "medium",
                    "message": "Los logs deben ir a stdout, no a archivos.",
                }
            )
    return violations


def _eval_security_policy(content: str, policy: dict) -> list[dict]:
    violations: list[dict] = []
    owasp = policy.get("owasp_top_10", {})
    if "injection" in owasp:
        if re.search(r"f['\"](SELECT|INSERT|UPDATE|DELETE).*\{", content, re.IGNORECASE):
            violations.append(
                {
                    "policy": policy.get("policy"),
                    "rule": "owasp_injection",
                    "severity": "high",
                    "message": "Posible SQL injection via f-string. Usa parametros bind.",
                }
            )
    if "sensitive_data" in owasp:
        if re.search(r"http://(?!localhost|127\.0\.0\.1)", content):
            violations.append(
                {
                    "policy": policy.get("policy"),
                    "rule": "owasp_sensitive_data_in_transit",
                    "severity": "high",
                    "message": "Comunicacion no HTTPS detectada para host remoto.",
                }
            )
    return violations


def _eval_quality_gates(content: str, policy: dict, context: dict | None = None) -> list[dict]:
    """Evalua los quality gates contra el contexto del workflow (no solo declarativo).

    context puede traer: test_coverage_percent, high_severity_violations,
    critical_violations, y flags booleanos por gate (unit_tests_passed, etc.).
    Sin contexto, no inventa violaciones (no bloquea por falta de datos).
    """
    violations: list[dict] = []
    ctx = context or {}
    thr = policy.get("thresholds", {})
    name = policy.get("policy", "quality-gates")

    cov = ctx.get("test_coverage_percent")
    if cov is not None and cov < thr.get("min_test_coverage_percent", 0):
        violations.append({"policy": name, "rule": "min_test_coverage",
                           "severity": "high",
                           "message": f"Cobertura {cov}% < minimo {thr['min_test_coverage_percent']}%"})
    hi = ctx.get("high_severity_violations")
    if hi is not None and hi > thr.get("max_high_severity_violations", 999):
        violations.append({"policy": name, "rule": "max_high_severity",
                           "severity": "high",
                           "message": f"{hi} violaciones high > maximo {thr['max_high_severity_violations']}"})
    crit = ctx.get("critical_violations")
    if crit is not None and crit > thr.get("max_critical_violations", 999):
        violations.append({"policy": name, "rule": "max_critical",
                           "severity": "critical",
                           "message": f"{crit} violaciones criticas > maximo {thr['max_critical_violations']}"})
    # gates requeridos explicitamente marcados como fallidos en el contexto
    gates = policy.get("quality_gates", {})
    stage_gates = gates.get(ctx.get("gate_stage", ""), {}).get("required", [])
    for g in stage_gates:
        if ctx.get(g) is False:  # solo si explicitamente False
            violations.append({"policy": name, "rule": g, "severity": "high",
                               "message": f"Gate requerido no cumplido: {g}"})
    return violations


# evaluators que solo usan content
_CONTENT_EVALUATORS = {
    "architecture-policy": _eval_architecture_policy,
    "twelve-factor-policy": _eval_twelve_factor,
    "security-policy": _eval_security_policy,
}
# evaluators que usan tambien el contexto del workflow
_CONTEXT_EVALUATORS = {
    "quality-gates": _eval_quality_gates,
}
EVALUATORS = {**_CONTENT_EVALUATORS, **_CONTEXT_EVALUATORS}


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "policy-service",
        "policies": _list_policies(),
    }


@app.get("/policies")
async def list_policies() -> dict[str, list[str]]:
    return {"policies": _list_policies()}


@app.get("/policies/{name}")
async def get_policy(name: str) -> dict:
    policy = _load_policy(name)
    if not policy:
        raise HTTPException(status_code=404, detail=f"policy {name} not found")
    return policy


@app.post("/policy/evaluate")
async def evaluate(req: EvaluateRequest) -> dict:
    requested = req.policies or _list_policies()
    all_violations: list[dict] = []
    evaluated: list[str] = []
    for policy_name in requested:
        policy = _load_policy(policy_name)
        if not policy:
            continue
        evaluated.append(policy_name)
        if policy_name in _CONTEXT_EVALUATORS:
            all_violations.extend(
                _CONTEXT_EVALUATORS[policy_name](req.content or "", policy, req.context)
            )
        else:
            evaluator = _CONTENT_EVALUATORS.get(policy_name)
            if evaluator and req.content:
                all_violations.extend(evaluator(req.content, policy))
    return {
        "project_key": req.project_key,
        "artifact_type": req.artifact_type,
        "artifact_reference": req.artifact_reference,
        "policies_evaluated": evaluated,
        "violations": all_violations,
        "violation_count": len(all_violations),
        "status": "passed" if not all_violations else "failed",
    }


class WorkflowEvalRequest(BaseModel):
    """Payload del workflow Temporal en gates de quality / architecture.

    Devuelve `blocked: bool` para que el workflow corte si hay violaciones
    criticas (severity >= critical en quality-gates / architecture-policy).
    """
    project_key: str
    correlation_id: str | None = None
    stage: str  # post-refinement | post-coding | pre-deploy
    context: dict | None = None


@app.post("/evaluate")
async def evaluate_workflow_gate(req: WorkflowEvalRequest) -> dict:
    """Hook bloqueante para el workflow. Solo bloquea en violaciones criticas."""
    target_policies = ["architecture-policy", "quality-gates"]
    if req.stage == "pre-deploy":
        target_policies.append("security-policy")

    all_violations: list[dict] = []
    evaluated: list[str] = []
    for policy_name in target_policies:
        policy = _load_policy(policy_name)
        if not policy:
            continue
        evaluated.append(policy_name)
        if policy_name in _CONTEXT_EVALUATORS:
            # quality-gates: usa el contexto estructurado del workflow
            all_violations.extend(
                _CONTEXT_EVALUATORS[policy_name]("", policy, req.context or {})
            )
        else:
            evaluator = _CONTENT_EVALUATORS.get(policy_name)
            if evaluator and req.context:
                content = req.context if isinstance(req.context, str) else str(req.context)
                all_violations.extend(evaluator(content, policy))

    critical = [v for v in all_violations if (v.get("severity") or "").lower() in ("critical", "high")]
    return {
        "project_key": req.project_key,
        "stage": req.stage,
        "policies_evaluated": evaluated,
        "violations": all_violations,
        "critical_count": len(critical),
        "blocked": bool(critical),
        "status": "passed" if not critical else "blocked",
    }
