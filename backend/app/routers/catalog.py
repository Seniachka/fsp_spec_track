from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AssessmentItem, CandidateProfile, Grade, Specialization, StackTag
from app.services.assessment import bank_pairs

router = APIRouter(tags=["catalog"])


@router.get("/catalog/specializations")
def specializations(db: Session = Depends(get_db)):
    pairs = bank_pairs(db)
    rows = []
    for spec in db.query(Specialization).order_by(Specialization.id).all():
        grades = sorted({grade for code, grade in pairs if code == spec.code})
        rows.append({"code": spec.code, "title": spec.title, "industry": spec.industry, "grades_with_bank": grades})
    return rows


@router.get("/catalog/grades")
def grades(db: Session = Depends(get_db)):
    return [
        {"code": grade.code, "title": grade.title, "rank": grade.rank}
        for grade in db.query(Grade).order_by(Grade.rank).all()
    ]


@router.get("/catalog/stack-tags")
def stack_tags(specialization: str | None = None, db: Session = Depends(get_db)):
    query = db.query(StackTag, Specialization).join(Specialization, Specialization.id == StackTag.specialization_id)
    if specialization:
        query = query.filter(Specialization.code == specialization)
    seen = set()
    rows = []
    for tag, spec in query.order_by(StackTag.id).all():
        if tag.code in seen:
            continue
        seen.add(tag.code)
        rows.append({"code": tag.code, "title": tag.title, "specialization_code": spec.code})
    return rows


@router.get("/public/stats")
def stats(db: Session = Depends(get_db)):
    specs = {row.id: row for row in db.query(Specialization).all()}
    grades = {row.id: row for row in db.query(Grade).all()}
    counts: dict[tuple, int] = {}
    profiles = db.query(CandidateProfile).filter(
        CandidateProfile.published.is_(True),
        CandidateProfile.grade_id.is_not(None),
    )
    for profile in profiles:
        key = (profile.specialization_id, profile.grade_id)
        counts[key] = counts.get(key, 0) + 1
    categories = []
    for (spec_id, grade_id), count in sorted(counts.items(), key=lambda item: item[1], reverse=True):
        spec = specs.get(spec_id)
        grade = grades.get(grade_id)
        if not spec or not grade:
            continue
        categories.append({"title": f"{spec.title} · {grade.title}", "count": count})
    return {
        "candidates": sum(counts.values()),
        "categories": categories,
        "bank_items": db.query(AssessmentItem).count(),
    }
