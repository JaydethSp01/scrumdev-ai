"""Taxonomía + semillas REALES curadas para entrenar las redes neuronales.

Estas semillas son el backbone real del dataset (historias etiquetadas a mano a
partir de la guía Delfín, los proyectos e2e que ya generamos —inventario,
facturación, e-commerce— y patrones de las áreas de producto). El script de
aumento (scripts/gen_dataset.py) las expande con el motor dual OpenAI/Claude.

La taxonomía es CONSISTENTE con los pipelines heurísticos previos
(story_classifier.TYPE_LABELS / AREA_LABELS, effort_estimator Fibonacci) para que
las redes puedan sustituirlos sin romper a los callers (patrón Adapter).
"""
from __future__ import annotations

# --- Taxonomía (orden estable = índice de clase de la red) -----------------
STORY_TYPES: list[str] = [
    "feature",          # nueva funcionalidad de valor para el usuario
    "bug",              # corrección de defecto
    "improvement",      # mejora de rendimiento/usabilidad/calidad
    "spike",            # investigación / PoC
    "chore",            # tarea técnica interna / infra / refactor
    "documentation",    # documentación
]

STORY_AREAS: list[str] = [
    "frontend",
    "backend",
    "data",
    "devops",
    "security",
    "ml_ai",
    "integration",
]

# Escalera Fibonacci de story points (índice = clase ordinal)
FIBONACCI: list[int] = [1, 2, 3, 5, 8, 13, 21]

TYPE_TO_IDX = {t: i for i, t in enumerate(STORY_TYPES)}
AREA_TO_IDX = {a: i for i, a in enumerate(STORY_AREAS)}
POINTS_TO_IDX = {p: i for i, p in enumerate(FIBONACCI)}


def points_to_class(points: int) -> int:
    """Mapea unos puntos arbitrarios a la clase Fibonacci más cercana."""
    nearest = min(FIBONACCI, key=lambda x: abs(x - points))
    return POINTS_TO_IDX[nearest]


