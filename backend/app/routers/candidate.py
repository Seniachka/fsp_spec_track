from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.errors import ApiError
from app.models import (
    Application,
    AssessmentSession,
    Company,
    Consent,
    Experience,
    FspAchievement,
    Invitation,
    SoftSkill,
    User,
    Vacancy,
)
from app.security import utcnow
from app.services.assessment import accept_intern, assemble, confirm_pending, policy, public_session, submit_session
from app.services.present import candidate_self, replace_stack

router = APIRouter(tags=["candidate"])


class ProfileIn(BaseModel):
    first_name: str = ""
    last_name: str = ""
    about: str = ""
    phone: str = ""
    telegram: str = ""
    stack: list[str] = []
    soft_skills: list[str] = []
    desired_salary_min: int | None = None
    desired_salary_max: int | None = None
    experiences: list[dict] = []


class PrivacyIn(BaseModel):
    published: bool
    show_in_search: bool = True


class FspIn(BaseModel):
    participant_id: str = Field(min_length=3, max_length=64)


class SessionIn(BaseModel):
    specialization_code: str
    claimed_grade: str
    purpose: str = "initial"


class AnswerIn(BaseModel):
    item_id: int
    choice_id: str | None = None
    source: str | None = None


class SubmitIn(BaseModel):
    answers: list[AnswerIn]


def _profile(user: User):
    if user.candidate is None:
        raise ApiError(404, "NOT_FOUND", "Профиль кандидата не найден")
    return user.candidate


