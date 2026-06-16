"""Agente de Diseño UX/UI (#11): audita y CORRIGE el frontend generado contra
los principios de diseño web, responsive y accesibilidad — sin importar el
tiempo, la prioridad es que la app se vea profesional y acorde a lo que el
usuario pidió.

Hace dos cosas:
  1. Heurística rápida (sin LLM): detecta archivos .tsx con UI pobre (sin clases
     Tailwind, sin estructura) -> los marca para reescribir.
  2. Reescritura con la IA (Claude): a cada archivo pobre le pasa los 7
     principios + el dominio del proyecto y pide una versión rediseñada,
     responsive y accesible, preservando la lógica (imports, hooks, fetch).
"""
from __future__ import annotations

import asyncio
import re

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)

DESIGN_PRINCIPLES = """PRINCIPIOS DE DISEÑO WEB (obligatorios):
1. Claridad y simplicidad: cada elemento con propósito claro; minimalismo visual.
2. Coherencia: mismos patrones, colores, tipografía e iconos en toda la app.
3. Feedback: estados de carga, hover en botones, mensajes de confirmación/éxito.
4. Control y libertad: botones de volver/cancelar/deshacer; el usuario dirige.
5. Prevención de errores: validación en formularios, confirmación antes de borrar.
6. Jerarquía visual: tamaño/color/contraste/espacio en blanco guían la vista; CTAs claros.
7. Accesibilidad (a11y): contraste AA, alt en imágenes, navegación por teclado,
   labels/aria para lectores de pantalla, foco visible.
+ RESPONSIVE: usar grid/flex con breakpoints (sm/md/lg), nunca anchos fijos que rompan en móvil.
+ ESTÉTICA: Tailwind con rounded-xl/2xl, shadow, spacing generoso, MODO CLARO (sin dark:),
  paleta coherente, tipografía jerarquizada. NUNCA HTML plano sin clases."""


# El ROOT layout es estructural (<html><body>{children}</body></html>): NO es una
# pantalla visual y NO debe tener rounded/shadow. Reescribirlo rompía el html/body
# o lo dejaba vacío (el loop "lo arreglo y sale peor"). Se excluye del reviewer;
# el build_gate ya garantiza su corrección con _fix_root_layout.
_ROOT_LAYOUTS = {"frontend/app/layout.tsx", "app/layout.tsx"}


def _is_ui_file(path: str) -> bool:
    p = path.lstrip("/")
    if p in _ROOT_LAYOUTS:
        return False
    return (
        p.startswith("frontend/app/") or p.startswith("frontend/components/")
        or p.startswith("app/") or p.startswith("components/")
    ) and p.endswith((".tsx", ".jsx"))


def _design_score(content: str) -> tuple[int, list[str]]:
    """Puntúa la calidad visual de un archivo .tsx (0=pobre, alto=bien). Devuelve
    (score, problemas) — heurística barata para decidir qué reescribir."""
    c = content
    problems: list[str] = []
    classes = len(re.findall(r'className=', c))
    has_layout = bool(re.search(r"\b(flex|grid)\b", c))
    has_radius = "rounded" in c
    has_shadow = "shadow" in c
    has_spacing = bool(re.search(r"\b(p-|px-|py-|gap-|space-|m-|mt-|mb-)", c))
    has_responsive = bool(re.search(r"\b(sm:|md:|lg:|xl:)", c))
    has_color = bool(re.search(r"\b(bg-|text-|border-)", c))
    # tags JSX sin clases (HTML plano)
    plain = len(re.findall(r"<(div|h1|h2|h3|p|ul|li|table|section)(?![^>]*className)", c))
    score = 0
    score += min(classes, 10)
    score += 3 if has_layout else 0
    score += 2 if has_radius else 0
    score += 2 if has_shadow else 0
    score += 2 if has_spacing else 0
    score += 3 if has_responsive else 0
    score += 2 if has_color else 0
    score -= plain
    if not has_layout: problems.append("sin layout flex/grid")
    if not has_responsive: problems.append("no responsive (sin sm/md/lg)")
    if not has_radius and not has_shadow: problems.append("sin estética (rounded/shadow)")
    if plain > 2: problems.append(f"{plain} tags HTML sin clases")
    if classes < 3: problems.append("casi sin clases Tailwind")
    return score, problems


async def review_and_fix_design(
    files: list[dict], vision: str, project_key: str, min_score: int = 10,
) -> tuple[list[dict], list[str]]:
    """Audita los archivos UI y reescribe (con la IA) los que tienen diseño pobre.
    Devuelve (files, report). Sin límite de tiempo: la calidad manda."""
    report: list[str] = []
    by_path = {f.get("path"): f for f in files}
    poor: list[tuple[dict, list[str]]] = []
    for f in files:
        path = f.get("path") or ""
        if not _is_ui_file(path):
            continue
        content = f.get("content") or ""
        if len(content) < 40:  # stub vacío o casi
            poor.append((f, ["archivo casi vacío"]))
            continue
        score, problems = _design_score(content)
        if score < min_score and problems:
            poor.append((f, problems))

    if not poor:
        report.append("diseño OK (todos los archivos UI pasan la auditoría)")
        return files, report

    logger.info("design_review_start", project=project_key, poor=len(poor))
    # PARALELO (los archivos son independientes) con semáforo para no saturar el SDK.
    sem = asyncio.Semaphore(4)

    async def _fix(f: dict, problems: list[str]) -> None:
        path = f.get("path")
        original = f.get("content") or ""
        prompt = (
            f"Eres un diseñador UX/UI senior. Rediseña este archivo de una app web "
            f"(dominio: {vision[:200]}).\n\n{DESIGN_PRINCIPLES}\n\n"
            f"PROBLEMAS detectados: {', '.join(problems)}.\n\n"
            f"REGLAS: preserva EXACTAMENTE la lógica (imports, hooks, props, fetch, "
            f"nombres de export). Solo mejora el JSX/Tailwind: layout responsive, "
            f"jerarquía visual, tarjetas/tablas/botones estilizados, estados "
            f"hover/loading, accesibilidad (aria/labels/contraste). Mantén "
            f"'use client' si estaba. Devuelve SOLO el código del archivo {path}, "
            f"sin explicaciones ni ```.\n\nARCHIVO ACTUAL:\n{original[:4000]}"
        )
        async with sem:
            try:
                new = await run_claude_code(prompt, max_turns=1, kind="ui")
                new = _strip_fences(new)
                if new and len(new) > len(original) * 0.5 and "export" in new:
                    new_score, _ = _design_score(new)
                    old_score, _ = _design_score(original)
                    if new_score >= old_score:
                        f["content"] = new
                        report.append(f"rediseñado: {path} ({old_score}->{new_score})")
            except Exception as exc:  # noqa: BLE001 -> nunca romper la generación
                logger.warning("design_fix_failed", path=path, error=str(exc)[:120])

    await asyncio.gather(*[_fix(f, pr) for f, pr in poor], return_exceptions=True)
    if not report:
        report.append("design review: sin cambios aplicados")
    logger.info("design_review_done", project=project_key, fixed=len(report))
    return files, report


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"^```[a-zA-Z]*\n", "", t)
    t = re.sub(r"\n```$", "", t)
    return t.strip()
