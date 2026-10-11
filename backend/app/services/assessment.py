"""Сборка экзамена из банка заданий: 60 вопросов и 3 задачи на 60 минут."""

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
from app.routers.bank import _bank, _skill_map
from app.security import new_token, utcnow
from app.services.code_runner import run_hidden_tests

ORDER = ["intern", "junior", "middle", "senior", "lead"]
BASE_DIFFICULTY = {"intern": 1.5, "junior": 2.0, "middle": 3.0, "senior": 4.0, "lead": 4.5}
THEORY_COUNT = 60
PRACTICE_COUNT = 3
PASS = 65
STRONG = 85
GRADE_TITLES = {
    "intern": "Стажёр",
    "junior": "Junior",
    "middle": "Middle",
    "senior": "Senior",
    "lead": "Lead",
}


def bank_pairs(db: Session) -> set[tuple[str, str]]:
    codes = [row[0] for row in db.query(Specialization.code).all()]
    return {(code, grade) for code in codes for grade in ORDER}


def _assert_adjacent(db: Session, profile: CandidateProfile, purpose: str, grade_code: str) -> None:
    if purpose == "initial":
        if grade_code not in ORDER:
            raise ApiError(422, "GRADE_NOT_ADJACENT", "Первый тест доступен от стажёра до Lead")
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
    if pending and not profile.up_used and not sealed and pending.code != "lead":
        can_up = True
    if sealed and not cooldown and current and current.code != "lead":
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


def _neighbor(grade_code: str, shift: int) -> str | None:
    index = ORDER.index(grade_code) + shift
    if 0 <= index < len(ORDER):
        return ORDER[index]
    return None


def _mix_counts(grade_code: str) -> list[tuple[str, str, int, int]]:
    """(роль, грейд, всего вопросов, из них софт). 70/20/10 и 10% софта."""
    plan = [("own", grade_code, 42, 4)]
    below = _neighbor(grade_code, -1)
    above = _neighbor(grade_code, 1)
    if below:
        plan.append(("below", below, 12, 1))
    else:
        plan[0] = ("own", grade_code, 54, 5)
    if above:
        plan.append(("above", above, 6, 1))
    else:
        role, code, total, soft = plan[0]
        plan[0] = (role, code, total + 6, soft + 1)
    return plan


def _spec_hard_skills(spec_code: str) -> set[str]:
    hard: set[str] = set()
    for position in _skill_map().get("positions", []):
        if position.get("specialization") != spec_code:
            continue
        hard.update(position.get("exam_skills") or [])
        for row in position.get("hard_skills") or []:
            if row.get("level") in {"core", "expected", "common"}:
                hard.add(row["code"])
    return hard


def _take(rng: random.Random, pool: list[dict], count: int, used: set[str]) -> list[dict]:
    fresh = [item for item in pool if item["id"] not in used]
    rng.shuffle(fresh)
    singles = [item for item in fresh if item.get("kind") == "single"]
    multis = [item for item in fresh if item.get("kind") == "multi"]
    want_multi = round(count * 0.25)
    want_single = count - want_multi
    chosen: list[dict] = []
    chosen.extend(multis[:want_multi])
    chosen.extend(singles[:want_single])
    if len(chosen) < count:
        picked = {item["id"] for item in chosen}
        rest = [item for item in fresh if item["id"] not in picked]
        chosen.extend(rest[: count - len(chosen)])
    chosen = chosen[:count]
    used.update(item["id"] for item in chosen)
    return chosen


def _pick_theory(rng: random.Random, spec_code: str, grade_code: str) -> list[dict]:
    hard_skills = _spec_hard_skills(spec_code)
    theory = _bank().get("theory") or []
    used: set[str] = set()
    chosen: list[dict] = []
    for _role, grade, total, soft_count in _mix_counts(grade_code):
        def matches(item: dict, *, soft: bool, strict: bool) -> bool:
            if item.get("grade") != grade or bool(item.get("soft")) != soft:
                return False
            if soft or not strict or not hard_skills:
                return True
            return item.get("skill") in hard_skills

        bucket = _take(rng, [item for item in theory if matches(item, soft=True, strict=True)], soft_count, used)
        bucket += _take(
            rng,
            [item for item in theory if matches(item, soft=False, strict=True)],
            total - len(bucket),
            used,
        )
        if len(bucket) < total:
            bucket += _take(
                rng,
                [item for item in theory if item.get("grade") == grade],
                total - len(bucket),
                used,
            )
        chosen.extend(bucket)
    if len(chosen) < THEORY_COUNT:
        raise ApiError(422, "BANK_EMPTY", "В банке не хватает вопросов для этого грейда")
    rng.shuffle(chosen)
    return chosen[:THEORY_COUNT]


