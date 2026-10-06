"""Сборка варианта и решение по грейду. Раздел 3.3 спецификации."""

import random
from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.errors import ApiError
from app.models import (
    AssessmentItem,
    AssessmentSession,
    AssessmentSessionItem,
    CandidateProfile,
    Grade,
    Specialization,
)
from app.security import new_token, utcnow
from app.services.code_runner import run_hidden_tests

BLUEPRINT = [
    {"kind": "mcq", "stratum": "target", "anchor": True, "weight": 1},
    {"kind": "mcq", "stratum": "easy", "anchor": False, "weight": 1},
    {"kind": "mcq", "stratum": "target", "anchor": False, "weight": 1},
    {"kind": "mcq", "stratum": "target", "anchor": False, "weight": 1},
    {"kind": "mcq", "stratum": "hard", "anchor": False, "weight": 1},
    {"kind": "code", "stratum": "target", "anchor": False, "weight": 2},
]
TARGETS = {"junior": 2.0, "middle": 3.0, "senior": 4.0, "intern": 1.2}
PASS = 65
STRONG = 85
TOTAL_WEIGHT = 7


def bank_pairs(db: Session) -> set[tuple[str, str]]:
    rows = (
        db.query(Specialization.code, AssessmentItem.grades)
        .join(Specialization, Specialization.id == AssessmentItem.specialization_id)
        .filter(AssessmentItem.status == "calibrated")
        .all()
    )
    pairs = set()
    for spec_code, grades in rows:
        for grade in grades or []:
            pairs.add((spec_code, grade))
    return pairs


ORDER = ["intern", "junior", "middle", "senior", "lead"]


def _assert_adjacent(db: Session, profile: CandidateProfile, purpose: str, grade_code: str) -> None:
    if purpose == "initial":
        if grade_code not in {"junior", "middle", "senior"}:
            raise ApiError(422, "GRADE_NOT_ADJACENT", "Первый тест доступен на Junior, Middle или Senior")
        return
    if purpose == "up" and profile.pending_grade_id:
        base = db.get(Grade, profile.pending_grade_id)
    elif purpose == "up" and profile.grade_id:
        base = db.get(Grade, profile.grade_id)
    elif purpose == "down" and profile.grade_id:
        base = db.get(Grade, profile.grade_id)
    else:
        last = latest_session(db, profile.user_id)
        base = db.get(Grade, last.claimed_grade_id) if last else None
    if base is None or base.code not in ORDER:
        raise ApiError(422, "GRADE_NOT_ADJACENT", "Можно сдавать только соседний грейд")
    shift = 1 if purpose == "up" else -1
    index = ORDER.index(base.code) + shift
    expected = ORDER[index] if 0 <= index < len(ORDER) else None
    if grade_code != expected:
        raise ApiError(422, "GRADE_NOT_ADJACENT", "Можно сдавать только соседний грейд")


def _grade(db: Session, code: str) -> Grade:
    grade = db.query(Grade).filter(Grade.code == code).one_or_none()
    if grade is None:
        raise ApiError(422, "GRADE_NOT_ADJACENT", "Неизвестный грейд")
    return grade


def _spec(db: Session, code: str) -> Specialization:
    spec = db.query(Specialization).filter(Specialization.code == code).one_or_none()
    if spec is None:
        raise ApiError(422, "VALIDATION", "Неизвестная специализация")
    return spec


def latest_session(db: Session, candidate_id: int) -> AssessmentSession | None:
    return (
        db.query(AssessmentSession)
        .filter(AssessmentSession.candidate_id == candidate_id)
        .order_by(AssessmentSession.id.desc())
        .first()
    )


def open_session(db: Session, candidate_id: int) -> AssessmentSession | None:
    return (
        db.query(AssessmentSession)
        .filter(
            AssessmentSession.candidate_id == candidate_id,
            AssessmentSession.status == "started",
        )
        .order_by(AssessmentSession.id.desc())
        .first()
    )


