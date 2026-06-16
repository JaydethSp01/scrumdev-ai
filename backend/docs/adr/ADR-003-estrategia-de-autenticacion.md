## Title
ADR-003: Autenticación con JWT de acceso corto y refresh token rotativo en cookie HttpOnly

## Status
proposed

## Context
El proyecto CLAUDETEST08 requiere autenticar usuarios para acceder a sus tareas personales (S-002), sobre una arquitectura monolítica modular con SPA cliente y backend API REST (ADR-001). La SPA consume endpoints autenticados desde rutas protegidas definidas en el shell de UI (S-003).

Restricciones y supuestos:
- Alcance acotado: una sola aplicación cliente, sin federación de identidad ni SSO de terceros en esta fase.
- API REST stateless: se evita mantener sesiones en memoria del servidor para facilitar despliegues y escalado horizontal futuro.
- Equipo reducido y entrega rápida: se prioriza estándar maduro con librerías ampliamente soportadas.
- Riesgos de seguridad mínimos a mitigar: XSS (robo de token desde `localStorage`), CSRF (cookies de sesión clásicas), y exposición prolongada por tokens de vida larga.
- Debe permitir cierre de sesión efectivo y revocación ante compromiso de credenciales.

Opciones evaluadas:
1. Sesiones con cookie de servidor (server-side session store).
2. JWT de acceso largo almacenado en `localStorage`.
3. JWT de acceso corto + refresh token rotativo en cookie `HttpOnly` (híbrido).
4. Proveedor externo (Auth0/Clerk/Cognito).

## Decision
Se adopta un esquema híbrido basado en **JSON Web Tokens (JWT)** emitidos por el backend:

- **Access token JWT** firmado con HS256, vida corta (15 min), enviado por la SPA en el header `Authorization: Bearer <token>` y mantenido únicamente en memoria (no `localStorage` ni `sessionStorage`).
- **Refresh token** opaco (UUID + hash en BD), vida 7 días, entregado en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, con path acotado a `/auth/refresh`.
- **Rotación**: cada `/auth/refresh` invalida el refresh anterior y emite uno nuevo; detección de reuso revoca toda la familia de tokens del usuario.
- **Revocación**: tabla `refresh_tokens` en la BD del módulo de autenticación, permitiendo logout efectivo y bloqueo ante compromiso.
- **Claims mínimos**: `sub` (userId), `iat`, `exp`, `roles` (preparado para futura autorización granular).
- **Hash de contraseñas**: `bcrypt` con cost factor 12 al registrar/validar credenciales (S-002).
- Secreto de firma gestionado vía variable de entorno (`JWT_SECRET`), distinto por entorno.

Justificación técnica:
- Mantener el access token en memoria neutraliza el vector XSS habitual de `localStorage`.
- El refresh en cookie `HttpOnly` + `SameSite=Strict` mitiga XSS y CSRF simultáneamente sin requerir doble-submit token en esta fase.
- La rotación con detección de reuso ofrece revocación práctica sin renunciar al beneficio stateless del access token.
- Evita la complejidad operativa y el costo de un proveedor externo, coherente con el alcance acotado (VISION) y la decisión monolítica modular (ADR-001).

## Consequences

**Positivas**
- API stateless en el camino crítico: la validación del access token no requiere consulta a BD.
- Superficie de ataque reducida frente a XSS y CSRF respecto a alternativas más simples.
- Logout y revocación efectivos gracias al almacenamiento del refresh token.
- Base preparada para roles/permisos futuros mediante claims.

**Negativas**
- Mayor complejidad en el cliente: gestión del access token en memoria, manejo de expiración y reintento automático tras `/auth/refresh`.
- Pérdida del access token al recargar la pestaña: se requiere refresh silencioso al arrancar la SPA.
- La rotación con detección de reuso añade una tabla y lógica de familia de tokens al módulo de autenticación.
- Necesidad de operar correctamente HTTPS en todos los entornos no locales para que `Secure` sea válido.

**Neutrales**
- Acopla la SPA a un flujo de bootstrap que llama a `/auth/refresh` antes de renderizar rutas protegidas (S-003).
- El secreto de firma debe rotarse periódicamente; se difiere la política exacta a un ADR operativo posterior.
- Si en el futuro se incorpora SSO o múltiples clientes, será necesario reevaluar (posible migración a OAuth2/OIDC con proveedor externo).

---
_Author: ScrumDev AI (`adr_generator.py`)_
_Project: CLAUDETEST08_
_Date: 2026-06-16T02:04:22.755777+00:00_
_File: docs/adr/ADR-003-estrategia-de-autenticacion.md_
