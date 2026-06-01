"""Catálogo de PLANTILLAS 1A por sector.

Cada plantilla describe un tipo de software completo y profesional. El usuario
NO técnico elige una en una galería con imagen (como Vercel/Framer) y la
plataforma extrae sus archivos del repo de plantillas y los ADAPTA a su dominio
con Claude — mucho más rápido y de calidad alta que generar desde cero.

El catálogo es solo METADATA (sector, tipo, entidades, color, tags, preview). Los
ARCHIVOS reales de cada plantilla viven en el repo de plantillas bajo
`templates/<id>/files/...` y su screenshot en `templates/<id>/preview.png`;
ambos se generan con `scripts/seed_templates.py` (pipeline + juez visual).

Diseñado para CRECER: añadir un sector = añadir una entrada aquí. Nada más.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Template:
    id: str                       # slug único, ej "retail-inventory-pro"
    name: str                     # nombre visible, ej "Inventory Pro"
    sector: str                   # sector empresa, ej "retail"
    sector_label: str             # etiqueta visible del sector
    software_type: str            # tipo de software, ej "saas_crud" | "landing" | ...
    stack: str                    # blueprint stack id
    description: str              # 1-2 frases para la tarjeta de la galería
    entities: list[str]           # entidades del dominio (productos, citas, ...)
    brand_color: str              # color de marca de la plantilla
    tags: list[str] = field(default_factory=list)  # palabras clave para el matching
    accent: str = ""              # color de acento opcional
    has_files: bool = False       # True cuando la plantilla ya está seedeada en el repo

    def to_public(self) -> dict:
        """Vista pública para la galería (incluye URL de preview en el repo)."""
        d = asdict(self)
        d["preview_url"] = preview_url(self.id)
        return d


# Repo de plantillas (público, para que Vercel/Render/el front puedan leer raw).
TEMPLATES_REPO = "JaydethSp01/scrumdev-templates"
TEMPLATES_BRANCH = "main"


def preview_url(template_id: str) -> str:
    return (
        f"https://raw.githubusercontent.com/{TEMPLATES_REPO}/"
        f"{TEMPLATES_BRANCH}/templates/{template_id}/preview.png"
    )


# ── CATÁLOGO ─────────────────────────────────────────────────────────────────
# Amplio, por sectores. has_files se marca True por seed_templates.py al subir.
CATALOG: list[Template] = [
    Template("retail-inventory-pro", "Inventory Pro", "retail", "Retail / Inventario",
             "saas_crud", "nextjs-fastapi-postgres",
             "Control de inventario con stock por talla, proveedores, alertas y dashboard.",
             ["producto", "categoria", "proveedor", "stock", "alerta"], "#4f46e5",
             ["inventario", "stock", "almacen", "productos", "pos", "tienda"]),
    Template("retail-pos", "POS Caja", "retail", "Retail / Punto de venta",
             "saas_crud", "nextjs-fastapi-postgres",
             "Punto de venta: ventas, caja, productos y reportes diarios.",
             ["venta", "producto", "caja", "cliente"], "#0ea5e9",
             ["pos", "caja", "ventas", "ticket", "facturacion"]),
    Template("salud-citas", "CliniCitas", "salud", "Salud / Citas",
             "saas_crud", "nextjs-fastapi-postgres",
             "Agenda de citas médicas: pacientes, profesionales, horarios y recordatorios.",
             ["paciente", "cita", "profesional", "especialidad"], "#0d9488",
             ["clinica", "citas", "medico", "agenda", "pacientes", "salud", "consultorio"]),
    Template("salud-historia", "Historia Clínica", "salud", "Salud / Expediente",
             "saas_crud", "nextjs-fastapi-postgres",
             "Expediente clínico: pacientes, consultas, diagnósticos y tratamientos.",
             ["paciente", "consulta", "diagnostico", "tratamiento"], "#14b8a6",
             ["historia clinica", "expediente", "diagnostico", "salud"]),
    Template("ecommerce-fashion", "Moda Store", "ecommerce", "E-commerce / Tienda",
             "saas_crud", "nextjs-fastapi-postgres",
             "Tienda online: catálogo, carrito, pedidos y gestión de productos.",
             ["producto", "categoria", "pedido", "cliente"], "#db2777",
             ["ecommerce", "tienda", "carrito", "pedidos", "catalogo", "ropa"]),
    Template("ecommerce-b2b", "Catálogo B2B", "ecommerce", "E-commerce / Mayorista",
             "saas_crud", "nextjs-fastapi-postgres",
             "Catálogo mayorista con listas de precio, clientes y cotizaciones.",
             ["producto", "cliente", "cotizacion", "lista_precio"], "#be185d",
             ["b2b", "mayorista", "cotizacion", "catalogo"]),
    Template("saas-crm", "CRM Ventas", "saas", "SaaS / CRM",
             "saas_crud", "nextjs-fastapi-postgres",
             "CRM de ventas: leads, oportunidades, contactos y embudo.",
             ["lead", "oportunidad", "contacto", "actividad"], "#7c3aed",
             ["crm", "ventas", "leads", "pipeline", "embudo", "clientes"]),
    Template("saas-dashboard", "Métricas Dashboard", "saas", "SaaS / Dashboard",
             "saas_crud", "nextjs-fastapi-postgres",
             "Panel de métricas con KPIs, gráficas y tablas de seguimiento.",
             ["metrica", "reporte", "usuario"], "#2563eb",
             ["dashboard", "metricas", "kpi", "analytics", "panel"]),
    Template("saas-helpdesk", "HelpDesk", "saas", "SaaS / Soporte",
             "saas_crud", "nextjs-fastapi-postgres",
             "Mesa de ayuda: tickets, agentes, prioridades y SLA.",
             ["ticket", "agente", "cliente", "categoria"], "#6366f1",
             ["helpdesk", "tickets", "soporte", "sla", "mesa de ayuda"]),
    Template("educacion-lms", "LMS Cursos", "educacion", "Educación / LMS",
             "saas_crud", "nextjs-fastapi-postgres",
             "Plataforma de cursos: lecciones, estudiantes, progreso y certificados.",
             ["curso", "leccion", "estudiante", "matricula"], "#2563eb",
             ["lms", "cursos", "educacion", "estudiantes", "elearning"]),
    Template("educacion-alumnos", "Gestión Alumnos", "educacion", "Educación / Escolar",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión escolar: alumnos, calificaciones, asistencia y materias.",
             ["alumno", "materia", "calificacion", "asistencia"], "#1d4ed8",
             ["colegio", "escuela", "alumnos", "notas", "asistencia"]),
    Template("restaurante-pedidos", "Resto Pedidos", "restaurante", "Restaurante / Pedidos",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de restaurante: menú, mesas, pedidos y cocina.",
             ["plato", "mesa", "pedido", "categoria"], "#ea580c",
             ["restaurante", "menu", "pedidos", "mesas", "cocina", "food"]),
    Template("logistica-flota", "Flota Envíos", "logistica", "Logística / Flota",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de envíos y flota: rutas, vehículos, conductores y tracking.",
             ["envio", "vehiculo", "conductor", "ruta"], "#0891b2",
             ["logistica", "envios", "flota", "tracking", "rutas", "transporte"]),
    Template("inmobiliaria-listados", "Inmo Listados", "inmobiliaria", "Inmobiliaria",
             "saas_crud", "nextjs-fastapi-postgres",
             "Portal inmobiliario: propiedades, agentes, visitas y clientes.",
             ["propiedad", "agente", "visita", "cliente"], "#0f766e",
             ["inmobiliaria", "propiedades", "bienes raices", "alquiler", "venta"]),
    Template("fintech-facturacion", "Facturación", "fintech", "Fintech / Facturación",
             "saas_crud", "nextjs-fastapi-postgres",
             "Facturación y gastos: facturas, clientes, pagos e impuestos.",
             ["factura", "cliente", "pago", "gasto"], "#059669",
             ["fintech", "facturacion", "facturas", "gastos", "pagos", "contabilidad"]),
    Template("gimnasio-membresias", "Gym Membresías", "gimnasio", "Gimnasio / Fitness",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de gimnasio: socios, membresías, clases y asistencia.",
             ["socio", "membresia", "clase", "asistencia"], "#dc2626",
             ["gimnasio", "gym", "fitness", "membresias", "clases", "socios"]),
    Template("belleza-reservas", "Spa Reservas", "belleza", "Belleza / Spa / Barbería",
             "saas_crud", "nextjs-fastapi-postgres",
             "Reservas de servicios: clientes, profesionales, agenda y servicios.",
             ["cliente", "servicio", "profesional", "reserva"], "#db2777",
             ["barberia", "spa", "belleza", "salon", "reservas", "estetica"]),
    Template("eventos-tickets", "Eventos & Tickets", "eventos", "Eventos / Tickets",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de eventos: agenda, venta de entradas, asistentes y aforo.",
             ["evento", "entrada", "asistente", "categoria"], "#7c3aed",
             ["eventos", "tickets", "entradas", "conciertos", "aforo"]),
    Template("rrhh-personal", "RRHH Personal", "rrhh", "RRHH / Nómina",
             "saas_crud", "nextjs-fastapi-postgres",
             "Recursos humanos: empleados, asistencia, vacaciones y nómina.",
             ["empleado", "asistencia", "vacacion", "departamento"], "#4338ca",
             ["rrhh", "nomina", "empleados", "vacaciones", "asistencia", "talento"]),
    Template("legal-casos", "Despacho Legal", "legal", "Legal / Despacho",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de despacho: casos, clientes, audiencias y documentos.",
             ["caso", "cliente", "audiencia", "documento"], "#1d4ed8",
             ["legal", "abogados", "despacho", "casos", "expedientes"]),
    Template("turismo-hotel", "Hotel Reservas", "turismo", "Turismo / Hotelería",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión hotelera: habitaciones, reservas, huéspedes y ocupación.",
             ["habitacion", "reserva", "huesped", "servicio"], "#0284c7",
             ["hotel", "turismo", "reservas", "habitaciones", "huespedes", "hosteleria"]),
    Template("agro-cultivos", "AgroTech", "agro", "Agricultura / AgroTech",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión agrícola: cultivos, parcelas, cosechas e insumos.",
             ["cultivo", "parcela", "cosecha", "insumo"], "#16a34a",
             ["agro", "agricultura", "cultivos", "cosecha", "campo", "finca"]),
    Template("manufactura-produccion", "Producción", "manufactura", "Manufactura",
             "saas_crud", "nextjs-fastapi-postgres",
             "Órdenes de producción: productos, materiales, máquinas y lotes.",
             ["orden", "producto", "material", "maquina"], "#475569",
             ["manufactura", "produccion", "fabrica", "ordenes", "lotes"]),
    Template("ong-donaciones", "ONG Donaciones", "ong", "ONG / Sin fines de lucro",
             "saas_crud", "nextjs-fastapi-postgres",
             "Gestión de ONG: donantes, donaciones, voluntarios y campañas.",
             ["donante", "donacion", "voluntario", "campana"], "#16a34a",
             ["ong", "donaciones", "voluntarios", "fundacion", "campanas"]),
    Template("landing-startup", "Startup Launch", "landing", "Landing / Marketing",
             "landing", "nextjs-static",
             "Landing de producto: hero, features, testimonios, precios y CTA.",
             [], "#4f46e5",
             ["landing", "startup", "marketing", "producto", "lanzamiento", "saas"]),
    Template("landing-restaurante", "Resto Landing", "landing", "Landing / Restaurante",
             "landing", "nextjs-static",
             "Landing de restaurante: hero, menú destacado, galería y reservas.",
             [], "#ea580c",
             ["landing", "restaurante", "menu", "reservas", "comida"]),
]


CATALOG_BY_ID = {t.id: t for t in CATALOG}

# Plantillas YA seedeadas en el repo (files + preview.png). Marcar aquí al subir
# una plantilla con scripts/seed_templates.py o manualmente.
_SEEDED = {"retail-inventory-pro", "salud-citas"}
for _sid in _SEEDED:
    if _sid in CATALOG_BY_ID:
        CATALOG_BY_ID[_sid].has_files = True


def all_templates() -> list[Template]:
    return list(CATALOG)


def get_template(template_id: str) -> Template | None:
    return CATALOG_BY_ID.get(template_id)