def policy(db: Session, profile: CandidateProfile) -> dict:
    now = utcnow()
    sealed = profile.grade_id is not None
    cooldown = bool(sealed and profile.grade_change_allowed_at and profile.grade_change_allowed_at > now)
    last = latest_session(db, profile.user_id)
    last_grade = db.get(Grade, last.claimed_grade_id) if last else None
    failed_recently = False
    if profile.initial_failed_at is not None:
        failed_recently = now - profile.initial_failed_at < timedelta(days=7)
    current = db.get(Grade, profile.grade_id) if profile.grade_id else None
    pending = db.get(Grade, profile.pending_grade_id) if profile.pending_grade_id else None
    can_initial = not sealed and pending is None and not failed_recently
    can_down = False
    if not sealed and profile.initial_failed_at and not profile.down_used and last_grade and last_grade.code not in {"junior", "intern"}:
        can_down = True
    if sealed and not cooldown and current and current.code not in {"intern", "junior"}:
        can_down = True
    can_up = False
    if pending and not profile.up_used and not sealed and pending.code != "senior":
        can_up = True
    if sealed and not cooldown and current and current.code not in {"senior", "lead"}:
        can_up = True
    can_accept_intern = bool(
        not sealed and profile.initial_failed_at and last_grade and last_grade.code == "junior"
    )
    return {
        "sealed": sealed,
        "cooldown_active": cooldown,
        "grade_change_allowed_at": profile.grade_change_allowed_at.isoformat() if profile.grade_change_allowed_at else None,
        "can_start_initial": can_initial,
        "can_start_down": can_down,
        "can_start_up": can_up,
        "can_confirm_pending": bool(pending and not sealed),
        "can_accept_intern": can_accept_intern,
        "pending_grade": pending.code if pending else None,
        "pending_score": profile.pending_score,
    }


def _pool(db: Session, spec_id: int, grade_code: str) -> list[AssessmentItem]:
    items = (
        db.query(AssessmentItem)
        .filter(
            AssessmentItem.specialization_id == spec_id,
            AssessmentItem.status == "calibrated",
            AssessmentItem.exposure_count < settings.exposure_cap,
        )
        .all()
    )
    return [item for item in items if grade_code in (item.grades or [])]


def _pick(rng: random.Random, items: list[AssessmentItem], used: set[int]) -> AssessmentItem | None:
    fresh = [item for item in items if item.id not in used]
    if not fresh:
        return None
    return rng.choice(fresh)


def _select_item(rng, pool: list[AssessmentItem], slot: dict, used: set[int]) -> AssessmentItem:
    if slot["kind"] == "code":
        chosen = _pick(rng, [item for item in pool if item.kind == "code"], used)
        if chosen:
            return chosen
    if slot["anchor"]:
        chosen = _pick(rng, [item for item in pool if item.is_anchor and item.kind == "mcq"], used)
        if chosen:
            return chosen
    same = [
        item for item in pool
        if item.kind == "mcq" and item.stratum == slot["stratum"] and item.is_anchor == slot["anchor"]
    ]
    chosen = _pick(rng, same, used)
    if chosen:
        return chosen
    widened = [item for item in pool if item.kind == "mcq" and item.stratum == slot["stratum"]]
    chosen = _pick(rng, widened, used)
    if chosen:
        return chosen
    fallback = _pick(rng, [item for item in pool if item.kind == "mcq"], used)
    if fallback is None:
        raise ApiError(422, "BANK_EMPTY", "Для этой специализации и грейда нет калиброванного банка")
    return fallback


def _mean(chosen: list[tuple[AssessmentItem, int]]) -> float:
    weight = sum(slot_weight for _, slot_weight in chosen)
    return sum(item.difficulty * slot_weight for item, slot_weight in chosen) / weight


