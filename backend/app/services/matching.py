"""Ранг и объяснение. Веса зафиксированы в спецификации, раздел 3.4–3.5."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    CandidateProfile,
    CandidateStack,
    FspAchievement,
    Grade,
    Need,
    NeedStack,
    ShortlistSnapshot,
    Specialization,
    StackTag,
)
from app.security import utcnow

LEVEL_MULT = {"international": 1.2, "national": 1.0, "regional": 0.7, "uni": 0.4}
LEVEL_TITLE = {
    "international": "международный уровень",
    "national": "национальный уровень",
    "regional": "региональный уровень",
    "uni": "вузовский уровень",
}
TARGETS = {"junior": 2.0, "middle": 3.0, "senior": 4.0}


def achievement_points(item: FspAchievement) -> float:
    if item.place == 1:
        base = 100
    elif item.place == 2:
        base = 85
    elif item.place == 3:
        base = 75
    elif item.percentile is not None and item.percentile <= 10:
        base = 60
    else:
        base = 30
    return min(100.0, base * LEVEL_MULT.get(item.event_level, 0.4))


def fsp_norm(items: list[FspAchievement]) -> float:
    if not items:
        return 0.0
    scores = sorted((achievement_points(item) for item in items), reverse=True)
    total = scores[0] + (0.15 * scores[1] if len(scores) > 1 else 0.0)
    return min(100.0, total)


def freshness(profile: CandidateProfile, now: datetime | None = None) -> float:
    now = now or utcnow()
    if profile.test_scored_at is None:
        return 0.85
    age_days = (now - profile.test_scored_at).days
    return 1.0 if age_days < 90 else 0.85


def strength(test_score: float, fsp_score: float, prefer_fsp: bool) -> float:
    # Подтверждённый профиль: тест есть у каждого в категории, ФСП — бонус.
    if prefer_fsp:
        return 0.55 * test_score + 0.45 * fsp_score
    return 0.70 * test_score + 0.30 * fsp_score


def _rub(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def salary_overlap(candidate_min, candidate_max, need_min, need_max) -> tuple[float, str]:
    if candidate_min is None or candidate_max is None:
        return 1.0, "Ожидания по деньгам не указаны"
    left = max(candidate_min, need_min)
    right = min(candidate_max, need_max)
    if right < left:
        return 0.0, "Вилки не пересекаются"
    width = max(1, candidate_max - candidate_min)
    return (right - left) / width, f"Вилки пересекаются: {_rub(left)}–{_rub(right)} ₽"


def _tags_for_candidate(db: Session, candidate_id: int) -> list[StackTag]:
    rows = (
        db.query(StackTag)
        .join(CandidateStack, CandidateStack.tag_id == StackTag.id)
        .filter(CandidateStack.candidate_id == candidate_id)
        .all()
    )
    return rows


def _required_tags(db: Session, need_id: int) -> list[StackTag]:
    return (
        db.query(StackTag)
        .join(NeedStack, NeedStack.tag_id == StackTag.id)
        .filter(NeedStack.need_id == need_id, NeedStack.is_required.is_(True))
        .all()
    )


def _achievements(db: Session, participant_id: str | None) -> list[FspAchievement]:
    if not participant_id:
        return []
    return db.query(FspAchievement).filter(FspAchievement.participant_id == participant_id).all()


def fsp_line(items: list[FspAchievement], score: float) -> str:
    if not items:
        return "Истории ФСП нет, ранг без этого бонуса"
    best = max(items, key=achievement_points)
    place = f"{best.place} место" if best.place else "участие"
    level = LEVEL_TITLE.get(best.event_level, best.event_level)
    return f"ФСП: {place}, {best.discipline}, {best.competition}, {level}"


def explain_candidate(db: Session, profile: CandidateProfile, need: Need | None, prefer_fsp: bool = False) -> dict:
    spec = db.get(Specialization, profile.specialization_id) if profile.specialization_id else None
    grade = db.get(Grade, profile.grade_id) if profile.grade_id else None
    tags = _tags_for_candidate(db, profile.user_id)
    achievements = _achievements(db, profile.fsp_participant_id)
    fsp_score = fsp_norm(achievements)
    test_score = profile.test_score or 0
    person_strength = strength(test_score, fsp_score, prefer_fsp)
    fresh = freshness(profile)
    lines = []
    if spec and grade:
        lines.append(f"Категория совпала: {spec.title} · {grade.title}")
    if profile.test_score is not None:
        when = profile.test_scored_at.date().isoformat() if profile.test_scored_at else "без даты"
        lines.append(f"Тест: {round(profile.test_score)} из 100, {when}")
    lines.append(fsp_line(achievements, fsp_score))
    stack_overlap = 1.0
    salary_factor = 1.0
    if need is not None:
        required = _required_tags(db, need.id)
        have = {tag.code for tag in tags}
        if not required:
            lines.append("Стек не сужали")
        else:
            hit = [tag.title for tag in required if tag.code in have]
            miss = [tag.title for tag in required if tag.code not in have]
            stack_overlap = len(hit) / len(required)
            lines.append(
                "Стек: " + (", ".join(hit) if hit else "обязательные теги не совпали")
                + (("; не хватает " + ", ".join(miss)) if miss else "")
            )
        salary_factor, salary_text = salary_overlap(
            profile.desired_salary_min, profile.desired_salary_max, need.salary_min, need.salary_max
        )
        lines.append(salary_text)
    fit = round((0.50 * (person_strength / 100) + 0.35 * stack_overlap + 0.15 * salary_factor) * fresh, 4)
    category_ok = spec is not None and grade is not None
    return {
        "fit": fit,
        "strength": round(person_strength * fresh, 2),
        "fsp_score": round(fsp_score, 2),
        "has_fsp": bool(achievements),
        "lines": lines[:5],
        "stack": [{"code": tag.code, "title": tag.title} for tag in tags],
        "rating": {
            "fit": round(fit * 100),
            "test": round(test_score),
            "stack": round(stack_overlap * 100),
            "fsp": round(fsp_score),
            "conditions": round(salary_factor * 100),
            "freshness": fresh,
            "reasons": [
                {"code": "category", "title": "Категория", "ok": category_ok},
                {"code": "stack", "title": "Стек", "ok": stack_overlap >= 1},
                {"code": "test", "title": "Тест", "ok": profile.test_score is not None},
                {"code": "fsp", "title": "ФСП", "ok": bool(achievements)},
                {"code": "conditions", "title": "Условия", "ok": salary_factor > 0},
            ],
        },
    }


def eligible_profiles(db: Session, specialization_id: int, grade_min_rank: int, grade_max_rank: int):
    grades = {grade.id: grade for grade in db.query(Grade).all()}
    query = db.query(CandidateProfile).filter(
        CandidateProfile.published.is_(True),
        CandidateProfile.show_in_search.is_(True),
        CandidateProfile.grade_id.is_not(None),
        CandidateProfile.specialization_id == specialization_id,
    )
    result = []
    for profile in query.all():
        grade = grades.get(profile.grade_id)
        if grade is None:
            continue
        if grade_min_rank <= grade.rank <= grade_max_rank:
            result.append(profile)
    return result


def rank_need(
    db: Session,
    need: Need,
    *,
    grade_code: str | None = None,
    stack_codes: list[str] | None = None,
    fsp_only: bool = False,
) -> list[dict]:
    grade_min = db.get(Grade, need.grade_min_id)
    grade_max = db.get(Grade, need.grade_max_id)
    profiles = eligible_profiles(db, need.specialization_id, grade_min.rank, grade_max.rank)
    if grade_code:
        wanted = db.query(Grade).filter(Grade.code == grade_code).one_or_none()
        profiles = [profile for profile in profiles if wanted and profile.grade_id == wanted.id]
    rows = []
    for profile in profiles:
        card = explain_candidate(db, profile, need, prefer_fsp=need.prefer_fsp)
        if fsp_only and not card["has_fsp"]:
            continue
        if stack_codes:
            have = {item["code"] for item in card["stack"]}
            if not set(stack_codes).issubset(have):
                continue
        rows.append((card["fit"], card["strength"], profile, card))
    rows.sort(key=lambda item: (item[0], item[1]), reverse=True)
    db.query(ShortlistSnapshot).filter(ShortlistSnapshot.need_id == need.id).delete()
    ranked = []
    for index, (_, _, profile, card) in enumerate(rows, start=1):
        db.add(
            ShortlistSnapshot(
                need_id=need.id,
                candidate_id=profile.user_id,
                rank=index,
                fit=card["fit"],
                explanation={"lines": card["lines"]},
            )
        )
        ranked.append({"rank": index, "profile": profile, **card})
    return ranked


def search_bank(
    db: Session,
    *,
    specialization_code: str | None = None,
    grade_code: str | None = None,
    stack_codes: list[str] | None = None,
    fsp_only: bool = False,
) -> list[dict]:
    grades = {grade.id: grade for grade in db.query(Grade).all()}
    query = db.query(CandidateProfile).filter(
        CandidateProfile.published.is_(True),
        CandidateProfile.show_in_search.is_(True),
        CandidateProfile.grade_id.is_not(None),
    )
    if specialization_code:
        spec = db.query(Specialization).filter(Specialization.code == specialization_code).one_or_none()
        query = query.filter(CandidateProfile.specialization_id == (spec.id if spec else -1))
    profiles = query.all()
    if grade_code:
        profiles = [profile for profile in profiles if grades.get(profile.grade_id) and grades[profile.grade_id].code == grade_code]
    rows = []
    for profile in profiles:
        card = explain_candidate(db, profile, None, False)
        if fsp_only and not card["has_fsp"]:
            continue
        if stack_codes and not set(stack_codes).issubset({item["code"] for item in card["stack"]}):
            continue
        rows.append((card["strength"], profile, card))
    rows.sort(key=lambda item: item[0], reverse=True)
    return [{"rank": index, "profile": profile, **card} for index, (_, profile, card) in enumerate(rows, start=1)]
