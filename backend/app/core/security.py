from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import Usuario

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/swagger-login")


# ─── Contraseñas ──────────────────────────────────────────────────────────────


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ─── JWT ──────────────────────────────────────────────────────────────────────


def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = (
        db.query(Usuario)
        .filter(Usuario.id == int(user_id), Usuario.activo == True)
        .first()
    )
    if not user:
        raise credentials_exception
    return user


def require_rol(*roles):
    def checker(current_user: Usuario = Depends(get_current_user)):
        if current_user.rol not in roles:
            raise HTTPException(status_code=403, detail="Sin permisos para esta acción")
        return current_user

    return checker


def is_admin(user: Usuario) -> bool:
    """True para ADMIN y ADMIN_AREA."""
    from app.models.models import RolUsuario
    return user.rol in (RolUsuario.ADMIN, RolUsuario.ADMIN_AREA)


def check_area_access(user: Usuario, area_tecnica: str) -> bool:
    """
    ADMIN: acceso total.
    ADMIN_AREA: solo su area_restriccion.
    Otros roles: no aplica restricción de área directamente.
    """
    from app.models.models import RolUsuario
    if user.rol == RolUsuario.ADMIN:
        return True
    if user.rol == RolUsuario.ADMIN_AREA:
        if not user.area_restriccion:
            return True
        return user.area_restriccion.value == area_tecnica
    return True


# ─── Autenticación Dany / n8n ─────────────────────────────────────────────────


def verify_dany_token(x_dany_token: str = Header(...)) -> None:
    """
    Dependencia reutilizable para todos los endpoints exclusivos de Dany/n8n.
    Valida el header X-Dany-Token contra DANY_SYSTEM_TOKEN en el entorno.

    Uso en endpoints:
        _: None = Depends(verify_dany_token)

    Dev mode: si DANY_SYSTEM_TOKEN no está configurado, acepta cualquier token.
    Prod: el token debe coincidir exactamente con el secreto en Secret Manager.
    """
    s = get_settings()
    if not s.DANY_SYSTEM_TOKEN:
        return  # dev mode — sin restricción
    if x_dany_token != s.DANY_SYSTEM_TOKEN:
        raise HTTPException(status_code=401, detail="Token Dany inválido")
