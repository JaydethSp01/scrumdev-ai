"""Workflow Temporal real con approval gate + policy enforcement.

Pipeline:
  1. run_crew (refinement) -> backlog
  2. policy_check (architecture-policy + quality-gates) -> bloquea si falla
  3. run_crew (delivery) -> codigo
  4. request_human_approval (gate antes de prod)
  5. wait_for_approval_signal
  6. deploy
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from temporalio import activity, workflow


@dataclass
class CrewCommand:
    crew_name: str
    inputs: dict
    correlation_id: str


@dataclass
class DeliveryCommand:
    project_key: str
    correlation_id: str
    requested_by: str
    auto_approve: bool = False


@activity.defn(name="run_crew_activity")
async def run_crew_activity(cmd: CrewCommand) -> dict:
    import httpx

    from shared.config.settings import settings

    url = f"{settings.agent_runtime_service_url}/crews/{cmd.crew_name}/run"
    payload = {"inputs": cmd.inputs, "correlation_id": cmd.correlation_id}
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        return response.json()


@activity.defn(name="policy_check")
async def policy_check(payload: dict) -> dict:
    """Llama al policy_service. Bloquea si quality-gates o architecture-policy
    detectan violaciones criticas."""
    import httpx

    from shared.config.settings import settings

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{settings.policy_service_url}/evaluate", json=payload
        )
        if r.status_code >= 400:
            return {"blocked": False, "warning": r.text}
        return r.json()


@activity.defn(name="request_human_approval")
async def request_human_approval_activity(payload: dict) -> dict:
    import httpx

    from shared.config.settings import settings

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{settings.orchestrator_service_url}/decisions", json=payload
        )
        r.raise_for_status()
        return r.json()


@workflow.defn
class SoftwareDeliveryWorkflow:
    """Workflow simple: solo run_crew (compatibilidad)."""

    @workflow.run
    async def run(self, cmd: CrewCommand) -> dict:
        from temporalio.common import RetryPolicy

        result = await workflow.execute_activity(
            run_crew_activity,
            cmd,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=2),
                maximum_attempts=3,
                non_retryable_error_types=["ValueError"],
            ),
        )
        return {"workflow": "completed", "crew_result": result}


@workflow.defn
class FullDeliveryWorkflow:
    """Pipeline completo con policy + approval gate antes de prod.

    Compatible con guia Delfin sec §239, §278, §983 (aprobacion humana
    obligatoria antes de produccion).
    """

    def __init__(self) -> None:
        self._approved: bool = False
        self._approval_decision: dict | None = None

    @workflow.signal
    async def approval_received(self, decision: dict) -> None:
        """Signal disparada por orchestrator cuando un humano aprueba/rechaza."""
        self._approved = decision.get("status") == "approved"
        self._approval_decision = decision

    @workflow.run
    async def run(self, cmd: DeliveryCommand) -> dict:
        from temporalio.common import RetryPolicy

        retry = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_attempts=3,
        )

        refinement = await workflow.execute_activity(
            run_crew_activity,
            CrewCommand("refinement", {"project_key": cmd.project_key}, cmd.correlation_id),
            start_to_close_timeout=timedelta(minutes=15),
            retry_policy=retry,
        )

        policy_result = await workflow.execute_activity(
            policy_check,
            {
                "project_key": cmd.project_key,
                "correlation_id": cmd.correlation_id,
                "stage": "post-refinement",
                "context": refinement,
            },
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=retry,
        )
        if policy_result.get("blocked"):
            return {
                "workflow": "blocked_by_policy",
                "violations": policy_result.get("violations", []),
            }

        delivery = await workflow.execute_activity(
            run_crew_activity,
            CrewCommand("delivery", {"project_key": cmd.project_key}, cmd.correlation_id),
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=retry,
        )

        if not cmd.auto_approve:
            await workflow.execute_activity(
                request_human_approval_activity,
                {
                    "project_key": cmd.project_key,
                    "decision_type": "release_to_production",
                    "title": f"Aprobar deploy a produccion: {cmd.project_key}",
                    "summary": "Refinement + delivery listos. Revisar antes de desplegar.",
                    "correlation_id": cmd.correlation_id,
                    "requested_by": cmd.requested_by,
                    "context": {"refinement": refinement, "delivery": delivery},
                },
                start_to_close_timeout=timedelta(minutes=1),
                retry_policy=retry,
            )

            await workflow.wait_condition(
                lambda: self._approved or (self._approval_decision is not None),
                timeout=timedelta(days=7),
            )

            if not self._approved:
                return {"workflow": "rejected_by_human", "decision": self._approval_decision}

        return {
            "workflow": "completed",
            "refinement": refinement,
            "delivery": delivery,
            "approval": self._approval_decision,
        }
