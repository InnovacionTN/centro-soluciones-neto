"""
Motor de IA — Centro de Soluciones Neto
Modelo : gemini-2.0-flash (google-generativeai)
Fallback: clasificación por palabras clave ponderadas

Notas de configuración:
- GEMINI_API_KEY debe existir en Secret Manager (gemini-api-key → latest)
- Sin key configurada el sistema opera en modo fallback (reglas)
- El fallback garantiza que el sistema nunca devuelva error al clasificar
"""

import json
import unicodedata
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import AreaTecnica, Tipificacion, UrgenciaTipificacion
from app.schemas.schemas import ClasificacionResponse

settings = get_settings()

# Modelo a usar — centralizado para cambiar en un solo lugar
GEMINI_MODEL = "gemini-2.0-flash"


# ─── Normalización ────────────────────────────────────────────────────────────


def _norm(text: str) -> str:
    """Quita acentos y pasa a minúsculas. energía == energia"""
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    ).lower()


# ─── Stop words ───────────────────────────────────────────────────────────────

STOP_WORDS = {
    "no",
    "el",
    "la",
    "los",
    "las",
    "de",
    "del",
    "que",
    "en",
    "es",
    "se",
    "un",
    "una",
    "con",
    "por",
    "al",
    "ya",
    "su",
    "le",
    "si",
    "me",
    "mi",
    "ha",
    "he",
    "tu",
    "yo",
    "y",
    "a",
    "o",
    "e",
    "pero",
    "para",
    "como",
    "muy",
    "mas",
    "bien",
    "mal",
    "hay",
    "son",
    "fue",
    "era",
}


# ─── Urgencia por frases ──────────────────────────────────────────────────────

URGENCY_KEYWORDS = {
    "CRITICA": [
        "sin luz",
        "sin energia",
        "no tenemos energia",
        "no hay energia",
        "sin energia electrica",
        "no tenemos luz",
        "sin electricidad",
        "cortaron la energia",
        "apagon",
        "sin corriente",
        "sin internet",
        "sin red",
        "caido total",
        "sistema caido",
        "sin servicio total",
        "sin conexion total",
        "caja bloqueada",
        "caja no abre",
        "caja electronica bloqueada",
        "sistema bloqueado",
        "no podemos operar",
        "robo",
        "emergencia",
        "incendio",
        "inundacion",
    ],
    "ALTA": [
        "no tenemos internet",
        "no hay internet",
        "perdimos internet",
        "internet caido",
        "red caida",
        "antena apagada",
        "no hay senal",
        "sin senal",
        "sin wifi",
        "no funciona",
        "falla",
        "danado",
        "danada",
        "bloqueado",
        "bloqueada",
        "pasmado",
        "pasmada",
        "no detecta",
        "no responde",
        "amplificador",
        "lector de huella",
        "huellero",
        "terminal bancaria",
        "bascula",
        "gotera",
        "filtracion",
        "fuga de agua",
        "fuga",
        "cae agua",
        "agua del techo",
        "humo",
        "olor a quemado",
        "no hay luz",
        "cortaron la luz",
        "se fue la luz",
        "lamparas fundidas",
        "sin alumbrado",
        "urgente",
        "clientes formados",
        "no podemos cobrar",
        "caja lenta",
    ],
}


def detect_urgency_from_text(text: str) -> Optional[str]:
    """Detecta nivel de urgencia por frases clave. Normaliza acentos."""
    t = _norm(text)
    for level in ["CRITICA", "ALTA"]:
        if any(kw in t for kw in URGENCY_KEYWORDS[level]):
            return level
    return None


# ─── Ejemplos few-shot ────────────────────────────────────────────────────────

FEW_SHOT_EXAMPLES = """
EJEMPLOS REALES (usa como referencia de clasificacion):

"amplificador danado, el audio sube y baja solo" -> MANTENIMIENTO / Instalaciones / ALTA
"lector de huella en caja 2 no detecta, lector pasmado" -> SISTEMAS / Punto de Venta / ALTA
"no tenemos internet, la antena parece apagada" -> SISTEMAS / Conectividad / ALTA
"gotera en el area de caja, cae agua del techo" -> MANTENIMIENTO / Instalaciones / ALTA
"el articulo no aparece en la orden de compra" -> ABASTO / Ordenes de Compra / BAJA
"caja electronica bloqueada, no abre, clientes formados" -> SISTEMAS / Administracion Caja / CRITICA
"lamparas del pasillo fundidas, muy oscuro" -> MANTENIMIENTO / Energia Electrica / MEDIA
"no tenemos energia electrica en todo el dia" -> MANTENIMIENTO / Energia Electrica / CRITICA
"justificacion de retardo" -> FINANZAS / Nomina / MEDIA
"precio en sistema no coincide con etiqueta" -> COMERCIAL / Catalogo / MEDIA
"proveedor no ha visitado la tienda en 3 dias" -> ABASTO / Ordenes de Compra / BAJA
"""


# ─── Fallback por reglas ──────────────────────────────────────────────────────


