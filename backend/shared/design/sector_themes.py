"""Temas de diseño por sector — derivados del skill ui-ux-pro-max (paletas +
font pairings) y curados para verse profesional 1A.

Cada tema: color primario (marca) + acento + par tipográfico (heading/body).
`pick_theme(text)` matchea por palabras clave del sector/visión. El build_gate
usa esto para inyectar la tipografía correcta y un acento coherente, de modo que
CADA sector se ve distinto (no todo igual ni "básico")."""
from __future__ import annotations


# heading/body son familias de Google Fonts. primary = color de marca (sidebar,
# botones); accent = segundo color (badges/realces). Curado para contraste y
# personalidad por dominio.
THEMES: dict[str, dict] = {
    "salud":       {"primary": "#0d9488", "accent": "#0ea5e9", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "ecommerce":   {"primary": "#db2777", "accent": "#f97316", "heading": "Syne", "body": "Manrope"},
    "moda":        {"primary": "#db2777", "accent": "#f97316", "heading": "Syne", "body": "Manrope"},
    "fintech":     {"primary": "#059669", "accent": "#8b5cf6", "heading": "Space Grotesk", "body": "Inter"},
    "finanzas":    {"primary": "#059669", "accent": "#8b5cf6", "heading": "Space Grotesk", "body": "Inter"},
    "restaurante": {"primary": "#ea580c", "accent": "#dc2626", "heading": "Playfair Display", "body": "Karla"},
    "saas":        {"primary": "#6366f1", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "crm":         {"primary": "#7c3aed", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "dashboard":   {"primary": "#2563eb", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "educacion":   {"primary": "#2563eb", "accent": "#f59e0b", "heading": "Baloo 2", "body": "Inter"},
    "logistica":   {"primary": "#0891b2", "accent": "#f59e0b", "heading": "Space Grotesk", "body": "Inter"},
    "gimnasio":    {"primary": "#dc2626", "accent": "#f59e0b", "heading": "Barlow Condensed", "body": "Barlow"},
    "fitness":     {"primary": "#dc2626", "accent": "#f59e0b", "heading": "Barlow Condensed", "body": "Barlow"},
    "belleza":     {"primary": "#db2777", "accent": "#a855f7", "heading": "Cormorant Garamond", "body": "Manrope"},
    "inmobiliaria":{"primary": "#0f766e", "accent": "#ca8a04", "heading": "Cinzel", "body": "Josefin Sans"},
    "legal":       {"primary": "#1d4ed8", "accent": "#0f766e", "heading": "Lora", "body": "Inter"},
    "turismo":     {"primary": "#0284c7", "accent": "#f97316", "heading": "Sora", "body": "Inter"},
    "hotel":       {"primary": "#0284c7", "accent": "#f59e0b", "heading": "Sora", "body": "Inter"},
    "eventos":     {"primary": "#7c3aed", "accent": "#ec4899", "heading": "Sora", "body": "Inter"},
    "agro":        {"primary": "#16a34a", "accent": "#ca8a04", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "ong":         {"primary": "#16a34a", "accent": "#2563eb", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "rrhh":        {"primary": "#4338ca", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "veterinaria": {"primary": "#0d9488", "accent": "#f59e0b", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "farmacia":    {"primary": "#16a34a", "accent": "#0ea5e9", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "taller":      {"primary": "#475569", "accent": "#f97316", "heading": "Space Grotesk", "body": "Inter"},
    "contabilidad":{"primary": "#059669", "accent": "#6366f1", "heading": "Space Grotesk", "body": "Inter"},
    "manufactura": {"primary": "#475569", "accent": "#f59e0b", "heading": "Space Grotesk", "body": "Inter"},
    "iglesia":     {"primary": "#7c3aed", "accent": "#f59e0b", "heading": "Cormorant Garamond", "body": "Inter"},
    "universidad": {"primary": "#1d4ed8", "accent": "#0d9488", "heading": "Lora", "body": "Inter"},
    "panaderia":   {"primary": "#d97706", "accent": "#dc2626", "heading": "Playfair Display", "body": "Karla"},
    "billar":      {"primary": "#15803d", "accent": "#ca8a04", "heading": "Barlow Condensed", "body": "Barlow"},
    "bar":         {"primary": "#9333ea", "accent": "#f59e0b", "heading": "Barlow Condensed", "body": "Barlow"},
    "lavanderia":  {"primary": "#0284c7", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"},
    "tienda":      {"primary": "#4f46e5", "accent": "#f97316", "heading": "Plus Jakarta Sans", "body": "Inter"},
}

# alias de palabras clave -> sector canónico (para matchear visión en inglés/es)
_ALIASES = {
    "health": "salud", "clinic": "salud", "clinica": "salud", "medico": "salud", "citas": "salud",
    "fashion": "moda", "tienda": "ecommerce", "store": "ecommerce", "shop": "ecommerce", "retail": "ecommerce",
    "inventory": "ecommerce", "inventario": "ecommerce",
    "invoice": "fintech", "facturacion": "fintech", "pagos": "fintech", "banking": "fintech",
    "food": "restaurante", "pedidos": "restaurante", "menu": "restaurante", "pos": "restaurante",
    "education": "educacion", "lms": "educacion", "school": "educacion", "curso": "educacion",
    "logistics": "logistica", "fleet": "logistica", "flota": "logistica", "envios": "logistica",
    "gym": "gimnasio", "workout": "gimnasio", "entreno": "gimnasio",
    "beauty": "belleza", "spa": "belleza", "salon": "belleza",
    "real estate": "inmobiliaria", "propiedad": "inmobiliaria", "property": "inmobiliaria",
    "travel": "turismo", "viajes": "turismo", "agencia de viajes": "turismo",
    "events": "eventos", "boda": "eventos", "wedding": "eventos",
    "voluntarios": "ong", "nonprofit": "ong",
    "mechanic": "taller", "mecanico": "taller",
    "laundry": "lavanderia",
    "iglesia": "iglesia", "church": "iglesia", "templo": "iglesia", "parroquia": "iglesia",
    "culto": "iglesia", "ministerio": "iglesia",
    "universidad": "universidad", "college": "universidad", "facultad": "universidad",
    "panaderia": "panaderia", "bakery": "panaderia", "pasteleria": "panaderia",
    "billar": "billar", "billiards": "billar", "pool": "billar",
    "bar": "bar", "tomadero": "bar", "cantina": "bar", "discoteca": "bar", "licorera": "bar",
    "tienda de barrio": "tienda", "minimercado": "tienda", "abarrotes": "tienda",
    "gastos": "contabilidad", "accounting": "contabilidad",
    "mascotas": "veterinaria", "pet": "veterinaria",
    "produccion": "manufactura", "fabrica": "manufactura", "planta": "manufactura",
    "peluqueria": "belleza", "barberia": "belleza", "salon": "belleza",
    "colegio": "educacion", "universidad": "educacion", "academia": "educacion",
    "propiedades": "inmobiliaria", "bienes raices": "inmobiliaria",
}

DEFAULT_THEME = {"primary": "#4f46e5", "accent": "#06b6d4", "heading": "Plus Jakarta Sans", "body": "Inter"}

# pesos por familia para el import de Google Fonts (heading vs body)
_HEAD_W = "600;700;800"
_BODY_W = "400;500;600;700"


import re as _re


def _wb(needle: str, hay: str) -> bool:
    """Match por límite de palabra: evita 'bar' dentro de 'barrio' o 'dian' en
    'estudiantes'. Para frases con espacio, usa substring normal."""
    if " " in needle:
        return needle in hay
    return bool(_re.search(r"\b" + _re.escape(needle) + r"\b", hay))


def pick_theme(text: str) -> dict:
    """Elige el tema del sector a partir de la visión/clasificación (texto libre)."""
    t = (text or "").lower()
    # match directo por sector canónico (límite de palabra)
    for sector, theme in THEMES.items():
        if _wb(sector, t):
            return {**theme, "sector": sector}
    # match por alias
    for alias, sector in _ALIASES.items():
        if _wb(alias, t):
            return {**THEMES[sector], "sector": sector}
    return {**DEFAULT_THEME, "sector": "default"}


def fonts_import_url(theme: dict) -> str:
    """URL @import de Google Fonts para el par tipográfico del tema."""
    fams = []
    for fam, w in ((theme["heading"], _HEAD_W), (theme["body"], _BODY_W)):
        fams.append(f"family={fam.replace(' ', '+')}:wght@{w}")
    return "https://fonts.googleapis.com/css2?" + "&".join(dict.fromkeys(fams)) + "&display=swap"
