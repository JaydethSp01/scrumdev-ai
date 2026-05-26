.PHONY: help install infra-up infra-down infra-logs run stop test fmt lint frontend-install frontend-dev clean \
        docker-build docker-build-backend docker-build-frontend \
        docker-up-prod docker-down-prod docker-logs-prod \
        docker-up-staging docker-down-staging \
        deploy-staging deploy-prod rollback

PY := poetry run
BACKEND_DIR := backend
FRONTEND_DIR := frontend

# --- DevOps vars (sobreescribibles desde la linea de comandos) ---
IMAGE_TAG       ?= latest
BACKEND_IMAGE   ?= ghcr.io/scrumdev/scrumdev-backend
FRONTEND_IMAGE  ?= ghcr.io/scrumdev/scrumdev-frontend
COMPOSE_PROD    := docker compose -f infra/docker-compose.prod.yml
COMPOSE_STAGING := docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.staging.yml

help:
	@echo "ScrumDev AI - Comandos disponibles:"
	@echo ""
	@echo "  --- Dev local ---"
	@echo "  make install            Instala deps backend (poetry) y frontend (npm)"
	@echo "  make infra-up           Levanta Postgres + Redis (docker compose)"
	@echo "  make infra-down         Apaga infraestructura local"
	@echo "  make run                Levanta los 14 servicios backend en background"
	@echo "  make stop               Detiene backend + frontend"
	@echo "  make frontend-dev       Inicia el frontend Next.js"
	@echo "  make test               Corre tests pytest"
	@echo "  make e2e                Corre tests Playwright E2E"
	@echo "  make fmt                Formatea con ruff + black"
	@echo "  make lint               Lint con ruff y mypy"
	@echo "  make clean              Limpia caches y procesos"
	@echo ""
	@echo "  --- DevOps ---"
	@echo "  make docker-build       Build de imagenes backend + frontend"
	@echo "  make docker-up-prod     Levanta stack PROD completo (10 servicios + infra + nginx)"
	@echo "  make docker-down-prod   Apaga stack PROD"
	@echo "  make docker-up-staging  Levanta stack STAGING (sin temporal/rabbit)"
	@echo "  make docker-down-staging Apaga stack STAGING"
	@echo "  make deploy-staging     Deploy via scripts/deploy.sh staging"
	@echo "  make deploy-prod        Deploy via scripts/deploy.sh prod"
	@echo "  make rollback TAG=vX.Y.Z  Rollback a un tag previo en prod"

install:
	cd $(BACKEND_DIR) && poetry install
	cd $(FRONTEND_DIR) && npm install

infra-up:
	docker compose -f infra/docker-compose.yml up -d
	@echo "Postgres en 5434, Redis en 6379"

infra-down:
	docker compose -f infra/docker-compose.yml down

infra-logs:
	docker compose -f infra/docker-compose.yml logs -f

run:
	bash scripts/run_backend.sh

stop:
	bash scripts/stop_backend.sh
	@if [ -f .pids/frontend.pid ]; then kill $$(cat .pids/frontend.pid) 2>/dev/null || true; rm -f .pids/frontend.pid; echo "[STOP] frontend"; fi

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

test:
	cd $(BACKEND_DIR) && $(PY) pytest -q

e2e:
	cd $(FRONTEND_DIR) && npx playwright install --with-deps chromium && npx playwright test

fmt:
	cd $(BACKEND_DIR) && $(PY) ruff check --fix . && $(PY) black .

lint:
	cd $(BACKEND_DIR) && $(PY) ruff check . && $(PY) mypy shared services

clean:
	bash scripts/stop_backend.sh || true
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	rm -rf backend/.pytest_cache backend/.ruff_cache backend/.mypy_cache
	rm -rf frontend/.next frontend/node_modules/.cache

# ============================================================================
# DevOps targets
# ============================================================================

docker-build: docker-build-backend docker-build-frontend

docker-build-backend:
	docker build -f backend/Dockerfile -t $(BACKEND_IMAGE):$(IMAGE_TAG) .

docker-build-frontend:
	docker build -f frontend/Dockerfile \
		--build-arg NEXT_PUBLIC_API_GATEWAY_URL=/api \
		-t $(FRONTEND_IMAGE):$(IMAGE_TAG) .

docker-up-prod:
	IMAGE_TAG=$(IMAGE_TAG) BACKEND_IMAGE=$(BACKEND_IMAGE) FRONTEND_IMAGE=$(FRONTEND_IMAGE) \
		$(COMPOSE_PROD) up -d
	$(COMPOSE_PROD) ps

docker-down-prod:
	$(COMPOSE_PROD) down

docker-logs-prod:
	$(COMPOSE_PROD) logs -f --tail=100

docker-up-staging:
	IMAGE_TAG=$(IMAGE_TAG) BACKEND_IMAGE=$(BACKEND_IMAGE) FRONTEND_IMAGE=$(FRONTEND_IMAGE) \
		$(COMPOSE_STAGING) up -d
	$(COMPOSE_STAGING) ps

docker-down-staging:
	$(COMPOSE_STAGING) down

deploy-staging:
	IMAGE_TAG=$(IMAGE_TAG) BACKEND_IMAGE=$(BACKEND_IMAGE) FRONTEND_IMAGE=$(FRONTEND_IMAGE) \
		bash scripts/deploy.sh staging

deploy-prod:
	IMAGE_TAG=$(IMAGE_TAG) BACKEND_IMAGE=$(BACKEND_IMAGE) FRONTEND_IMAGE=$(FRONTEND_IMAGE) \
		bash scripts/deploy.sh prod

# Uso: make rollback TAG=v1.2.2
rollback:
	@if [ -z "$(TAG)" ]; then echo "Uso: make rollback TAG=vX.Y.Z"; exit 2; fi
	IMAGE_TAG=$(TAG) BACKEND_IMAGE=$(BACKEND_IMAGE) FRONTEND_IMAGE=$(FRONTEND_IMAGE) \
		bash scripts/rollback.sh $(TAG) prod