# --- Semillas reales curadas -----------------------------------------------
# Cada item: (texto, tipo, area, story_points). Cubre los 6 tipos, 7 áreas y
# toda la escalera Fibonacci, con vocabulario realista de los dominios que la
# plataforma genera (inventario, facturación, e-commerce, SaaS, agendamiento).
SEED_STORIES: list[tuple[str, str, str, int]] = [
    # --- feature / frontend ---
    ("Como gerente de inventario quiero un dashboard principal con KPIs en tiempo real para monitorear la operación desde un solo lugar", "feature", "frontend", 5),
    ("Como usuario quiero ver el catálogo de productos en una grilla con imágenes, filtros por categoría y buscador para encontrar rápido lo que necesito", "feature", "frontend", 8),
    ("Como cliente quiero un carrito de compras donde pueda ajustar cantidades y ver el subtotal antes de pagar", "feature", "frontend", 5),
    ("Como vendedor quiero una vista de detalle del producto con galería de imágenes, descripción y stock disponible", "feature", "frontend", 3),
    ("Como usuario quiero un selector de idioma en la barra de navegación para usar la app en español o inglés", "feature", "frontend", 3),
    ("Como administrador quiero un formulario para crear y editar productos con validación en línea de los campos obligatorios", "feature", "frontend", 5),

    # --- feature / backend ---
    ("Como gerente de inventario quiero crear, consultar, editar y eliminar productos para mantener actualizado el catálogo del negocio", "feature", "backend", 5),
    ("Como sistema quiero exponer un endpoint REST que devuelva el stock actual por bodega para alimentar el dashboard", "feature", "backend", 3),
    ("Como bodeguero quiero registrar la recepción de pedidos y seguir su estado para que el inventario refleje lo realmente recibido", "feature", "backend", 8),
    ("Como negocio quiero que el sistema sugiera órdenes de reposición según el stock mínimo y la rotación para agilizar la compra a proveedores", "feature", "backend", 8),
    ("Como contador quiero generar facturas electrónicas a partir de una venta y guardarlas con su consecutivo fiscal", "feature", "backend", 13),
    ("Como usuario quiero recuperar mi contraseña mediante un enlace enviado a mi correo con expiración de una hora", "feature", "backend", 5),

    # --- feature / security ---
    ("Como gerente quiero iniciar sesión de forma segura con un rol asignado para acceder solo a las funciones permitidas según mi perfil", "feature", "security", 5),
    ("Como administrador quiero habilitar autenticación multifactor con OTP para proteger las cuentas con permisos elevados", "feature", "security", 8),
    ("Como plataforma quiero firmar y verificar los webhooks entrantes con HMAC para rechazar payloads no autorizados", "feature", "security", 5),
    ("Como responsable de seguridad quiero un control de acceso basado en roles y permisos granular por módulo", "feature", "security", 8),

    # --- feature / integration ---
    ("Como negocio quiero integrar el pago en línea con Stripe para cobrar tarjetas en el checkout", "feature", "integration", 13),
    ("Como equipo quiero sincronizar las historias de usuario con Jira creando issues automáticamente al aprobar el backlog", "feature", "integration", 8),
    ("Como operación quiero conectar la plataforma con Shopify para importar productos y niveles de inventario", "feature", "integration", 13),
    ("Como usuario quiero recibir notificaciones por correo cuando un pedido cambia de estado, usando un proveedor SMTP externo", "feature", "integration", 5),

    # --- feature / data ---
    ("Como analista quiero un informe de productos más vendidos y su rotación para identificar productos clave y optimizar las compras", "feature", "data", 5),
    ("Como gerente quiero consultar el valor total del inventario por bodega y consolidado para conocer el capital inmovilizado", "feature", "data", 5),
    ("Como sistema quiero un modelo de datos para versiones, sprints y tareas con sus relaciones para soportar el ciclo de vida del producto", "feature", "data", 8),

    # --- feature / ml_ai ---
    ("Como producto quiero un asistente conversacional que responda preguntas sobre el proyecto usando el contexto del backlog", "feature", "ml_ai", 13),
    ("Como negocio quiero un modelo que prediga la demanda semanal por producto para anticipar reposiciones", "feature", "ml_ai", 13),
    ("Como plataforma quiero clasificar automáticamente las historias por tipo y área con un modelo de embeddings", "feature", "ml_ai", 8),

    # --- feature / devops ---
    ("Como equipo quiero desplegar automáticamente el frontend a Vercel y el backend a Render al aprobar el release", "feature", "devops", 8),
    ("Como operación quiero un pipeline de CI que ejecute pruebas y bloquee el merge si fallan", "feature", "devops", 5),

    # --- bug ---
    ("En el dashboard principal los números de las métricas se ven muy pequeños y sin jerarquía visual; ajustar tipografía grande, negrita y mejor contraste para leerlos de un vistazo", "bug", "frontend", 3),
    ("El catálogo se ve roto en móvil: las tarjetas se desbordan y el buscador queda tapado; corregir el responsive en pantallas menores a 480px", "bug", "frontend", 3),
    ("Al guardar un producto sin precio la API responde 500 en vez de 422 con el detalle de validación; corregir el manejo de error", "bug", "backend", 2),
    ("El cálculo de stock disponible no descuenta las reservas pendientes, mostrando más unidades de las reales", "bug", "backend", 5),
    ("El login permite más de 5 intentos sin bloqueo, exponiendo a fuerza bruta; añadir rate limiting por IP", "bug", "security", 5),
    ("La sincronización con Jira duplica issues cuando el webhook se reintenta; hacer la operación idempotente por clave de historia", "bug", "integration", 5),
    ("El informe de ventas suma mal cuando hay devoluciones, contando montos negativos como positivos", "bug", "data", 3),
    ("El deploy a Render falla porque Python 3.14 rompe pydantic; fijar PYTHON_VERSION a 3.12", "bug", "devops", 2),

    # --- improvement ---
    ("Mejorar el tiempo de carga del listado de productos paginando del lado del servidor y cacheando la primera página", "improvement", "backend", 5),
    ("Mejorar los estilos del selector de versión: más contraste, foco visible y estados hover para mejor usabilidad", "improvement", "frontend", 2),
    ("Optimizar la consulta del dashboard agregando índices a las columnas de fecha y bodega para reducir la latencia", "improvement", "data", 3),
    ("Reducir el tamaño de la imagen Docker del backend usando multi-stage build y dependencias slim", "improvement", "devops", 3),
    ("Mejorar la accesibilidad del formulario de checkout con etiquetas aria y navegación por teclado", "improvement", "frontend", 3),

    # --- spike ---
    ("Investigar si conviene usar pgvector o un índice externo para la búsqueda semántica de exemplars", "spike", "ml_ai", 3),
    ("Prueba de concepto para generar facturación electrónica con la DIAN y validar el formato XML requerido", "spike", "integration", 5),
    ("Explorar estrategias de caché (Redis vs in-memory) para los KPIs del dashboard en tiempo real", "spike", "backend", 3),
    ("Evaluar proveedores de despliegue (Render, Railway, Fly) para el backend FastAPI por costo y arranque en frío", "spike", "devops", 2),

    # --- chore ---
    ("Refactorizar el servicio de inventario para separar la capa de dominio de la de persistencia", "chore", "backend", 5),
    ("Migrar las variables de entorno a un único módulo de settings tipado con pydantic", "chore", "backend", 3),
    ("Configurar linters (ruff, eslint) y formateadores en el pre-commit del repositorio", "chore", "devops", 2),
    ("Añadir un esquema de migraciones Alembic para versionar los cambios de base de datos", "chore", "data", 5),
    ("Limpiar dependencias sin uso del pyproject y actualizar el lockfile", "chore", "devops", 1),

    # --- documentation ---
    ("Documentar la arquitectura del sistema en un ADR explicando la elección de monolito modular", "documentation", "backend", 3),
    ("Escribir la guía de onboarding para conectar el Jira propio del cliente paso a paso", "documentation", "integration", 2),
    ("Documentar los endpoints de la API en OpenAPI con ejemplos de request y response", "documentation", "backend", 3),
    ("Crear un README con instrucciones para correr el proyecto en local con docker compose", "documentation", "devops", 2),

    # --- extremos de esfuerzo ---
    ("Corregir un typo en el botón de 'Guardar' que dice 'Gardar'", "bug", "frontend", 1),
    ("Cambiar el color del badge de estado de gris a verde cuando el pedido está completado", "improvement", "frontend", 1),
    ("Construir el módulo completo de facturación electrónica: generación de facturas, control de pagos, reportes fiscales e integración con la autoridad tributaria", "feature", "backend", 21),
    ("Implementar un motor de reposición automática multi-bodega con predicción de demanda, reglas de proveedor y generación de órdenes de compra", "feature", "ml_ai", 21),
]


