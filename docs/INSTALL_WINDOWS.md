# Instalar y correr ScrumDev AI en Windows (todo local)

Guía para dejar **toda la plataforma funcional en tu Windows**: backend + frontend + base de datos, corriendo en tu máquina. Incluye un **script automático** que hace casi todo por ti.

---

## 1. Requisitos previos (instálalos una sola vez)

| Herramienta | Para qué | Descarga |
|-------------|----------|----------|
| **Python 3.11–3.13** | backend | https://www.python.org/downloads/ — **marca “Add Python to PATH”** al instalar |
| **Node.js 18+ (LTS)** | frontend | https://nodejs.org/ |
| **Docker Desktop** | base de datos (Postgres) | https://www.docker.com/products/docker-desktop/ — **ábrelo** antes de instalar |
| **Git** | clonar el repo | https://git-scm.com/download/win |

> Después de instalar Python y Node, **cierra y reabre** PowerShell para que tomen el PATH.

---

## 2. Clonar el proyecto

Abre **PowerShell** y ejecuta:

```powershell
git clone <URL-DEL-REPO> scrumdev-ai
cd scrumdev-ai
```

---

## 3. Opción A — Script automático (recomendado)

Con Docker Desktop **abierto**, dentro de la carpeta del proyecto:

```powershell
# 1) Instala todo, configura .env y levanta la base de datos
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1

# 2) Arranca backend + frontend (abre dos ventanas y tu navegador)
powershell -ExecutionPolicy Bypass -File .\scripts\run_windows.ps1
```

El `setup_windows.ps1` te pedirá tu **API key de OpenAI** (ver §5). Cuando termine, `run_windows.ps1` abre **http://localhost:3000**.

> Para **apagar** todo: cierra las dos ventanas de PowerShell y ejecuta `docker compose -f infra/docker-compose.yml down`.

---

## 4. Opción B — Paso a paso manual

```powershell
# 1) Base de datos (Postgres :5434 + Redis :6379) en Docker
docker compose -f infra/docker-compose.yml up -d

# 2) Variables de entorno
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env.local
#   -> edita .env y pon (ver §5):
#      SCRUMDEV_AI_PROVIDER=openai
#      OPENAI_ENABLED=true
#      OPENAI_API_KEY=sk-...
#      OPENAI_MODEL_VISION=gpt-4o
#      ML_ENABLED=false  KAFKA_ENABLED=false  RABBITMQ_ENABLED=false
#      DATABASE_URL=postgresql+asyncpg://scrumdev:scrumdev@localhost:5434/scrumdev_ai

# 3) Dependencias
pip install --user poetry
cd backend;  poetry install --no-root;  cd ..
cd frontend; npm install;               cd ..

# 4) Arrancar (dos terminales)
#    Terminal 1 (backend, todo en un proceso):
cd backend
$env:PYTHONPATH = "$PWD"
poetry run uvicorn bundles.allinone:app --host 0.0.0.0 --port 8080

#    Terminal 2 (frontend):
cd frontend
npm run dev
```

Abre **http://localhost:3000**.

---

## 5. Configurar la API key de OpenAI (para que genere código)

La generación de código usa **OpenAI** (`gpt-4o`). Solo necesitas tu API key:

1. Consíguela en **https://platform.openai.com/api-keys** (empieza por `sk-...`).
2. Ponla en `.env`:

```
SCRUMDEV_AI_PROVIDER=openai
OPENAI_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL_VISION=gpt-4o        # modelo para generar código
OPENAI_MODEL_FAST=gpt-4o-mini     # modelo barato para las ayudas menores
```

> La **misma** key habilita también las ayudas menores (asistente de visión, “En cristiano”, resumen ejecutivo), que usan `gpt-4o-mini`.

> Sin key, la plataforma **abre igual** (ves la UI, te registras, creas proyectos), pero la IA **no generará** hasta que la pongas.

---

## 6. Usarlo

1. Abre **http://localhost:3000**.
2. **Regístrate** (crea tu usuario).
3. **Crea un proyecto**, escribe tu idea (puedes usar “✨ Mejorar con IA”).
4. Dale **iniciar el ciclo**: el orquestador coordina a los agentes (PO → Arquitecto → Developer…). Verás el progreso en vivo.
5. Aprueba los **gates** cuando corresponda.

> La **primera vez**, el backend tarda ~20-40 s en crear las tablas de la base de datos. Es normal.

---

## 7. Notas importantes

- **Desplegar apps generadas a la nube (Vercel/Render/Neon) es OPCIONAL.** Para eso necesitarías tokens de GitHub/Vercel/Neon en `.env` (`SCRUMDEV_GIT_TOKEN`, `VERCEL_TOKEN`, `SCRUMDEV_NEON_API_KEY`, …). Para probar **localmente** no hacen falta: el ciclo genera y valida el código sin publicar.
- **ML pesado desactivado** (`ML_ENABLED=false`): el servicio de memoria usa un fallback ligero. No afecta la generación ni el flujo.
- **Puertos:** frontend `3000`, backend (todo en uno) `8080`, Postgres `5434`, Redis `6379`. Si tienes algo ocupando esos puertos, cámbialos en `.env` / `docker-compose.yml`.
- **Reiniciar limpio:** `docker compose -f infra/docker-compose.yml down -v` borra la base de datos local (empiezas de cero).

---

## 8. Problemas comunes

| Síntoma | Solución |
|---------|----------|
| `docker: command not found` / “Docker no está corriendo” | Abre **Docker Desktop** y espera a que diga *Running*. |
| `poetry` no se reconoce | Cierra y reabre PowerShell, o `python -m pip install --user poetry`. |
| Backend no conecta a la BD | Verifica que el contenedor `scrumdev-postgres` esté *Up*: `docker ps`. |
| La IA no genera nada | Falta `OPENAI_API_KEY` / `OPENAI_ENABLED=true` / `SCRUMDEV_AI_PROVIDER=openai` en `.env` (§5). |
| Error 401 de OpenAI | La `OPENAI_API_KEY` es inválida o sin saldo. Revisa https://platform.openai.com/account/billing |
| `ExecutionPolicy` bloquea el script | Ejecuta con `powershell -ExecutionPolicy Bypass -File ...` (ya está en los comandos). |
| Puerto ocupado | Cambia el puerto en `.env` (backend/frontend) o en `infra/docker-compose.yml` (Postgres/Redis). |
