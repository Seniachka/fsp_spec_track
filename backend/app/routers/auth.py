from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import current_user
from app.errors import ApiError
from app.models import CandidateProfile, Company, Consent, EmailToken, RefreshToken, User
from app.security import encode_access, hash_password, hash_token, new_token, utcnow, verify_password
from app.seed import DOC_VERSION

router = APIRouter(prefix="/auth", tags=["auth"])
_FAILS: dict[str, int] = {}


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: str
    consents: list[str]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenIn(BaseModel):
    refresh_token: str


class VerifyIn(BaseModel):
    token: str


def _issue(db: Session, user: User) -> dict:
    raw = new_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(days=settings.refresh_days),
        )
    )
    db.commit()
    return {"access_token": encode_access(user.id, user.role), "refresh_token": raw, "role": user.role}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if body.role not in {"candidate", "employer"}:
        raise ApiError(422, "VALIDATION", "Роль должна быть candidate или employer")
    if set(body.consents) != {"personal_data", "profile_publication"}:
        raise ApiError(422, "CONSENT_REQUIRED", "Нужны оба согласия: на обработку и на публикацию профиля")
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise ApiError(409, "EMAIL_TAKEN", "Эта почта уже зарегистрирована")
    now = utcnow()
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        email_verified_at=now if settings.auto_verify else None,
    )
    db.add(user)
    db.flush()
    for doc_type in body.consents:
        db.add(Consent(user_id=user.id, doc_type=doc_type, doc_version=DOC_VERSION, accepted_at=now))
    if body.role == "candidate":
        db.add(CandidateProfile(user_id=user.id, published=True, show_in_search=True))
    else:
        db.add(Company(owner_user_id=user.id, contact_email=user.email))
    verify_token = None
    if not settings.auto_verify:
        verify_token = new_token()
        db.add(EmailToken(user_id=user.id, token_hash=hash_token(verify_token), expires_at=now + timedelta(hours=24)))
        print(f"[razryad] verify {user.email} token={verify_token}")
    db.commit()
    return {"user_id": user.id, "verification_required": not settings.auto_verify}


@router.post("/verify-email", status_code=204)
def verify_email(body: VerifyIn, db: Session = Depends(get_db)):
    row = db.query(EmailToken).filter(EmailToken.token_hash == hash_token(body.token), EmailToken.used_at.is_(None)).first()
    if row is None or row.expires_at < utcnow():
        raise ApiError(400, "VALIDATION", "Ссылка подтверждения недействительна")
    user = db.get(User, row.user_id)
    user.email_verified_at = utcnow()
    row.used_at = utcnow()
    db.commit()


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if _FAILS.get(email, 0) >= 8:
        raise ApiError(429, "TOO_MANY", "Слишком много попыток входа")
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        _FAILS[email] = _FAILS.get(email, 0) + 1
        raise ApiError(401, "UNAUTHORIZED", "Неверная почта или пароль")
    if user.email_verified_at is None:
        raise ApiError(403, "EMAIL_NOT_VERIFIED", "Сначала подтвердите почту")
    _FAILS[email] = 0
    return _issue(db, user)


@router.post("/refresh")
def refresh(body: TokenIn, db: Session = Depends(get_db)):
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(body.refresh_token)).first()
    if row is None or row.revoked_at is not None or row.expires_at < utcnow():
        raise ApiError(401, "UNAUTHORIZED", "Сессия истекла")
    row.revoked_at = utcnow()
    user = db.get(User, row.user_id)
    return _issue(db, user)


@router.post("/logout", status_code=204)
def logout(body: TokenIn, db: Session = Depends(get_db)):
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(body.refresh_token)).first()
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        db.commit()


@router.get("/session")
def session(user: User = Depends(current_user), db: Session = Depends(get_db)):
    name = user.email
    if user.role == "candidate" and user.candidate:
        name = f"{user.candidate.first_name} {user.candidate.last_name}".strip() or user.email
    if user.role == "employer" and user.company and user.company.name:
        name = user.company.name
    return {"id": user.id, "email": user.email, "role": user.role, "name": name}
