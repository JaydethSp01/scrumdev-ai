# Algoritmos para optimizar ScrumDev AI (análisis #130)

Objetivo: que un usuario NO técnico describa software y obtenga una app desplegada,
navegable y de **diseño 1A**, de forma consistente y rápida. No hace falta un
algoritmo exótico; lo que usan v0/Framer/Wix es la combinación de las técnicas de
abajo. Ordenadas por ROI.

## 1. Design-system fijo que la IA COMPONE  — ✅ IMPLEMENTADO
**Idea:** la IA deja de *inventar* estilos y *compone* con un UI-kit curado.
**Implementación:** `backend/shared/ui_kit/frontend/` (AppShell, Sidebar, Card,
MetricCard, DataTable, Badge, Button, PageHeader, EmptyState + `cn`). Se INYECTA en
cada proyecto (`_inject_ui_kit` en `app_generator.py`) y el brief le dice a Claude
que importe y use esos componentes. Color de marca por sector vía `_ensure_brand_color`.
**Por qué es la palanca #1:** elimina la varianza de calidad ("arreglo uno y sale peor").
El piso de diseño deja de depender de la suerte del prompt.

## 2. RAG / retrieval del mejor punto de partida — ✅ PARCIAL → plantillas
**Idea:** no generar desde cero; partir del build exitoso / plantilla más parecida.
**Implementación actual:** Stack Expert recupera exemplars por similitud. **Extensión:**
catálogo de PLANTILLAS 1A por sector (`shared/templates/`) con matching explicable
(`registry.match_templates`). El usuario elige en una galería con imagen; la plantilla
se adapta a su dominio. Mucho más rápido y arranca de calidad alta.

## 3. Juez visual como señal de recompensa — 🟡 EN CURSO
**Idea:** Claude-visión puntúa el screenshot; si reprueba, regenera. Y se GUARDA
(screenshot, score, qué se arregló) para aprender qué patrones puntúan alto → el ML
"reconoce diseño malo" (lo que pidió el usuario).
**Estado:** juez implementado y endurecido (`design_judge.py`). Bloqueo operativo:
chromium en el HF Space (proceso no-root, libs del navegador). Plan: mover el
screenshot a un servicio externo post-deploy (chromium-free) — el UI-kit ya garantiza
el piso, así que el juez pasa a ser mejora, no prerrequisito.

## 4. Best-of-N + panel de jueces — ⬜ PROPUESTO
Generar N variantes (distintos enfoques), juzgarlas y quedarse con la mejor. Sube el
techo de calidad a cambio de tokens. Útil para plantillas destacadas / demos.

## 5. Reparación por diff, no regen completa — ✅ PARCIAL
Cuando el juez rechaza, parchear SOLO lo malo en vez de reescribir todo (evita romper
otras vistas). Ya se acotó la regeneración al home + shell layout.

## 6. Bandit / scoring por sector — ⬜ PROPUESTO
Registrar tasa de éxito (build ok + score alto) por plantilla/approach y preferir las
ganadoras por sector. Mejora con el uso.

## Tríada de mayor impacto
**#1 (UI-kit) + #2 (plantillas/RAG) + #3 (juez como recompensa)** = el salto
exponencial. Las tres se refuerzan: el UI-kit hace que plantillas y generación
compartan calidad; las plantillas dan el mejor punto de partida; el juez cierra el
lazo y alimenta el aprendizaje.
