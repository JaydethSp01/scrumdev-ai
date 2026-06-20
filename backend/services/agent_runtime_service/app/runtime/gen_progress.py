"""Progreso en vivo + trazabilidad fina de la generación de código.

Cada sub-paso del Developer (generar estructura, completar dominio, calidad,
diseño, tests) se registra como una fila `AgentRun` (status running -> done/skipped)
con su resumen y artefactos. Esto cumple dos cosas que el usuario pidió:
  1. FEEDBACK EN VIVO: el frontend (OrchestrationStudio / panel de agentes) hace
     polling a /agent-runs y muestra los pasos apareciendo y completándose, así el
     usuario sabe qué se está haciendo y no se desespera durante una generación larga.
  2. DETALLE A FONDO: cada paso queda auditado con input/output/artefactos para poder
     entrar a ver qué hizo cada agente.

Todo es BEST-EFFORT: un fallo registrando progreso JAMÁS rompe la generación.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from shared.db.models import AgentRun
from shared.db.session import get_session
from shared.observability import get_logger

logger = get_logger(__name__)


async def _save(run: AgentRun) -> None:
    try:
        async for session in get_session():
            session.add(run)
            await session.commit()
            break
    except Exception as exc:  # noqa: BLE001
        logger.warning("gen_progress_save_failed", error=str(exc)[:160])


async def _update(run_id: str, **fields) -> None:
    try:
        async for session in get_session():
            row = await session.get(AgentRun, run_id)
            if row:
                for k, v in fields.items():
                    setattr(row, k, v)
                await session.commit()
            break
    except Exception as exc:  # noqa: BLE001
        logger.warning("gen_progress_update_failed", error=str(exc)[:160])


class Step:
    """Context manager async para un sub-paso. Registra running al entrar y
    done/error al salir, con duración real. Uso:

        async with reporter.step("Quality Gate", "Mejorando calidad de páginas") as s:
            ... trabajo ...
            s.done(output="3 páginas regeneradas", artifacts=[...])
    """

    def __init__(self, reporter: "GenProgress", agent: str, desc: str, action: str):
        self.reporter = reporter
        self.agent = agent
        self.desc = desc
        self.action = action
        self.run_id: str | None = None
        self._t0 = 0.0
        self._output: str | None = None
        self._artifacts: list = []
        self._status = "done"

    def set(self, output: str | None = None, artifacts: list | None = None,
            status: str | None = None) -> None:
        if output is not None:
            self._output = output
        if artifacts is not None:
            self._artifacts = artifacts
        if status is not None:
            self._status = status

    async def __aenter__(self) -> "Step":
        self._t0 = time.monotonic()
        run = AgentRun(
            project_key=self.reporter.project_key,
            agent_name=self.agent,
            role="developer",
            phase="DEVELOPMENT",
            action=self.action,
            input_summary=self.desc,
            output_summary="…",
            artifacts=[],
            status="running",
            correlation_id=self.reporter.correlation_id,
            started_at=datetime.now(timezone.utc),
        )
        await _save(run)
        self.run_id = run.id
        logger.info("gen_step_start", project=self.reporter.project_key,
                    agent=self.agent, desc=self.desc)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        dur = int((time.monotonic() - self._t0) * 1000)
        if exc_type is not None:
            status, out = "error", f"Falló: {str(exc)[:160]}"
        else:
            status = self._status
            out = self._output or self.desc
        if self.run_id:
            await _update(self.run_id, status=status, output_summary=out,
                          artifacts=self._artifacts,
                          ended_at=datetime.now(timezone.utc), duration_ms=dur)
        logger.info("gen_step_end", project=self.reporter.project_key,
                    agent=self.agent, status=status, ms=dur)
        return False  # nunca tragar la excepción


class GenProgress:
    """Reporter por generación. `correlation_id` enlaza los pasos con el build."""

    def __init__(self, project_key: str, correlation_id: str | None = None):
        self.project_key = project_key
        self.correlation_id = correlation_id

    def step(self, agent: str, desc: str, action: str = "develop") -> Step:
        return Step(self, agent, desc, action)

    async def note(self, agent: str, desc: str, output: str,
                   status: str = "done", artifacts: list | None = None) -> None:
        """Registro puntual (sin bloque): un evento ya ocurrido (p.ej. 'omitido')."""
        now = datetime.now(timezone.utc)
        await _save(AgentRun(
            project_key=self.project_key, agent_name=agent, role="developer",
            phase="DEVELOPMENT", action="develop", input_summary=desc,
            output_summary=output, artifacts=artifacts or [], status=status,
            correlation_id=self.correlation_id, started_at=now, ended_at=now,
            duration_ms=0,
        ))
