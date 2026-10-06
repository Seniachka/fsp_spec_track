from fastapi import Depends, Header
from sqlalchemy.orm import Session
import jwt

from app.db import get_db
from app.errors import ApiError
from app.models import User
from app.security import decode_access


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHORIZED", "Нужна авторизация")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access(token)
    except jwt.PyJWTError:
        raise ApiError(401, "UNAUTHORIZED", "Сессия истекла")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", "Пользователь не найден")
    return user


def require_role(role: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role != role:
            raise ApiError(403, "FORBIDDEN", "Недостаточно прав")
        return user

    return dependency
