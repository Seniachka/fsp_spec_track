from sqlalchemy.orm import Session

from app.models import (
    Application,
    CandidateProfile,
    CandidateStack,
    Experience,
    FspAchievement,
    Grade,
    Invitation,
    SoftSkill,
    Specialization,
    StackTag,
    User,
    Vacancy,
)
from app.services.matching import LEVEL_TITLE, _achievements, _tags_for_candidate


def contacts_open(db: Session, company_id: int, candidate_id: int) -> bool:
    accepted = (
        db.query(Invitation)
        .filter(
            Invitation.company_id == company_id,
            Invitation.candidate_id == candidate_id,
            Invitation.status == "accepted",
        )
        .first()
    )
    if accepted:
        return True
    applied = (
        db.query(Application)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .filter(Vacancy.company_id == company_id, Application.candidate_id == candidate_id)
        .first()
    )
    return applied is not None


def public_candidate(
    db: Session,
    profile: CandidateProfile,
    *,
    company_id: int | None = None,
    rank: int | None = None,
    fit: float | None = None,
    explanation: list[str] | None = None,
) -> dict:
    spec = db.get(Specialization, profile.specialization_id) if profile.specialization_id else None
    grade = db.get(Grade, profile.grade_id) if profile.grade_id else None
    achievements = _achievements(db, profile.fsp_participant_id)
    experiences = db.query(Experience).filter(Experience.candidate_id == profile.user_id).all()
    soft = db.query(SoftSkill).filter(SoftSkill.candidate_id == profile.user_id).all()
    opened = bool(company_id and contacts_open(db, company_id, profile.user_id))
    user = db.get(User, profile.user_id)
    payload = {
        "id": profile.user_id,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "about": profile.about,
        "specialization": {"code": spec.code, "title": spec.title} if spec else None,
        "grade": {"code": grade.code, "title": grade.title} if grade else None,
        "test_score": profile.test_score,
        "stack": [{"code": tag.code, "title": tag.title} for tag in _tags_for_candidate(db, profile.user_id)],
        "fsp": [
            {
                "discipline": item.discipline,
                "competition": item.competition,
                "level": LEVEL_TITLE.get(item.event_level, item.event_level),
                "place": item.place,
                "percentile": item.percentile,
                "role": item.role_name,
                "awarded_on": item.awarded_on,
            }
            for item in achievements
        ],
        "fsp_empty": not achievements,
        "experiences": [
            {
                "role_title": item.role_title,
                "company_name": item.company_name,
                "start_year": item.start_year,
                "end_year": item.end_year,
                "is_current": item.is_current,
            }
            for item in experiences
        ],
        "soft_skills": [item.label for item in soft],
        "rank": rank,
        "fit": fit,
        "explanation": explanation or [],
        "contacts_locked": not opened,
    }
    if opened and user is not None:
        payload["email"] = user.email
        payload["phone"] = profile.phone
        payload["telegram"] = profile.telegram
    return payload


def candidate_self(db: Session, profile: CandidateProfile, user: User) -> dict:
    card = public_candidate(db, profile)
    card["email"] = user.email
    card["phone"] = profile.phone
    card["telegram"] = profile.telegram
    card["contacts_locked"] = False
    card["published"] = profile.published
    card["show_in_search"] = profile.show_in_search
    card["desired_salary_min"] = profile.desired_salary_min
    card["desired_salary_max"] = profile.desired_salary_max
    card["fsp_participant_id"] = profile.fsp_participant_id
    card["grade_sealed_at"] = profile.grade_sealed_at.isoformat() if profile.grade_sealed_at else None
    return card


def replace_stack(db: Session, candidate_id: int, codes: list[str]) -> None:
    db.query(CandidateStack).filter(CandidateStack.candidate_id == candidate_id).delete()
    if not codes:
        return
    tags = db.query(StackTag).filter(StackTag.code.in_(codes)).all()
    seen = set()
    for tag in tags:
        if tag.code in seen:
            continue
        seen.add(tag.code)
        db.add(CandidateStack(candidate_id=candidate_id, tag_id=tag.id))