def classify_by_rules(descripcion: str, db: Session) -> ClasificacionResponse:
    """
    Clasificación sin IA. Pesa keywords por longitud, ignora stop words.
    Siempre disponible como respaldo — nunca lanza excepción.
    """
    text = _norm(descripcion)
    tipificaciones = db.query(Tipificacion).filter(Tipificacion.activo == True).all()

    best_match = None
    best_score = 0.0
    detected_words: list = []

    for tip in tipificaciones:
        if not tip.palabras_clave:
            continue
        keywords = [
            _norm(k.strip())
            for k in tip.palabras_clave.replace(",", " ").split()
            if k.strip()
        ]
        score = 0.0
        found = []
        for kw in keywords:
            if kw in STOP_WORDS or len(kw) <= 2:
                continue
            if kw in text:
                score += len(kw) / 4.0
                found.append(kw)
        if score > best_score:
            best_score = score
            best_match = tip
            detected_words = found

    if not best_match:
        best_match = tipificaciones[0] if tipificaciones else None

    urgencia = detect_urgency_from_text(descripcion)

    return ClasificacionResponse(
        area_tecnica=best_match.area_tecnica if best_match else AreaTecnica.SISTEMAS,
        tipificacion_id=best_match.id if best_match else 0,
        tipificacion_nombre=best_match.problema if best_match else "Sin clasificar",
        categoria=best_match.categoria if best_match else "",
        confianza=min(int(best_score * 15), 70),
        urgencia_sugerida=(
            UrgenciaTipificacion(urgencia)
            if urgencia
            else (best_match.urgencia if best_match else UrgenciaTipificacion.MEDIA)
        ),
        razon=f"[Reglas] {', '.join(detected_words) or 'sin coincidencia especifica'}",
        palabras_detectadas=detected_words,
    )


# ─── Clasificación con Gemini ─────────────────────────────────────────────────


async def classify_with_ai(descripcion: str, db: Session) -> ClasificacionResponse:
    """
    Clasificación con Gemini.
    Si GEMINI_API_KEY no está configurada o Gemini falla,
    usa classify_by_rules como fallback — nunca devuelve error al caller.
    """
    if not settings.GEMINI_API_KEY:
        return classify_by_rules(descripcion, db)

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)

        tipificaciones = (
            db.query(Tipificacion).filter(Tipificacion.activo == True).all()
        )
        catalogo = "\n".join(
            [
                f"ID {t.id}: [{t.area_tecnica.value}] {t.categoria} -> {t.problema} (urgencia_base: {t.urgencia.value})"
                for t in tipificaciones
            ]
        )

        json_schema = """{
  "tipificacion_id": <número entero del ID del catálogo>,
  "area_tecnica": "<ABASTO|SISTEMAS|MANTENIMIENTO|FINANZAS|COMERCIAL|RRHH>",
  "categoria": "<categoría exacta del catálogo>",
  "tipificacion_nombre": "<nombre exacto del problema del catálogo>",
  "confianza": <entero 0-100>,
  "urgencia_sugerida": "<CRITICA|ALTA|MEDIA|BAJA>",
  "razon": "<explicación máximo 12 palabras>",
  "palabras_detectadas": ["<término1>", "<término2>"]
}"""

        prompt = f"""Eres el clasificador de tickets de Centro de Soluciones Neto.
Selecciona la tipificacion mas apropiada del catalogo para el problema descrito.

{FEW_SHOT_EXAMPLES}

CATALOGO:
{catalogo}

REGLAS DE CLASIFICACION:
- Dispositivo fisico danado (amplificador, lector, camara, bascula) -> MANTENIMIENTO o SISTEMAS
- Conectividad, red, internet, antena -> SISTEMAS
- Agua, gotera, filtracion, lamparas, electricidad, energia -> MANTENIMIENTO
- Orden de compra, proveedor, mercancias -> ABASTO
- Caja electronica, efectivo, deposito, casette -> FINANZAS o SISTEMAS
- Precios, etiquetas, catalogo, promociones -> COMERCIAL
- Retardo, justificacion, nomina, vacaciones -> FINANZAS
- Urgencia CRITICA: sin luz/internet/energia, caja bloqueada, emergencia
- Urgencia ALTA: dispositivo danado, pasmado, no detecta, gotera, falla activa

DESCRIPCION DEL TICKET:
"{descripcion}"

Responde con el siguiente JSON (sin texto adicional, sin markdown):
{json_schema}"""

        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )

        data = json.loads(response.text)

        # Urgencia por keywords siempre gana si es mayor nivel que la de Gemini
        urgencia_kw = detect_urgency_from_text(descripcion)
        rank = {"CRITICA": 3, "ALTA": 2, "MEDIA": 1, "BAJA": 0}
        if urgencia_kw and rank.get(urgencia_kw, 0) > rank.get(
            data.get("urgencia_sugerida", "MEDIA"), 0
        ):
            data["urgencia_sugerida"] = urgencia_kw

        return ClasificacionResponse(**data)

    except Exception as e:
        print(f">>> ERROR GEMINI classify: {type(e).__name__}: {e}")
        result = classify_by_rules(descripcion, db)
        result.razon = f"[Fallback reglas] {result.razon}"
        return result


# ─── Sugerencia de solución para el agente ────────────────────────────────────


async def suggest_solution(
    descripcion: str,
    tipificacion_nombre: str,
    area_tecnica: str,
    db: Session,
) -> Optional[str]:
    """
    Genera una sugerencia de respuesta inicial para el agente.
    El agente puede usarla, editarla o ignorarla.
    Sin GEMINI_API_KEY devuelve None silenciosamente.
    """
    if not settings.GEMINI_API_KEY:
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)

        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(
            f"""Eres asistente del Call Center de Centro de Soluciones Neto.
Area tecnica: {area_tecnica}
Tipo de problema: {tipificacion_nombre}
Descripcion de la tienda: "{descripcion}"

Escribe una respuesta inicial para enviarle a la tienda:
- Maximo 3 oraciones
- Tono profesional pero cercano, no robotico
- Indica que ya se tomo el caso
- Menciona el siguiente paso concreto segun el tipo de problema
- Sin saludos ni firma al inicio o al final""",
            generation_config=genai.GenerationConfig(
                temperature=0.4,
                max_output_tokens=250,
            ),
        )
        return response.text.strip()

    except Exception as e:
        print(f">>> ERROR GEMINI suggest: {type(e).__name__}: {e}")
        return None
