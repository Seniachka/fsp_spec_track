from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.errors import ApiError
from app.models import Application, Company, Grade, Invitation, Need, NeedStack, Specialization, StackTag, User, Vacancy
from app.security import utcnow
from app.services.matching import rank_need, search_bank
from app.services.present import public_candidate

router = APIRouter(tags=["employer"])


class CompanyIn(BaseModel):
    name: str = ""
    industry: str = ""
    contact_email: str = ""
    about: str = ""


class NeedIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    team_description: str = ""
    specialization_code: str
    grade_min: str
    grade_max: str
    salary_min: int | None = None
    salary_max: int | None = None
    stack: list[str] = Field(default_factory=list, max_length=5)
    prefer_fsp: bool = False


class InviteIn(BaseModel):
    candidate_id: int
    need_id: int | None = None
    body: str = ""
    salary_min: int | None = None
    salary_max: int | None = None
    contact_channel: str = ""


class VacancyIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = ""
    specialization_code: str
    grade: str
    salary_min: int | None = None
    salary_max: int | None = None


def _company(user: User) -> Company:
    if user.company is None:
        raise ApiError(404, "NOT_FOUND", "Компания не найдена")
    return user.company


def _salary(min_value: int | None, max_value: int | None) -> tuple[int, int]:
    if min_value is None or max_value is None:
        raise ApiError(422, "SALARY_REQUIRED", "Укажите вилку от и до в рублях")
    if min_value < 0 or max_value < min_value:
        raise ApiError(422, "SALARY_REQUIRED", "Вилка должна быть в рублях, от не больше до")
    return min_value, max_value


def _grade(db: Session, code: str) -> Grade:
    grade = db.query(Grade).filter(Grade.code == code).one_or_none()
    if grade is None:
        raise ApiError(422, "VALIDATION", "Неизвестный грейд")
    return grade


def _spec(db: Session, code: str) -> Specialization:
    spec = db.query(Specialization).filter(Specialization.code == code).one_or_none()
    if spec is None:
        raise ApiError(422, "VALIDATION", "Неизвестная специализация")
    return spec


