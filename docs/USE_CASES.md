# ScrumDev AI - Casos de uso end-to-end

Todos los ejemplos asumen `make infra-up && make run && make frontend-dev`.

---

## 1. Refinamiento simple de una historia

```bash
curl -s -X POST http://localhost:8080/workflows/start \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "DEMO",
    "message": "Como cliente quiero pagar con tarjeta Stripe con 3DS",
    "crew_name": "refinement"
  }' | jq '.result.output' | head -50
```

El crew `refinement` ejecuta: **ML analyze → PO refina** -> markdown con historia
reescrita, criterios G/W/T, DoD, riesgos y estimacion.

---

## 2. Flujo completo SDLC con state machine + HITL

### 2.1 Capturar NFR
```bash
NFR_ID=$(curl -s -X POST http://localhost:8080/nfr \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "DEMO",
    "issue_key": "DEMO-1",
    "nfr_data": {
      "scalability": {"expected_users": 10000, "high_growth": true},
      "availability": {"requires_24_7": true, "max_downtime": "4h/mes"},
      "security": {"sensitive_data": true, "auth_required": true, "rbac": true, "audit_required": true},
      "integrations": {"required": true, "systems": ["Jira", "Stripe"]},
      "performance": {"response_time": "<500ms"},
      "deployment": {"target": "cloud", "budget": "medio"},
      "maintainability": {"multiple_developers": true}
    }
  }' | jq -r .nfr_id)
echo "NFR creado: $NFR_ID"
```

### 2.2 Generar arquitectura desde NFR
```bash
curl -s -X POST http://localhost:8080/workflows/advance \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "DEMO",
    "issue_key": "DEMO-1",
    "target_state": "ARCHITECTURE_INCEPTION",
    "context": {"requirements": "Sistema de pagos PCI", "story": "Pago seguro"}
  }' | jq '.output' | head -80
```

### 2.3 Solicitar aprobacion humana
```bash
DECISION_ID=$(curl -s -X POST http://localhost:8080/workflows/advance \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "DEMO",
    "target_state": "ARCHITECTURE_APPROVAL_PENDING",
    "context": {"summary": "Arquitectura propuesta lista"}
  }' | jq -r .pending_decision_id)
echo "Decision pendiente: $DECISION_ID"
```

### 2.4 Aprobar (o rechazar)
```bash
curl -s -X POST "http://localhost:8080/decisions/$DECISION_ID/approve" \
  -H "Content-Type: application/json" \
  -d '{"decided_by": "demo", "decision_reason": "Cumple PCI y NFR"}' | jq .
```

---

## 3. Generar ADR de una decision arquitectonica

```bash
curl -s -X POST http://localhost:8080/adr/generate \
  -H "Content-Type: application/json" \
  -d '{
    "project_key": "DEMO",
    "adr_number": 1,
    "topic": "Eleccion de pasarela de pagos",
    "context": "Equipo pequeno, presupuesto bajo, evitar PCI scope completo",
    "nfr_data": {"security": {"sensitive_data": true}}
  }' | jq -r .markdown
```

Salida: ADR en formato MADR (Title, Status, Context, Decision, Consequences).

---

## 4. Evaluar codigo contra policies YAML

```bash
curl -s -X POST http://localhost:8080/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "project_key": "DEMO",
    "artifact_type": "code",
    "artifact_reference": "checkout.py",
    "content": "api_key = \"sk-prod-xxx\"\nquery = f\"SELECT * FROM users WHERE id={user_id}\"",
    "policies": ["twelve-factor-policy", "security-policy"]
  }' | jq .
```

Detecta: `hardcoded_secrets_forbidden` (twelve-factor), `owasp_injection` (security).

---

## 5. Memoria semantica RAG

```bash
# Guardar contexto
curl -s -X POST http://localhost:8080/memory/save \
  -H "Content-Type: application/json" \
  -d '{"namespace": "DEMO", "content": "Decidimos usar Stripe para 3DS"}' | jq .

# Buscar por similitud (no por palabras exactas)
curl -s -X POST http://localhost:8080/memory/search \
  -H "Content-Type: application/json" \
  -d '{"namespace": "DEMO", "query": "que pasarela escogimos", "top_k": 3}' | jq .
```

---

## 6. ML local: clasificar + estimar + riesgos

```bash
curl -s -X POST http://localhost:8080/ml/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "Implementar login OAuth con Google y MFA"}' | \
  jq '{type: .classification.type, area: .classification.area, points: .effort.story_points, risks: .risks.risks | map(.type)}'
```

---

## 7. Auth real (JWT)

```bash
# Register
TOKEN=$(curl -s -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@scrumdev.ai","password":"secret123","name":"Dev"}' | jq -r .access_token)

# Crear proyecto (en futuro con Auth header)
curl -s -X POST http://localhost:8080/projects \
  -H "Content-Type: application/json" \
  -d '{"key":"P1","name":"Mi Proyecto"}' | jq .
```

---

## 8. Connector Jira/GitHub (con credenciales reales en .env)

```bash
# Crear issue Jira (mock si no hay credenciales)
curl -s -X POST http://localhost:8004/issues \
  -H "Content-Type: application/json" \
  -d '{"summary":"Test E2E", "description":"Creado desde ScrumDev AI"}' | jq .

# Crear PR GitHub
curl -s -X POST http://localhost:8005/pulls \
  -H "Content-Type: application/json" \
  -d '{"title":"feat: nueva feature","head":"feature/x","base":"main","body":"PR generado"}' | jq .
```

---

## 9. Activar Temporal real (workflows durables)

En `.env`:
```env
TEMPORAL_ENABLED=true
```

Levantar Temporal:
```bash
docker compose -f infra/docker-compose.full.yml up -d temporal
```

Arrancar worker:
```bash
cd backend && poetry run python -m temporal.worker
```

Reiniciar orchestrator (toma flag). Cualquier `/workflows/start` ahora pasa por
workflow durable (reintentos, persistencia, recovery).

---

## 10. Frontend completo

Abrir http://localhost:3000:
- **/** landing
- **/login** + **/register** auth real
- **/projects** lista de proyectos del backend
- **/projects/{key}** tabs: **Chat** | **Workflows** | **Agentes** | **NFR** | **Arquitectura** | **Decisiones** | **ML insights** | **Audit log**
- **/workflows** salud sistema (14 servicios)