def _pick_practice(rng: random.Random, spec_code: str, grade_code: str) -> list[dict]:
    tasks = list(_bank().get("practice") or [])
    base = BASE_DIFFICULTY[grade_code]
    targets = [
        ("warmup", "Разминка", max(1.2, round(base - 1, 1))),
        ("target", "Целевая", base),
        ("stretch", "Выше грейда", min(4.8, round(base + 1, 1))),
    ]
    used: set[str] = set()
    chosen = []
    for role, title, target in targets:
        preferred = [
            task for task in tasks
            if task["id"] not in used and (not task.get("domains") or spec_code in task.get("domains", []))
        ]
        pool = preferred or [task for task in tasks if task["id"] not in used]
        if not pool:
            raise ApiError(422, "BANK_EMPTY", "В банке не хватает практических задач")
        nearest = min(abs(task["difficulty"] - target) for task in pool)
        band = [task for task in pool if abs(task["difficulty"] - target) <= nearest + 0.15]
        rng.shuffle(band)
        task = band[0]
        used.add(task["id"])
        chosen.append({**task, "role": role, "role_title": title})
    return chosen


def _anchor_item(db: Session, spec_id: int) -> AssessmentItem:
    row = db.query(AssessmentItem).filter(AssessmentItem.code == "task-bank-ref").one_or_none()
    if row:
        return row
    row = AssessmentItem(
        code="task-bank-ref",
        specialization_id=spec_id,
        grades=[],
        kind="ref",
        stratum="target",
        difficulty=0,
        is_anchor=False,
        status="retired",
        topic="bank",
        prompt="",
        payload={},
    )
    db.add(row)
    db.flush()
    return row


def _theory_params(rng: random.Random, item: dict) -> dict:
    options = [dict(option) for option in item.get("options") or []]
    rng.shuffle(options)
    answer = item.get("answer")
    return {
        "section": "theory",
        "kind": item.get("kind"),
        "bank_id": item.get("id"),
        "topic": item.get("topic"),
        "prompt": item.get("prompt"),
        "code": item.get("code"),
        "skill": item.get("skill"),
        "skill_title": item.get("skill_title"),
        "grade": item.get("grade"),
        "difficulty": item.get("difficulty"),
        "soft": bool(item.get("soft")),
        "options": options,
        "answer": answer if isinstance(answer, list) else [answer],
        "explanation": item.get("explanation"),
    }


def _complexity_label(hint: str | None) -> str | None:
    if not hint:
        return None
    rewritten = {
        "Один проход с множеством увиденных чисел — O(n).": "Время O(n), память O(n).",
        "O(n log n) через массив минимальных хвостов.": "Время O(n log n), память O(n).",
        "Скользящее окно и позиция последнего вхождения символа.": "Время O(n), память O(min(n, |Σ|)).",
    }
    return rewritten.get(hint, hint)