# --- Manifiestos semilla de builds EXITOSOS por stack (para BuildMemory) ----
# Visión + manifiesto de archivos por tier de un proyecto que compiló y desplegó
# OK. Son los exemplars few-shot que guían a la IA. ALINEADOS al contrato real
# del blueprint (required_files + entrypoints) + archivos de dominio.
_FE_BASE = [
    "package.json", "next.config.mjs", "tailwind.config.ts", "postcss.config.mjs",
    "tsconfig.json", "app/layout.tsx", "app/page.tsx", "app/globals.css",
    "lib/api.ts", "lib/types.ts", ".env.example", "README.md",
]
_BE_BASE = [
    "main.py", "requirements.txt", "runtime.txt", "Dockerfile",
    "app/__init__.py", "app/db.py", "app/models.py", "app/config.py",
    ".env.example", "README.md",
]

SEED_BUILDS: list[dict] = [
    {
        "stack": "nextjs-fastapi-postgres",
        "vision": "Sistema de gestión de inventario para un minorista: catálogo de productos, control de stock por bodega, proveedores, alertas de bajo inventario y dashboard de KPIs.",
        "manifest": {
            "frontend": _FE_BASE + [
                "app/productos/page.tsx", "app/inventario/page.tsx", "app/proveedores/page.tsx",
                "components/ProductTable.tsx", "components/KpiCard.tsx",
            ],
            "backend": _BE_BASE + [
                "app/routers/products.py", "app/routers/inventory.py", "app/routers/suppliers.py",
                "app/schemas.py", "app/services/stock_service.py",
            ],
        },
    },
    {
        "stack": "nextjs-fastapi-postgres",
        "vision": "Plataforma de e-commerce con catálogo, carrito, checkout con pagos, gestión de pedidos y panel de administración.",
        "manifest": {
            "frontend": _FE_BASE + [
                "app/cart/page.tsx", "app/checkout/page.tsx", "app/orders/page.tsx",
                "app/admin/page.tsx", "components/ProductCard.tsx", "components/CheckoutForm.tsx",
            ],
            "backend": _BE_BASE + [
                "app/routers/products.py", "app/routers/orders.py", "app/routers/auth.py",
                "app/routers/payments.py", "app/services/payment_service.py", "app/schemas.py",
            ],
        },
    },
    {
        "stack": "nextjs-fastapi-postgres",
        "vision": "SaaS de agendamiento de citas para clínicas: calendario, profesionales, reservas, recordatorios por correo y reportes.",
        "manifest": {
            "frontend": _FE_BASE + [
                "app/calendar/page.tsx", "app/bookings/page.tsx", "app/professionals/page.tsx",
                "components/Calendar.tsx", "components/BookingForm.tsx",
            ],
            "backend": _BE_BASE + [
                "app/routers/appointments.py", "app/routers/professionals.py", "app/routers/auth.py",
                "app/services/notification_service.py", "app/schemas.py",
            ],
        },
    },
    {
        "stack": "nextjs-static",
        "vision": "Landing page corporativa de una agencia con secciones de servicios, portafolio, equipo y formulario de contacto.",
        "manifest": {
            "frontend": [f for f in _FE_BASE if f != "lib/api.ts"] + [
                "app/servicios/page.tsx", "app/portafolio/page.tsx", "app/contacto/page.tsx",
                "components/Hero.tsx", "components/ServiceCard.tsx", "components/ContactForm.tsx",
            ],
        },
    },
    {
        "stack": "nextjs-static",
        "vision": "Portafolio personal de un desarrollador con proyectos, blog estático y sobre mí.",
        "manifest": {
            "frontend": [f for f in _FE_BASE if f != "lib/api.ts"] + [
                "app/projects/page.tsx", "app/blog/page.tsx", "app/about/page.tsx",
                "components/ProjectCard.tsx", "components/Nav.tsx",
            ],
        },
    },
]
