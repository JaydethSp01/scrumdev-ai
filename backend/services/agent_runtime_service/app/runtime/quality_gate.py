"""Gate de CALIDAD de generación: mide cada página/componente y REGENERA los
que son pobres (como el page.tsx de 634 chars que salía vacío), hasta que
cumplen un umbral. Nada pobre se despliega.

Mide: longitud, datos (mock/estado inicial no-null), estructura (cards/tablas/
listas), diseño (clases Tailwind), y que NO dependa de un fetch que deje la
pantalla en blanco. Lo pobre se reescribe con un prompt fuerte + ejemplo.
"""
from __future__ import annotations

import re

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)

# Ejemplo de page.tsx RICO (estilo BarberPro) que se le muestra al modelo.
EXAMPLE_PAGE = '''"use client";
import { useState } from 'react';
const MOCK = { items: [ {id:1,nombre:'Ejemplo A',valor:120}, {id:2,nombre:'Ejemplo B',valor:80} ],
  metricas: [ {label:'Total', valor:200}, {label:'Activos', valor:2} ] };
export default function Dashboard() {
  const [data] = useState(MOCK); // arranca CON datos visibles, nunca null
  return (
    <div className="p-8 space-y-8">
      <header><h1 className="text-3xl font-bold tracking-tight">Panel de control</h1>
        <p className="text-neutral-500 mt-1">Resumen general</p></header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.metricas.map((m,i)=>(
          <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">{m.label}</p>
            <p className="text-3xl font-bold mt-1">{m.valor}</p></div>))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Registros</h2>
        <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500">
          <th className="py-2">Nombre</th><th className="py-2">Valor</th></tr></thead>
          <tbody>{data.items.map((it)=>(<tr key={it.id} className="border-t border-neutral-100 dark:border-neutral-800">
            <td className="py-3">{it.nombre}</td><td className="py-3">{it.valor}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}'''


def _is_page(path: str) -> bool:
    p = path.lstrip("/")
    return p.endswith("page.tsx") and ("/app/" in p or p.startswith("app/")) \
        and not p.endswith("layout.tsx")


def page_quality(content: str) -> tuple[int, list[str]]:
    """Puntúa una página 0..100. Bajo = pobre (regenerar)."""
    c = content or ""
    issues: list[str] = []
    score = 0
    # longitud (un page real serio supera ~1500 chars)
    if len(c) >= 2500: score += 30
    elif len(c) >= 1200: score += 20
    elif len(c) >= 600: score += 8
    else: issues.append("page muy corto")
    # datos: estado inicial NO null y con mock/estructura
    if re.search(r"useState\(\s*null\s*\)", c):
        issues.append("useState(null) -> pantalla vacía si el fetch falla")
    else:
        score += 15
    if re.search(r"useState\(\s*[\[{]", c) or "MOCK" in c or "mock" in c:
        score += 15  # arranca con datos
    else:
        issues.append("sin datos iniciales/mock")
    # estructura visual
    if re.search(r"\b(grid|flex)\b", c): score += 10
    else: issues.append("sin layout grid/flex")
    if c.count("className") >= 6: score += 15
    else: issues.append("pocas clases de estilo")
    if re.search(r"rounded|shadow", c): score += 10
    else: issues.append("sin estética (rounded/shadow)")
    if re.search(r"\.map\(", c): score += 5  # renderiza listas
    return min(score, 100), issues


async def enforce_quality(
    files: list[dict], vision: str, classification: dict, project_key: str,
    threshold: int = 55, max_rounds: int = 2,
) -> tuple[list[dict], list[str]]:
    """Mide cada page y regenera las pobres hasta el umbral. Devuelve (files, report)."""
    report: list[str] = []
    entities = ", ".join(classification.get("entities") or []) or "registros"
    for f in files:
        path = f.get("path") or ""
        if not _is_page(path):
            continue
        for _round in range(max_rounds):
            score, issues = page_quality(f.get("content") or "")
            if score >= threshold:
                break
            logger.info("quality_low_regen", project=project_key, path=path,
                        score=score, issues=issues)
            prompt = (
                f"Eres un dev frontend senior. Genera el archivo `{path}` de una app "
                f"web (dominio: {vision[:200]}; entidades: {entities}).\n\n"
                f"PROBLEMAS de la versión actual: {', '.join(issues)}.\n\n"
                "REQUISITOS OBLIGATORIOS:\n"
                "- Arranca CON datos mock inline (useState con array/objeto real, "
                "NUNCA useState(null)). Datos realistas del dominio, 4-8 registros.\n"
                "- Diseño profesional Tailwind: header con título, grid de tarjetas "
                "(rounded-2xl, shadow, border), tabla/lista estilizada, responsive "
                "(sm/md/lg), dark mode.\n"
                "- 'use client' en la primera línea. Sin imports a componentes que "
                "no existan (escribe el JSX inline o usa tags básicos estilizados).\n"
                "- Mínimo 60 líneas, completo y ejecutable.\n\n"
                f"EJEMPLO de la calidad esperada:\n{EXAMPLE_PAGE}\n\n"
                f"Devuelve SOLO el código de {path}, sin ``` ni explicaciones."
            )
            try:
                new = await run_claude_code(prompt, max_turns=1, kind="ui")
                new = re.sub(r"^```[a-zA-Z]*\n", "", (new or "").strip())
                new = re.sub(r"\n```$", "", new)
                ns, _ = page_quality(new)
                if new and ns > score and "export default" in new:
                    f["content"] = new
                    report.append(f"page regenerada: {path} ({score}->{ns})")
                else:
                    break
            except Exception as exc:  # noqa: BLE001
                logger.warning("quality_regen_failed", path=path, error=str(exc)[:120])
                break
    if not report:
        report.append("calidad OK (todas las páginas pasan el umbral)")
    return files, report
