# Quickstart - 5 minutos

## Pre-requisitos
- Python 3.11+, Poetry, Docker, Node 20+, Make.
- Una API key de Anthropic Claude (https://console.anthropic.com/).

## Paso 1. Configurar variables
```bash
cd scrumdev-ai
cp .env.example .env
# Edita .env y completa al menos:
#   SCRUMDEV_AI_API_KEY=sk-ant-...
```

## Paso 2. Levantar infraestructura
```bash
make infra-up
```

## Paso 3. Instalar dependencias
```bash
make install
```

## Paso 4. Arrancar backend
```bash
make run
```
Verifica:
```bash
bash scripts/smoke_test.sh
```

## Paso 5. Arrancar frontend
```bash
make frontend-dev
```
Abre http://localhost:3000.

## Detener todo
```bash
make stop
make infra-down
```

## Probar un crew via curl
```bash
curl -s -X POST http://localhost:8080/workflows/start \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "SDAI",
    "message": "Como usuario quiero iniciar sesion con email y password",
    "crew_name": "refinement"
  }' | jq .
```