@router.get("/me")
def get_me(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    payload = candidate_self(db, profile, user)
    payload["policy"] = policy(db, profile)
    return payload


@router.patch("/me")
def patch_me(body: ProfileIn, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    if body.desired_salary_min is not None and body.desired_salary_max is not None:
        if body.desired_salary_min > body.desired_salary_max:
            raise ApiError(422, "SALARY_REQUIRED", "Вилка ожиданий: «от» не больше «до»")
    profile.first_name = body.first_name.strip()
    profile.last_name = body.last_name.strip()
    profile.about = body.about.strip()
    profile.phone = body.phone.strip()
    profile.telegram = body.telegram.strip()
    profile.desired_salary_min = body.desired_salary_min
    profile.desired_salary_max = body.desired_salary_max
    replace_stack(db, profile.user_id, body.stack)
    db.query(SoftSkill).filter(SoftSkill.candidate_id == profile.user_id).delete()
    for label in body.soft_skills:
        cleaned = label.strip()
        if cleaned:
            db.add(SoftSkill(candidate_id=profile.user_id, label=cleaned[:80]))
    db.query(Experience).filter(Experience.candidate_id == profile.user_id).delete()
    for item in body.experiences:
        title = str(item.get("role_title") or "").strip()
        company = str(item.get("company_name") or "").strip()
        if not title and not company:
            continue
        db.add(
            Experience(
                candidate_id=profile.user_id,
                role_title=title or "Роль",
                company_name=company or "Компания",
                start_year=str(item.get("start_year") or ""),
                end_year=str(item.get("end_year") or ""),
                is_current=bool(item.get("is_current")),
            )
        )
    db.commit()
    return candidate_self(db, profile, user)


@router.put("/me/privacy")
def privacy(body: PrivacyIn, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    consent = (
        db.query(Consent)
        .filter(
            Consent.user_id == user.id,
            Consent.doc_type == "profile_publication",
            Consent.withdrawn_at.is_(None),
        )
        .first()
    )
    if body.published and consent is None:
        raise ApiError(422, "CONSENT_REQUIRED", "Нет действующего согласия на публикацию")
    profile.published = body.published
    profile.show_in_search = body.show_in_search
    db.commit()
    return {"published": profile.published, "show_in_search": profile.show_in_search}


@router.post("/me/fsp-link")
def link_fsp(body: FspIn, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    participant_id = body.participant_id.strip()
    found = db.query(FspAchievement).filter(FspAchievement.participant_id == participant_id).first()
    if found is None:
        raise ApiError(404, "FSP_ID_NOT_FOUND", "Такого ID участника в реестре нет")
    other = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.fsp_participant_id == participant_id, CandidateProfile.user_id != user.id)
        .first()
    )
    if other:
        raise ApiError(409, "VALIDATION", "Этот ID уже привязан к другому профилю")
    profile.fsp_participant_id = participant_id
    db.commit()
    return candidate_self(db, profile, user)


@router.delete("/me/fsp-link")
def unlink_fsp(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    profile.fsp_participant_id = None
    db.commit()
    return candidate_self(db, profile, user)


@router.post("/me/grade/confirm")
def confirm(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    confirm_pending(db, _profile(user))
    return candidate_self(db, _profile(user), user)


@router.post("/me/grade/intern")
def intern(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    accept_intern(db, _profile(user))
    return candidate_self(db, _profile(user), user)


@router.post("/assessments/sessions", status_code=201)
def start_session(body: SessionIn, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    session = assemble(db, _profile(user), body.specialization_code, body.claimed_grade, body.purpose)
    return public_session(db, session)


@router.get("/assessments/sessions/{session_id}")
def get_session(session_id: int, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    session = db.get(AssessmentSession, session_id)
    if session is None or session.candidate_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Попытка не найдена")
    return public_session(db, session)


@router.post("/assessments/sessions/{session_id}/submit")
def submit(session_id: int, body: SubmitIn, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    session = db.get(AssessmentSession, session_id)
    if session is None or session.candidate_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Попытка не найдена")
    return submit_session(db, _profile(user), session, [item.model_dump() for item in body.answers])


@router.get("/me/invitations")
def my_invitations(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    rows = (
        db.query(Invitation)
        .filter(Invitation.candidate_id == user.id)
        .order_by(Invitation.id.desc())
        .all()
    )
    payload = []
    for row in rows:
        if row.status == "sent":
            row.status = "viewed"
            row.viewed_at = utcnow()
        company = db.get(Company, row.company_id)
        payload.append(
            {
                "id": row.id,
                "status": row.status,
                "body": row.body,
                "salary_min": row.salary_min,
                "salary_max": row.salary_max,
                "contact_channel": row.contact_channel,
                "company_name": company.name if company else "",
                "company_industry": company.industry if company else "",
            }
        )
    db.commit()
    return payload


def _own_invitation(db: Session, user: User, invitation_id: int) -> Invitation:
    row = db.get(Invitation, invitation_id)
    if row is None or row.candidate_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Приглашение не найдено")
    return row


@router.post("/me/invitations/{invitation_id}/accept")
def accept(invitation_id: int, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    row = _own_invitation(db, user, invitation_id)
    if row.status == "declined":
        raise ApiError(409, "VALIDATION", "Приглашение уже отклонено")
    row.status = "accepted"
    row.resolved_at = utcnow()
    db.commit()
    return {"status": row.status}


@router.post("/me/invitations/{invitation_id}/decline")
def decline(invitation_id: int, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    row = _own_invitation(db, user, invitation_id)
    if row.status == "accepted":
        raise ApiError(409, "VALIDATION", "Приглашение уже принято")
    row.status = "declined"
    row.resolved_at = utcnow()
    db.commit()
    return {"status": row.status}


@router.get("/vacancies")
def vacancies(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    rows = db.query(Vacancy).filter(Vacancy.is_published.is_(True)).order_by(Vacancy.id.desc()).all()
    result = []
    for row in rows:
        company = db.get(Company, row.company_id)
        applied = (
            db.query(Application)
            .filter(Application.vacancy_id == row.id, Application.candidate_id == user.id)
            .first()
        )
        result.append(
            {
                "id": row.id,
                "title": row.title,
                "description": row.description,
                "salary_min": row.salary_min,
                "salary_max": row.salary_max,
                "company_name": company.name if company else "",
                "applied": applied is not None,
                "application_status": applied.status if applied else None,
            }
        )
    return result


@router.post("/vacancies/{vacancy_id}/applications", status_code=201)
def apply(vacancy_id: int, user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    profile = _profile(user)
    if profile.grade_id is None:
        raise ApiError(422, "NOT_CATEGORIZED", "Сначала подтвердите категорию тестом")
    vacancy = db.get(Vacancy, vacancy_id)
    if vacancy is None or not vacancy.is_published:
        raise ApiError(404, "NOT_FOUND", "Вакансия не найдена")
    exists = db.query(Application).filter(Application.vacancy_id == vacancy.id, Application.candidate_id == user.id).first()
    if exists:
        raise ApiError(409, "VALIDATION", "Отклик уже отправлен")
    db.add(Application(vacancy_id=vacancy.id, candidate_id=user.id, status="sent"))
    db.commit()
    return {"status": "sent"}


@router.get("/me/applications")
def my_applications(user: User = Depends(require_role("candidate")), db: Session = Depends(get_db)):
    rows = db.query(Application).filter(Application.candidate_id == user.id).all()
    payload = []
    for row in rows:
        vacancy = db.get(Vacancy, row.vacancy_id)
        payload.append({"id": row.id, "status": row.status, "vacancy_title": vacancy.title if vacancy else "", "salary_min": vacancy.salary_min if vacancy else None, "salary_max": vacancy.salary_max if vacancy else None})
    return payload
