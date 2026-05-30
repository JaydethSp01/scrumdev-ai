# ADR-003 — Estrategia de autenticación

- **Estado:** Aceptada
- **Fecha:** 2026-05-30
- **Contexto:** Guía Delfín — JWT para autenticación interna, secretos fuera del código (12-factor), auditoría de decisiones humanas.

## Decisión

- **Plataforma**: **JWT** (HS256) para autenticación; `JWT_SECRET_KEY` obligatorio y con *fail-fast* en producción (`shared/config/settings.py` aborta el arranque si falta en prod). Secretos SOLO en `.env` / gestor de secretos, nunca en código.
- **Servicio a servicio**: contratos HTTP internos protegidos con Circuit Breaker (`shared/clients/circuit_breaker.py`); en producción detrás del API Gateway.
- **Software generado (por cliente)**: cada app incluye `app/login` + endpoint `/auth/login` (JWT simple) en el backend FastAPI; el frontend habla con el backend vía `NEXT_PUBLIC_API_URL` con CORS controlado.
- **Auditoría**: `AuditEvent` + `HumanDecision` registran toda decisión humana (los 4 gates) con `correlation_id` para trazabilidad.

## Consecuencias

- ✅ Cumple 12-factor (config en entorno) y el hardening del taller 06 (`APP_DEBUG=false`, HTTPS en prod, tokens con permisos mínimos).
- ✅ Trazabilidad completa de aprobaciones humanas (gates) para cumplimiento.
- ⚠️ Render free tier sirve HTTPS por defecto; rotación de tokens es proceso operativo (ver SECURITY en ROADMAP).