def _practice_params(task: dict) -> dict:
    return {
        "section": "practice",
        "kind": "code",
        "bank_id": task.get("id"),
        "role": task.get("role"),
        "role_title": task.get("role_title"),
        "topic": task.get("topic"),
        "title": task.get("title"),
        "prompt": task.get("statement"),
        "skill_title": task.get("skill_title"),
        "grade": task.get("grade"),
        "difficulty": task.get("difficulty"),
        "language": "python3.12",
        "signature": task.get("signature"),
        "starter": task.get("starter"),
        "public_tests": task.get("public_tests") or [],
        "hidden": task.get("hidden_tests") or [],
        "complexity_hint": _complexity_label(task.get("complexity_hint")),
    }


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
    if grade_code not in BASE_DIFFICULTY:
        raise ApiError(422, "GRADE_NOT_ADJACENT", "Неизвестный грейд")
    _assert_adjacent(db, profile, purpose, grade_code)
    spec = _spec(db, spec_code)
    grade = _grade(db, grade_code)
    existing = open_session(db, profile.user_id)
    if existing:
        return existing
    seed = new_token()
    rng = random.Random(seed)
    theory = _pick_theory(rng, spec.code, grade.code)
    practice = _pick_practice(rng, spec.code, grade.code)
    difficulties = [float(item.get("difficulty") or 0) for item in theory + practice]
    mean = round(sum(difficulties) / len(difficulties), 2)
    session = AssessmentSession(
        candidate_id=profile.user_id,
        specialization_id=spec.id,
        claimed_grade_id=grade.id,
        purpose=purpose,
        seed=seed,
        mean_difficulty=mean,
        difficulty_warning=abs(mean - BASE_DIFFICULTY[grade.code]) > 0.8,
    )
    db.add(session)
    db.flush()
    anchor = _anchor_item(db, spec.id)
    position = 1
    for item in theory:
        db.add(
            AssessmentSessionItem(
                session_id=session.id,
                item_id=anchor.id,
                position=position,
                weight=1,
                params=_theory_params(rng, item),
            )
        )
        position += 1
    for task in practice:
        db.add(
            AssessmentSessionItem(
                session_id=session.id,
                item_id=anchor.id,
                position=position,
                weight=1,
                params=_practice_params(task),
            )
        )
        position += 1
    if purpose == "down":
        profile.down_used = True
    if purpose == "up":
        profile.up_used = True
    db.commit()
    return session


def _deadline(session: AssessmentSession):
    return session.started_at + timedelta(minutes=settings.session_minutes)