@router.get("/company")
def get_company(user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    return {
        "id": company.id,
        "name": company.name,
        "industry": company.industry,
        "contact_email": company.contact_email,
        "about": company.about,
    }


@router.patch("/company")
def patch_company(body: CompanyIn, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    company.name = body.name.strip()
    company.industry = body.industry.strip()
    company.contact_email = body.contact_email.strip()
    company.about = body.about.strip()
    db.commit()
    return get_company(user, db)


@router.get("/needs")
def list_needs(user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    rows = db.query(Need).filter(Need.company_id == company.id).order_by(Need.id.desc()).all()
    return [_need_out(db, row) for row in rows]


def _application_count(db: Session, need_id: int) -> int:
    vacancy = db.query(Vacancy).filter(Vacancy.need_id == need_id).one_or_none()
    if vacancy is None:
        return 0
    return db.query(Application).filter(Application.vacancy_id == vacancy.id).count()


def _need_out(db: Session, need: Need) -> dict:
    spec = db.get(Specialization, need.specialization_id)
    gmin = db.get(Grade, need.grade_min_id)
    gmax = db.get(Grade, need.grade_max_id)
    tags = (
        db.query(StackTag)
        .join(NeedStack, NeedStack.tag_id == StackTag.id)
        .filter(NeedStack.need_id == need.id)
        .all()
    )
    applications = _application_count(db, need.id)
    return {
        "id": need.id,
        "title": need.title,
        "team_description": need.team_description,
        "specialization_code": spec.code if spec else None,
        "specialization_title": spec.title if spec else None,
        "grade_min": gmin.code if gmin else None,
        "grade_max": gmax.code if gmax else None,
        "grade_title": gmin.title if gmin else None,
        "salary_min": need.salary_min,
        "salary_max": need.salary_max,
        "prefer_fsp": need.prefer_fsp,
        "demo_code": need.demo_code,
        "applications": applications,
        "editable": applications == 0,
        "stack": [{"code": tag.code, "title": tag.title} for tag in tags],
    }


def _write_stack(db: Session, need: Need, spec_id: int, codes: list[str]) -> None:
    db.query(NeedStack).filter(NeedStack.need_id == need.id).delete()
    if not codes:
        return
    found = db.query(StackTag).filter(StackTag.code.in_(codes), StackTag.specialization_id == spec_id).all()
    seen = set()
    for tag in found:
        if tag.code in seen:
            continue
        seen.add(tag.code)
        db.add(NeedStack(need_id=need.id, tag_id=tag.id, is_required=True))


def _publish_vacancy(db: Session, need: Need, grade_id: int) -> None:
    row = db.query(Vacancy).filter(Vacancy.need_id == need.id).one_or_none()
    if row is None:
        row = Vacancy(company_id=need.company_id, need_id=need.id, is_published=True)
        db.add(row)
    row.title = need.title
    row.description = need.team_description
    row.specialization_id = need.specialization_id
    row.grade_id = grade_id
    row.salary_min = need.salary_min
    row.salary_max = need.salary_max
    row.is_published = True


@router.post("/needs", status_code=201)
def create_need(body: NeedIn, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    salary_min, salary_max = _salary(body.salary_min, body.salary_max)
    spec = _spec(db, body.specialization_code)
    gmin = _grade(db, body.grade_min)
    gmax = _grade(db, body.grade_max)
    if gmin.rank > gmax.rank:
        raise ApiError(422, "VALIDATION", "Нижняя граница грейда выше верхней")
    need = Need(
        company_id=company.id,
        title=body.title.strip(),
        team_description=body.team_description.strip(),
        specialization_id=spec.id,
        grade_min_id=gmin.id,
        grade_max_id=gmax.id,
        salary_min=salary_min,
        salary_max=salary_max,
        prefer_fsp=body.prefer_fsp,
    )
    db.add(need)
    db.flush()
    _write_stack(db, need, spec.id, body.stack)
    _publish_vacancy(db, need, gmin.id)
    db.commit()
    return _need_out(db, need)


@router.patch("/needs/{need_id}")
def update_need(need_id: int, body: NeedIn, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    need = _own_need(db, user, need_id)
    if _application_count(db, need.id):
        raise ApiError(409, "HAS_APPLICATIONS", "По вакансии уже есть отклики")
    salary_min, salary_max = _salary(body.salary_min, body.salary_max)
    spec = _spec(db, body.specialization_code)
    gmin = _grade(db, body.grade_min)
    gmax = _grade(db, body.grade_max)
    if gmin.rank > gmax.rank:
        raise ApiError(422, "VALIDATION", "Нижняя граница грейда выше верхней")
    need.title = body.title.strip()
    need.team_description = body.team_description.strip()
    need.specialization_id = spec.id
    need.grade_min_id = gmin.id
    need.grade_max_id = gmax.id
    need.salary_min = salary_min
    need.salary_max = salary_max
    need.prefer_fsp = body.prefer_fsp
    _write_stack(db, need, spec.id, body.stack)
    _publish_vacancy(db, need, gmin.id)
    db.commit()
    return _need_out(db, need)


@router.get("/needs/{need_id}")
def get_need(need_id: int, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    need = _own_need(db, user, need_id)
    return _need_out(db, need)


def _own_need(db: Session, user: User, need_id: int) -> Need:
    need = db.get(Need, need_id)
    if need is None or need.company_id != _company(user).id:
        raise ApiError(404, "NOT_FOUND", "Вакансия не найдена")
    return need


def _shortlist_payload(db: Session, company: Company, need: Need, grade: str | None, stack: str | None, fsp_only: bool):
    codes = [item for item in (stack or "").split(",") if item]
    ranked = rank_need(db, need, grade_code=grade, stack_codes=codes or None, fsp_only=fsp_only)
    db.commit()
    return [
        public_candidate(
            db,
            row["profile"],
            company_id=company.id,
            rank=row["rank"],
            fit=row["fit"],
            explanation=row["lines"],
            rating=row["rating"],
        )
        for row in ranked
    ]


@router.post("/needs/{need_id}/shortlist")
def build_shortlist(
    need_id: int,
    grade: str | None = None,
    stack: str | None = None,
    fsp_only: bool = False,
    user: User = Depends(require_role("employer")),
    db: Session = Depends(get_db),
):
    need = _own_need(db, user, need_id)
    return _shortlist_payload(db, _company(user), need, grade, stack, fsp_only)


@router.get("/needs/{need_id}/shortlist")
def get_shortlist(
    need_id: int,
    grade: str | None = None,
    stack: str | None = None,
    fsp_only: bool = False,
    user: User = Depends(require_role("employer")),
    db: Session = Depends(get_db),
):
    need = _own_need(db, user, need_id)
    return _shortlist_payload(db, _company(user), need, grade, stack, fsp_only)


@router.get("/candidates/search")
def search(
    specialization: str | None = None,
    grade: str | None = None,
    stack: str | None = None,
    fsp_only: bool = False,
    user: User = Depends(require_role("employer")),
    db: Session = Depends(get_db),
):
    company = _company(user)
    codes = [item for item in (stack or "").split(",") if item]
    rows = search_bank(db, specialization_code=specialization, grade_code=grade, stack_codes=codes or None, fsp_only=fsp_only)
    return [
        public_candidate(
            db,
            row["profile"],
            company_id=company.id,
            rank=row["rank"],
            fit=row["fit"],
            explanation=row["lines"],
            rating=row["rating"],
        )
        for row in rows
    ]


@router.get("/candidates/{candidate_id}")
def candidate_card(candidate_id: int, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    from app.models import CandidateProfile

    profile = db.get(CandidateProfile, candidate_id)
    if profile is None or not profile.published or profile.grade_id is None:
        raise ApiError(404, "NOT_FOUND", "Кандидат не найден")
    return public_candidate(db, profile, company_id=_company(user).id)


@router.post("/invitations", status_code=201)
def invite(body: InviteIn, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    from app.models import CandidateProfile

    company = _company(user)
    need = _own_need(db, user, body.need_id) if body.need_id is not None else None
    if body.salary_min is None and body.salary_max is None and need is not None:
        salary_min, salary_max = need.salary_min, need.salary_max
    else:
        salary_min, salary_max = _salary(body.salary_min, body.salary_max)
    profile = db.get(CandidateProfile, body.candidate_id)
    if profile is None or profile.grade_id is None or not profile.published:
        raise ApiError(404, "NOT_FOUND", "Кандидат не найден")
    text = body.body.strip() or company.about.strip() or company.name.strip()
    channel = body.contact_channel.strip() or company.contact_email.strip() or company.name.strip()
    if len(channel) < 2:
        raise ApiError(422, "VALIDATION", "Укажите почту компании")
    existing = (
        db.query(Invitation)
        .filter(
            Invitation.company_id == company.id,
            Invitation.candidate_id == profile.user_id,
            Invitation.need_id == body.need_id,
            Invitation.status.in_(["sent", "viewed"]),
        )
        .first()
    )
    if existing:
        raise ApiError(409, "INVITE_EXISTS", "По этой вакансии уже есть живое приглашение")
    row = Invitation(
        company_id=company.id,
        need_id=body.need_id,
        candidate_id=profile.user_id,
        body=text,
        salary_min=salary_min,
        salary_max=salary_max,
        contact_channel=channel,
        status="sent",
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "status": row.status}


@router.get("/invitations")
def invitations(user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    from app.models import CandidateProfile

    company = _company(user)
    rows = db.query(Invitation).filter(Invitation.company_id == company.id).order_by(Invitation.id.desc()).all()
    payload = []
    for row in rows:
        profile = db.get(CandidateProfile, row.candidate_id)
        payload.append(
            {
                "id": row.id,
                "status": row.status,
                "body": row.body,
                "salary_min": row.salary_min,
                "salary_max": row.salary_max,
                "contact_channel": row.contact_channel,
                "need_id": row.need_id,
                "candidate": public_candidate(db, profile, company_id=company.id) if profile else None,
            }
        )
    return payload


@router.post("/vacancies", status_code=201)
def create_vacancy(body: VacancyIn, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    salary_min, salary_max = _salary(body.salary_min, body.salary_max)
    spec = _spec(db, body.specialization_code)
    grade = _grade(db, body.grade)
    row = Vacancy(
        company_id=company.id,
        title=body.title.strip(),
        description=body.description.strip(),
        specialization_id=spec.id,
        grade_id=grade.id,
        salary_min=salary_min,
        salary_max=salary_max,
        is_published=True,
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "title": row.title, "salary_min": row.salary_min, "salary_max": row.salary_max}


@router.get("/company/vacancies")
def company_vacancies(user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    company = _company(user)
    rows = db.query(Vacancy).filter(Vacancy.company_id == company.id).all()
    return [{"id": row.id, "title": row.title, "salary_min": row.salary_min, "salary_max": row.salary_max} for row in rows]


@router.get("/vacancies/{vacancy_id}/applications")
def vacancy_applications(vacancy_id: int, user: User = Depends(require_role("employer")), db: Session = Depends(get_db)):
    from app.models import CandidateProfile

    company = _company(user)
    vacancy = db.get(Vacancy, vacancy_id)
    if vacancy is None or vacancy.company_id != company.id:
        raise ApiError(404, "NOT_FOUND", "Вакансия не найдена")
    rows = db.query(Application).filter(Application.vacancy_id == vacancy.id).all()
    payload = []
    for row in rows:
        profile = db.get(CandidateProfile, row.candidate_id)
        payload.append({"id": row.id, "status": row.status, "candidate": public_candidate(db, profile, company_id=company.id) if profile else None})
    return payload
