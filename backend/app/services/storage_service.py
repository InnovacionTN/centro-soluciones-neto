"""
Servicio de almacenamiento de evidencias.
Backend "local"  → carpeta uploads/ del proyecto (desarrollo en Windows)
Backend "gcs"    → Google Cloud Storage (producción en GCP)
Cambiar STORAGE_BACKEND en .env para alternar.
"""
import os
import uuid
from pathlib import Path
from typing import Tuple

from app.core.config import get_settings

settings = get_settings()

# Tipos de archivo permitidos
ALLOWED_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "application/pdf",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".avi", ".pdf"}


def _get_upload_dir() -> Path:
    """Carpeta local donde se guardan los archivos en desarrollo."""
    base = Path(__file__).resolve().parent.parent.parent  # raíz del proyecto
    upload_dir = base / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def validate_file(filename: str, content_type: str, size_bytes: int) -> None:
    """Valida tipo y tamaño. Lanza ValueError si no pasa."""
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise ValueError(f"El archivo supera el límite de {settings.MAX_UPLOAD_SIZE_MB} MB")

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Tipo de archivo no permitido: {ext}. Usa: jpg, png, webp, pdf, mp4")

    # Verificar content-type si viene del cliente (puede ser vacío)
    if content_type and content_type not in ALLOWED_TYPES and "octet-stream" not in content_type:
        raise ValueError(f"Tipo MIME no permitido: {content_type}")


def save_file(filename: str, content: bytes) -> Tuple[str, str]:
    """
    Guarda el archivo y devuelve (nombre_guardado, url).
    En local: guarda en uploads/, URL = /api/v1/evidencias/archivo.ext
    En GCS:   sube al bucket, URL = https://storage.googleapis.com/...
    """
    ext = Path(filename).suffix.lower()
    nombre_guardado = f"{uuid.uuid4().hex}{ext}"

    if settings.STORAGE_BACKEND == "gcs":
        return _save_to_gcs(nombre_guardado, content)
    else:
        return _save_local(nombre_guardado, content)


def _save_local(nombre_guardado: str, content: bytes) -> Tuple[str, str]:
    upload_dir = _get_upload_dir()
    filepath = upload_dir / nombre_guardado
    filepath.write_bytes(content)
    url = f"/api/v1/evidencias/{nombre_guardado}"
    return nombre_guardado, url


def _save_to_gcs(nombre_guardado: str, content: bytes) -> Tuple[str, str]:
    """Sube a Google Cloud Storage. Activo cuando STORAGE_BACKEND=gcs."""
    from google.cloud import storage as gcs
    client = gcs.Client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(f"evidencias/{nombre_guardado}")
    blob.upload_from_string(content)
    blob.make_public()
    return nombre_guardado, blob.public_url


def delete_file(nombre_guardado: str) -> None:
    """Elimina un archivo (solo admin)."""
    if settings.STORAGE_BACKEND == "gcs":
        try:
            from google.cloud import storage as gcs
            client = gcs.Client()
            bucket = client.bucket(settings.GCS_BUCKET_NAME)
            bucket.blob(f"evidencias/{nombre_guardado}").delete()
        except Exception:
            pass
    else:
        filepath = _get_upload_dir() / nombre_guardado
        if filepath.exists():
            filepath.unlink()