def public_session(db: Session, session: AssessmentSession) -> dict:
    spec = db.get(Specialization, session.specialization_id)
    grade = db.get(Grade, session.claimed_grade_id)
    items = (
        db.query(AssessmentSessionItem)
        .filter(AssessmentSessionItem.session_id == session.id)
        .order_by(AssessmentSessionItem.position)
        .all()
    )
    finished = session.status != "started"
    public_items = []
    for item in items:
        params = dict(item.params or {})
        saved = dict(item.answer or {})
        kind = params.get("kind")
        entry = {
            "id": item.id,
            "position": item.position,
            "section": params.get("section"),
            "kind": kind,
            "topic": params.get("topic"),
            "prompt": params.get("prompt"),
            "title": params.get("title"),
            "skill_title": params.get("skill_title"),
            "grade": params.get("grade"),
            "grade_title": GRADE_TITLES.get(params.get("grade"), params.get("grade")),
            "difficulty": params.get("difficulty"),
            "soft": bool(params.get("soft")),
            "role": params.get("role"),
            "role_title": params.get("role_title"),
        }
        if kind in {"single", "multi"}:
            entry["options"] = params.get("options") or []
            entry["code"] = params.get("code")
            if saved.get("choice_ids"):
                entry["choice_ids"] = saved.get("choice_ids")
            if saved.get("choice_id"):
                entry["choice_id"] = saved.get("choice_id")
        else:
            entry["language"] = "python3.12"
            entry["signature"] = params.get("signature")
            entry["starter"] = params.get("starter")
            entry["source"] = saved.get("source") if saved.get("source") is not None else params.get("starter")
            entry["public_tests"] = params.get("public_tests") or []
            entry["hidden_count"] = len(params.get("hidden") or [])
            entry["complexity_hint"] = _complexity_label(params.get("complexity_hint"))
        if finished:
            entry["correct"] = item.correct
            entry["points"] = saved.get("points")
            entry["explanation"] = params.get("explanation")
            if kind in {"single", "multi"}:
                entry["answer"] = params.get("answer")
        public_items.append(entry)
    return {
        "id": session.id,
        "status": session.status,
        "purpose": session.purpose,
        "score": session.score,
        "mean_difficulty": session.mean_difficulty,
        "specialization_code": spec.code if spec else None,
        "claimed_grade": grade.code if grade else None,
        "claimed_grade_title": GRADE_TITLES.get(grade.code, grade.code) if grade else None,
        "duration_minutes": settings.session_minutes,
        "theory_minutes": 30,
        "practice_minutes": 30,
        "started_at": session.started_at.isoformat() + "Z",
        "deadline": _deadline(session).isoformat() + "Z",
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


def _selected(incoming: dict) -> set[str]:
    ids = incoming.get("choice_ids")
    if ids:
        return {str(item) for item in ids if item}
    choice = incoming.get("choice_id")
    return {str(choice)} if choice else set()


def _theory_points(params: dict, incoming: dict) -> float:
    answer = {str(item) for item in (params.get("answer") or []) if item}
    selected = _selected(incoming)
    if not answer or not selected or selected - answer:
        return 0.0
    return len(selected & answer) / len(answer)


def _practice_points(params: dict, source: str) -> float:
    hidden = list(params.get("hidden") or [])
    if not hidden:
        return 0.0
    checks = run_hidden_tests(source, "python3.12", hidden)
    if not checks:
        return 0.0
    return sum(1 for item in checks if item) / len(hidden)


def save_answers(db: Session, session: AssessmentSession, answers: list[dict]) -> None:
    if session.status != "started":
        raise ApiError(409, "SESSION_EXPIRED", "Попытка уже сдана")
    by_id = {int(item["item_id"]): item for item in answers}
    rows = db.query(AssessmentSessionItem).filter(AssessmentSessionItem.session_id == session.id).all()
    for row in rows:
        incoming = by_id.get(row.id)
        if not incoming:
            continue
        params = row.params or {}
        current = dict(row.answer or {})
        if params.get("kind") == "code":
            if "source" in incoming and incoming.get("source") is not None:
                current["source"] = incoming.get("source") or ""
        else:
            if incoming.get("choice_ids") is not None:
                current["choice_ids"] = incoming.get("choice_ids") or []
                current.pop("choice_id", None)
            elif incoming.get("choice_id") is not None:
                current["choice_id"] = incoming.get("choice_id")
                current.pop("choice_ids", None)
        row.answer = current
    db.commit()


def submit_session(db: Session, profile: CandidateProfile, session: AssessmentSession, answers: list[dict]) -> dict:
    if session.status != "started":
        raise ApiError(409, "SESSION_EXPIRED", "Попытка уже сдана")
    by_id = {int(item["item_id"]): item for item in answers}
    rows = db.query(AssessmentSessionItem).filter(AssessmentSessionItem.session_id == session.id).all()
    theory_points: list[float] = []
    practice_points: list[float] = []
    review = []
    for row in rows:
        params = row.params or {}
        raw = by_id.get(row.id) or {}
        incoming = {**(row.answer or {})}
        for key, value in raw.items():
            if value is not None:
                incoming[key] = value
        if params.get("section") == "practice" or params.get("kind") == "code":
            source = incoming.get("source") or ""
            points = _practice_points(params, source)
            practice_points.append(points)
            row.answer = {"source": source, "points": round(points, 4)}
        else:
            points = _theory_points(params, incoming)
            theory_points.append(points)
            stored = {"points": round(points, 4)}
            if incoming.get("choice_ids"):
                stored["choice_ids"] = incoming.get("choice_ids")
            elif incoming.get("choice_id"):
                stored["choice_id"] = incoming.get("choice_id")
            row.answer = stored
        row.correct = points >= 0.999
        review.append({
            "id": row.id,
            "section": params.get("section"),
            "topic": params.get("topic"),
            "correct": row.correct,
            "points": round(points, 4),
        })
    theory_score = sum(theory_points) / THEORY_COUNT
    practice_score = sum(practice_points) / PRACTICE_COUNT if practice_points else 0
    score = round(100 * (0.5 * theory_score + 0.5 * practice_score), 1)
    now = utcnow()
    session.score = score
    session.submitted_at = now
    elapsed = int((now - session.started_at).total_seconds())
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
    elif outcome == "strong" and session.purpose == "initial" and grade.code != "lead":
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
        "theory_score": round(100 * theory_score, 1),
        "practice_score": round(100 * practice_score, 1),
        "elapsed_seconds": elapsed,
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