def assemble(db: Session, profile: CandidateProfile, spec_code: str, grade_code: str, purpose: str) -> AssessmentSession:
    rules = policy(db, profile)
    allowed = {
        "initial": rules["can_start_initial"],
        "down": rules["can_start_down"],
        "up": rules["can_start_up"],
    }
    if purpose not in allowed:
        raise ApiError(422, "VALIDATION", "Неизвестная цель попытки")
    if not allowed[purpose]:
        if rules["cooldown_active"]:
            raise ApiError(
                409,
                "GRADE_COOLDOWN",
                "Смена грейда пока закрыта",
                {"grade_change_allowed_at": rules["grade_change_allowed_at"]},
            )
        raise ApiError(409, "GRADE_COOLDOWN", "Эта попытка сейчас недоступна")
    if grade_code not in TARGETS or grade_code == "intern":
        raise ApiError(422, "BANK_EMPTY", "Для этого грейда нет отдельного теста")
    _assert_adjacent(db, profile, purpose, grade_code)
    spec = _spec(db, spec_code)
    grade = _grade(db, grade_code)
    existing = open_session(db, profile.user_id)
    if existing:
        return existing
    pool = _pool(db, spec.id, grade.code)
    if len([item for item in pool if item.kind == "mcq"]) < 5:
        raise ApiError(422, "BANK_EMPTY", "Для этой специализации и грейда нет калиброванного банка")
    seed = new_token()
    rng = random.Random(seed)
    best = None
    best_distance = None
    for _ in range(20):
        used: set[int] = set()
        chosen = []
        attempt = random.Random(rng.random())
        for slot in BLUEPRINT:
            item = _select_item(attempt, pool, slot, used)
            used.add(item.id)
            chosen.append((item, slot["weight"]))
        distance = abs(_mean(chosen) - TARGETS[grade.code])
        if best is None or distance < best_distance:
            best = chosen
            best_distance = distance
        if distance <= 0.3:
            break
    assert best is not None
    warning = best_distance is None or best_distance > 0.3
    rng.shuffle(best)
    session = AssessmentSession(
        candidate_id=profile.user_id,
        specialization_id=spec.id,
        claimed_grade_id=grade.id,
        purpose=purpose,
        seed=seed,
        mean_difficulty=_mean(best),
        difficulty_warning=warning,
    )
    db.add(session)
    db.flush()
    for position, (item, weight) in enumerate(best, start=1):
        payload = dict(item.payload or {})
        params = {"topic": item.topic, "prompt": item.prompt, "kind": item.kind}
        if item.kind == "mcq":
            options = list(payload.get("options") or [])
            rng.shuffle(options)
            params["options"] = options
            params["correct"] = payload.get("correct")
        else:
            variants = list(payload.get("variants") or [])
            variant = rng.choice(variants) if variants else {"public": {}, "hidden": []}
            public_tests = list(variant.get("public_tests") or [])
            if not public_tests and variant.get("public"):
                public_tests = [variant["public"]]
            params.update(
                {
                    "language": "python3.12",
                    "signature": payload.get("signature"),
                    "starter": payload.get("starter"),
                    "public_tests": public_tests,
                    "hidden": variant.get("hidden") or [],
                }
            )
        db.add(
            AssessmentSessionItem(
                session_id=session.id,
                item_id=item.id,
                position=position,
                weight=weight,
                params=params,
            )
        )
        item.exposure_count += 1
    if purpose == "down":
        profile.down_used = True
    if purpose == "up":
        profile.up_used = True
    db.commit()
    return session


def public_session(db: Session, session: AssessmentSession) -> dict:
    spec = db.get(Specialization, session.specialization_id)
    grade = db.get(Grade, session.claimed_grade_id)
    items = (
        db.query(AssessmentSessionItem)
        .filter(AssessmentSessionItem.session_id == session.id)
        .order_by(AssessmentSessionItem.position)
        .all()
    )
    public_items = []
    for item in items:
        params = dict(item.params or {})
        entry = {
            "id": item.id,
            "position": item.position,
            "kind": params.get("kind"),
            "weight": item.weight,
            "topic": params.get("topic"),
            "prompt": params.get("prompt"),
        }
        if params.get("kind") == "mcq":
            entry["options"] = params.get("options") or []
        else:
            entry["language"] = "python3.12"
            entry["languages"] = [
                {"code": "python3.12", "title": "Python 3.12", "enabled": True},
                {"code": "javascript", "title": "JavaScript", "enabled": False},
                {"code": "go", "title": "Go", "enabled": False},
                {"code": "java", "title": "Java", "enabled": False},
            ]
            entry["signature"] = params.get("signature")
            entry["starter"] = params.get("starter")
            entry["public_tests"] = params.get("public_tests") or []
            entry["hidden_count"] = len(params.get("hidden") or [])
        if session.status != "started":
            entry["correct"] = item.correct
        public_items.append(entry)
    return {
        "id": session.id,
        "status": session.status,
        "purpose": session.purpose,
        "score": session.score,
        "mean_difficulty": session.mean_difficulty,
        "specialization_code": spec.code if spec else None,
        "claimed_grade": grade.code if grade else None,
        "items": public_items,
    }


