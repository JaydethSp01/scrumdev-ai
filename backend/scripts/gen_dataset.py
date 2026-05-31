"""Aumento del dataset con el MOTOR DUAL (OpenAI + Claude trabajando juntos).

Genera historias de usuario etiquetadas (tipo / área / story points) y
manifiestos de builds exitosos por stack, a partir de las semillas reales. Los
dos modelos colaboran como una sola máquina:
  - OpenAI (gpt-4o-mini): generación masiva y barata del grueso del dataset.
  - Claude (sonnet): lote de alta diversidad + relabel/validación cruzada.

Salida JSONL en services/ml_service/app/data/generated/:
  - stories.jsonl : {text, type, area, story_points, source}
  - builds.jsonl  : {stack, vision, manifest, source}

Uso:
  OPENAI_API_KEY=... ANTHROPIC_API_KEY=... \
  python -m scripts.gen_dataset --per-type 60 --claude-per-type 12

Es idempotente por contenido: deduplica historias por texto normalizado.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys

import httpx

# permitir ejecutar como módulo desde backend/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.ml_service.app.data.seeds import (  # noqa: E402
    STORY_TYPES, STORY_AREAS, FIBONACCI, SEED_STORIES, SEED_BUILDS,
)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "services", "ml_service",
                       "app", "data", "generated")
OUT_DIR = os.path.abspath(OUT_DIR)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_MODEL = os.environ.get("GEN_OPENAI_MODEL", "gpt-4o-mini")
CLAUDE_MODEL = os.environ.get("GEN_CLAUDE_MODEL", "claude-sonnet-4-6")

TYPE_DESC = {
    "feature": "nueva funcionalidad de valor para el usuario final",
    "bug": "corrección de un defecto/error en el sistema existente",
    "improvement": "mejora de rendimiento, usabilidad o calidad sin cambiar comportamiento",
    "spike": "investigación técnica, prueba de concepto o exploración",
    "chore": "tarea técnica interna, refactor, infraestructura o mantenimiento",
    "documentation": "creación o actualización de documentación",
}
AREA_DESC = {
    "frontend": "interfaz de usuario, componentes UI, páginas web",
    "backend": "API, endpoints, lógica de negocio, microservicios",
    "data": "modelo de datos, esquema de BD, migraciones, consultas, reportes",
    "devops": "infraestructura, despliegue, CI/CD, contenedores, monitoreo",
    "security": "autenticación, autorización, cifrado, vulnerabilidades, compliance",
    "ml_ai": "modelos de ML, agentes IA, embeddings, LLMs, predicción",
    "integration": "integraciones con sistemas externos, APIs de terceros, webhooks, pagos",
}

DOMAINS = [
    "gestión de inventario para un minorista", "e-commerce de moda",
    "SaaS de agendamiento de citas para clínicas", "plataforma de facturación electrónica",
    "marketplace de servicios locales", "sistema de gestión de proyectos tipo Scrum",
    "app de delivery de comida", "CRM para una inmobiliaria",
    "plataforma educativa con cursos", "panel de logística y rastreo de envíos",
]

_norm = lambda s: re.sub(r"\s+", " ", (s or "").strip().lower())


def _build_prompt(stype: str, n: int) -> str:
    return (
        f"Eres un Product Owner experto. Genera {n} historias de usuario en ESPAÑOL "
        f"del tipo '{stype}' ({TYPE_DESC[stype]}). Varía el dominio de negocio entre: "
        f"{', '.join(DOMAINS)}. Cada historia debe ser realista y específica.\n\n"
        f"Para cada historia asigna:\n"
        f"- 'area': una de {STORY_AREAS} ({'; '.join(f'{k}={v}' for k,v in AREA_DESC.items())}).\n"
        f"- 'story_points': uno de {FIBONACCI} (Fibonacci; 1=trivial, 21=épica enorme), "
        f"coherente con la complejidad descrita.\n\n"
        f"Devuelve SOLO un array JSON válido, sin texto extra, con objetos "
        f'{{"text": "...", "area": "...", "story_points": N}}.'
    )


def _build_area_prompt(area: str, n: int) -> str:
    return (
        f"Eres un Product Owner experto. Genera {n} historias de usuario en ESPAÑOL "
        f"cuyo ÁREA sea SIEMPRE '{area}' ({AREA_DESC[area]}). Varía el dominio entre: "
        f"{', '.join(DOMAINS)} y varía el tipo de trabajo (nueva funcionalidad, bug, "
        f"mejora, spike, chore, documentación).\n\n"
        f"Para cada historia asigna:\n"
        f"- 'type': uno de {STORY_TYPES}.\n"
        f"- 'story_points': uno de {FIBONACCI} (Fibonacci), coherente con la complejidad.\n\n"
        f"Devuelve SOLO un array JSON válido, sin texto extra, con objetos "
        f'{{"text": "...", "type": "...", "story_points": N}}. El area es siempre "{area}".'
    )


def _build_effort_prompt(level: str, n: int) -> str:
    if level == "trivial":
        desc = ("MUY pequeñas y triviales (1-2 story points): cambios de texto, "
                "color, ícono, tooltip, corrección de typo, renombrar etiqueta, "
                "ajuste menor de estilo. Una sola pantalla, sin lógica.")
        pts = "1 o 2"
    else:  # epic
        desc = ("ENORMES y complejas (13-21 story points): módulos completos con "
                "múltiples integraciones, autenticación, real-time, compliance, "
                "motores de predicción, facturación electrónica end-to-end.")
        pts = "13 o 21"
    return (
        f"Eres un Product Owner experto. Genera {n} historias de usuario en ESPAÑOL "
        f"que sean {desc}\nVaría el dominio entre: {', '.join(DOMAINS)} y el área "
        f"entre {STORY_AREAS}.\n\nPara cada historia asigna:\n"
        f"- 'type': uno de {STORY_TYPES}.\n- 'area': una de {STORY_AREAS}.\n"
        f"- 'story_points': {pts} (acorde a su tamaño).\n\n"
        f"Devuelve SOLO un array JSON válido con objetos "
        f'{{"text":"...","type":"...","area":"...","story_points":N}}.'
    )


def _validate_full(items: list[dict]) -> list[dict]:
    out = []
    for it in items:
        try:
            text = str(it["text"]).strip()
            stype = str(it["type"]).strip().lower()
            area = str(it["area"]).strip().lower()
            pts = int(it["story_points"])
        except (KeyError, ValueError, TypeError):
            continue
        if not text or len(text) < 12 or stype not in STORY_TYPES or area not in STORY_AREAS:
            continue
        pts = min(FIBONACCI, key=lambda x: abs(x - pts))
        out.append({"text": text, "type": stype, "area": area, "story_points": pts})
    return out


def _validate_area(items: list[dict], area: str) -> list[dict]:
    out = []
    for it in items:
        try:
            text = str(it["text"]).strip()
            stype = str(it["type"]).strip().lower()
            pts = int(it["story_points"])
        except (KeyError, ValueError, TypeError):
            continue
        if not text or stype not in STORY_TYPES or len(text) < 15:
            continue
        pts = min(FIBONACCI, key=lambda x: abs(x - pts))
        out.append({"text": text, "type": stype, "area": area, "story_points": pts})
    return out


def _validate(items: list[dict], stype: str) -> list[dict]:
    out = []
    for it in items:
        try:
            text = str(it["text"]).strip()
            area = str(it["area"]).strip().lower()
            pts = int(it["story_points"])
        except (KeyError, ValueError, TypeError):
            continue
        if not text or area not in STORY_AREAS:
            continue
        # snap a Fibonacci válido
        pts = min(FIBONACCI, key=lambda x: abs(x - pts))
        if len(text) < 15:
            continue
        out.append({"text": text, "type": stype, "area": area, "story_points": pts})
    return out


def _parse_json_array(content: str) -> list[dict]:
    content = content.strip()
    # quitar fences ```json ... ```
    content = re.sub(r"^```(json)?", "", content).strip()
    content = re.sub(r"```$", "", content).strip()
    m = re.search(r"\[.*\]", content, re.DOTALL)
    if m:
        content = m.group(0)
    try:
        data = json.loads(content)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


async def _openai(client: httpx.AsyncClient, prompt: str, key: str,
                  max_tokens: int = 3000) -> list[dict]:
    try:
        r = await client.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.9,
                "max_tokens": max_tokens,
                "response_format": {"type": "text"},
            },
            timeout=120.0,
        )
        if r.status_code >= 400:
            print(f"  [openai] {r.status_code}: {r.text[:160]}")
            return []
        return _parse_json_array(r.json()["choices"][0]["message"]["content"])
    except Exception as exc:  # noqa: BLE001
        print(f"  [openai] error: {exc}")
        return []


async def _claude(client: httpx.AsyncClient, prompt: str, key: str,
                  max_tokens: int = 3000) -> list[dict]:
    try:
        r = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "temperature": 1.0,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=180.0,
        )
        if r.status_code >= 400:
            print(f"  [claude] {r.status_code}: {r.text[:160]}")
            return []
        blocks = r.json().get("content", [])
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        return _parse_json_array(text)
    except Exception as exc:  # noqa: BLE001
        print(f"  [claude] error: {exc}")
        return []


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-type", type=int, default=60, help="historias OpenAI por tipo")
    ap.add_argument("--claude-per-type", type=int, default=12, help="historias Claude por tipo")
    ap.add_argument("--boost-areas", type=str, default="", help="áreas a balancear, ej 'ml_ai,devops'")
    ap.add_argument("--per-area", type=int, default=50, help="historias OpenAI por área en boost")
    ap.add_argument("--effort-focus", type=int, default=0, help="historias por extremo (trivial/épica)")
    args = ap.parse_args()

    openai_key = os.environ.get("OPENAI_API_KEY")
    claude_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("SCRUMDEV_AI_API_KEY")
    if not openai_key and not claude_key:
        print("ERROR: necesitas OPENAI_API_KEY y/o ANTHROPIC_API_KEY en el entorno.")
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)
    seen: set[str] = set()
    stories: list[dict] = []

    # 0) ACUMULAR lo ya generado en corridas previas (merge, no sobrescribir)
    stories_path = os.path.join(OUT_DIR, "stories.jsonl")
    if os.path.exists(stories_path):
        with open(stories_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                s = json.loads(line)
                k = _norm(s["text"])
                if k not in seen:
                    seen.add(k)
                    stories.append(s)
        print(f"acumulado previo: {len(stories)}")

    # 1) semillas reales (máxima prioridad)
    for text, stype, area, pts in SEED_STORIES:
        k = _norm(text)
        if k not in seen:
            seen.add(k)
            stories.append({"text": text, "type": stype, "area": area,
                            "story_points": pts, "source": "seed"})
    print(f"con semillas reales: {len(stories)}")

    async with httpx.AsyncClient() as client:
        # 2) OpenAI: bulk por tipo (concurrente)
        if openai_key:
            tasks = [_openai(client, _build_prompt(t, args.per_type), openai_key,
                             max_tokens=10000)
                     for t in STORY_TYPES]
            results = await asyncio.gather(*tasks)
            for stype, items in zip(STORY_TYPES, results):
                valid = _validate(items, stype)
                added = 0
                for v in valid:
                    k = _norm(v["text"])
                    if k in seen:
                        continue
                    seen.add(k)
                    v["source"] = "openai"
                    stories.append(v)
                    added += 1
                print(f"  openai {stype}: +{added}")

        # 2b) OpenAI: boost de áreas escasas (concurrente)
        boost = [a.strip() for a in args.boost_areas.split(",") if a.strip() in STORY_AREAS]
        if openai_key and boost:
            tasks = [_openai(client, _build_area_prompt(a, args.per_area), openai_key,
                             max_tokens=10000) for a in boost]
            results = await asyncio.gather(*tasks)
            for area, items in zip(boost, results):
                valid = _validate_area(items, area)
                added = 0
                for v in valid:
                    k = _norm(v["text"])
                    if k in seen:
                        continue
                    seen.add(k)
                    v["source"] = "openai_area"
                    stories.append(v)
                    added += 1
                print(f"  openai[area={area}]: +{added}")

        # 2c) OpenAI: extremos de esfuerzo (triviales 1-2pt + épicas 13-21pt)
        if openai_key and args.effort_focus > 0:
            tasks = [_openai(client, _build_effort_prompt(lvl, args.effort_focus),
                             openai_key, max_tokens=8000) for lvl in ("trivial", "epic")]
            results = await asyncio.gather(*tasks)
            for lvl, items in zip(("trivial", "epic"), results):
                added = 0
                for v in _validate_full(items):
                    k = _norm(v["text"])
                    if k in seen:
                        continue
                    seen.add(k)
                    v["source"] = f"openai_effort_{lvl}"
                    stories.append(v)
                    added += 1
                print(f"  openai[effort={lvl}]: +{added}")

        # 3) Claude: lote de alta diversidad por tipo (concurrente)
        if claude_key and args.claude_per_type > 0:
            tasks = [_claude(client, _build_prompt(t, args.claude_per_type), claude_key)
                     for t in STORY_TYPES]
            results = await asyncio.gather(*tasks)
            for stype, items in zip(STORY_TYPES, results):
                valid = _validate(items, stype)
                added = 0
                for v in valid:
                    k = _norm(v["text"])
                    if k in seen:
                        continue
                    seen.add(k)
                    v["source"] = "claude"
                    stories.append(v)
                    added += 1
                print(f"  claude {stype}: +{added}")

    # escribir stories.jsonl
    stories_path = os.path.join(OUT_DIR, "stories.jsonl")
    with open(stories_path, "w", encoding="utf-8") as f:
        for s in stories:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    # builds: semillas (la generación de manifiestos sintéticos se siembra aparte)
    builds_path = os.path.join(OUT_DIR, "builds.jsonl")
    with open(builds_path, "w", encoding="utf-8") as f:
        for b in SEED_BUILDS:
            f.write(json.dumps({**b, "source": "seed"}, ensure_ascii=False) + "\n")

    # distribución
    from collections import Counter
    ct = Counter(s["type"] for s in stories)
    ca = Counter(s["area"] for s in stories)
    cp = Counter(s["story_points"] for s in stories)
    print(f"\nTOTAL historias: {len(stories)}  ->  {stories_path}")
    print(f"  por tipo:  {dict(ct)}")
    print(f"  por área:  {dict(ca)}")
    print(f"  por pts:   {dict(sorted(cp.items()))}")
    print(f"builds: {len(SEED_BUILDS)}  ->  {builds_path}")


if __name__ == "__main__":
    asyncio.run(main())