def _seal(profile: CandidateProfile, grade: Grade, score: float, spec_id: int) -> None:
    now = utcnow()
    profile.specialization_id = spec_id
    profile.grade_id = grade.id
    profile.test_score = score
    profile.test_scored_at = now
    profile.grade_sealed_at = now
    profile.grade_change_allowed_at = now + timedelta(days=90)
    profile.pending_grade_id = None
    profile.pending_score = None
    profile.initial_failed_at = None
    profile.down_used = False
    profile.up_used = False


def _outcome_for(score: float) -> str:
    if score < PASS:
        return "fail"
    if score >= STRONG:
        return "strong"
    return "pass"


def submit_session(db: Session, profile: CandidateProfile, session: AssessmentSession, answers: list[dict]) -> dict:
    if session.status != "started":
        raise ApiError(409, "SESSION_EXPIRED", "Попытка уже сдана")
    if utcnow() - session.started_at > timedelta(minutes=settings.session_minutes):
        session.status = "expired"
        db.commit()
        raise ApiError(409, "SESSION_EXPIRED", "Время попытки вышло")
    by_id = {int(item["item_id"]): item for item in answers}
    rows = db.query(AssessmentSessionItem).filter(AssessmentSessionItem.session_id == session.id).all()
    earned = 0
    review = []
    for row in rows:
        params = row.params or {}
        incoming = by_id.get(row.id) or {}
        if params.get("kind") == "mcq":
            choice = incoming.get("choice_id")
            ok = choice == params.get("correct")
            row.answer = {"choice_id": choice}
        else:
            source = incoming.get("source") or ""
            public_tests = list(params.get("public_tests") or [])
            hidden = list(params.get("hidden") or [])
            suite = public_tests + hidden
            checks = run_hidden_tests(source, "python3.12", suite)
            ok = bool(suite) and len(checks) == len(suite) and all(checks)
            row.answer = {"source": source}
        row.correct = ok
        if ok:
            earned += row.weight
        review.append({"id": row.id, "topic": params.get("topic"), "correct": ok})
    score = round(100 * earned / TOTAL_WEIGHT, 1)
    session.score = score
    session.submitted_at = utcnow()
    grade = db.get(Grade, session.claimed_grade_id)
    outcome = _outcome_for(score)
    sealed = False
    if session.purpose == "up":
        if outcome == "fail" and profile.pending_grade_id:
            keep = db.get(Grade, profile.pending_grade_id)
            _seal(profile, keep, profile.pending_score or score, session.specialization_id)
            outcome = "kept_previous"
            sealed = True
        elif outcome != "fail":
            _seal(profile, grade, score, session.specialization_id)
            sealed = True
        session.status = "submitted"
    elif outcome == "fail":
        session.status = "failed"
        profile.initial_failed_at = utcnow()
        profile.pending_grade_id = None
        profile.pending_score = None
    elif outcome == "strong" and session.purpose == "initial" and grade.code != "senior":
        session.status = "passed_strong"
        profile.pending_grade_id = grade.id
        profile.pending_score = score
        profile.initial_failed_at = None
    else:
        session.status = "passed"
        _seal(profile, grade, score, session.specialization_id)
        sealed = True
    db.commit()
    rules = policy(db, profile)
    return {
        "score": score,
        "outcome": outcome,
        "sealed": sealed,
        "grade": grade.code,
        "review": review,
        "policy": rules,
    }


def confirm_pending(db: Session, profile: CandidateProfile) -> None:
    if profile.pending_grade_id is None or profile.grade_id is not None:
        raise ApiError(409, "VALIDATION", "Нет грейда, который можно подтвердить")
    last = latest_session(db, profile.user_id)
    grade = db.get(Grade, profile.pending_grade_id)
    _seal(profile, grade, profile.pending_score or 0, last.specialization_id if last else profile.specialization_id)
    db.commit()


def accept_intern(db: Session, profile: CandidateProfile) -> None:
    rules = policy(db, profile)
    if not rules["can_accept_intern"]:
        raise ApiError(409, "VALIDATION", "Полка стажёра сейчас недоступна")
    intern = _grade(db, "intern")
    last = latest_session(db, profile.user_id)
    _seal(profile, intern, last.score if last and last.score is not None else 0, last.specialization_id)
    db.commit()
