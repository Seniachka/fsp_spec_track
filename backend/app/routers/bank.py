"""Публичный каталог навыков и банк заданий (data/skill_map.json, data/task_bank.json).

Файлы собираются скриптами scripts/build_skill_map.py и scripts/build_task_bank.py,
здесь они только читаются и отдаются по частям: банк на 11 тыс. вопросов целиком
в браузер не отправляем.
"""

import json
import threading
from pathlib import Path

from fastapi import APIRouter, Query

from app.config import settings
from app.errors import ApiError

router = APIRouter(tags=["bank"], prefix="/bank")

GRADE_ORDER = ["intern", "junior", "middle", "senior", "lead"]

_lock = threading.Lock()
_cache: dict[str, tuple[float, dict]] = {}


def _data_dir() -> Path:
    if settings.bank_data_dir:
        return Path(settings.bank_data_dir)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "data"
        if (candidate / "task_bank.json").exists() or (candidate / "skill_map.json").exists():
            return candidate
    return here.parents[2] / "data"


def _load(name: str) -> dict:
    path = _data_dir() / name
    if not path.exists():
        raise ApiError(404, "BANK_NOT_BUILT", f"Файл {name} не найден. Соберите его скриптом из scripts/.")
    mtime = path.stat().st_mtime
    with _lock:
        cached = _cache.get(name)
        if cached and cached[0] == mtime:
            return cached[1]
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        if name == "task_bank.json":
            _index_bank(payload)
        _cache[name] = (mtime, payload)
        return payload


def _index_bank(bank: dict) -> None:
    by_skill: dict[str, list[dict]] = {}
    by_id: dict[str, dict] = {}
    for item in bank.get("theory", []):
        by_skill.setdefault(item["skill"], []).append(item)
        by_id[item["id"]] = item
    for item in bank.get("practice", []):
        by_id[item["id"]] = item
    bank["_by_skill"] = by_skill
    bank["_by_id"] = by_id


def _skill_map() -> dict:
    return _load("skill_map.json")


def _bank() -> dict:
    return _load("task_bank.json")


def _public_theory(item: dict, reveal: bool) -> dict:
    row = {key: value for key, value in item.items() if not key.startswith("_")}
    if not reveal:
        row.pop("answer", None)
        row.pop("explanation", None)
    return row


def _public_practice(item: dict, reveal: bool) -> dict:
    row = {key: value for key, value in item.items() if not key.startswith("_")}
    row["hidden_tests_count"] = len(item.get("hidden_tests", []))
    if not reveal:
        row.pop("hidden_tests", None)
    return row


@router.get("/overview")
def overview():
    """Сводка: грейды, специализации, навыки с покрытием, план экзамена."""
    skills = _skill_map()
    bank = _bank()
    coverage = {row["skill"]: row for row in bank.get("coverage", [])}
    practice_by_grade: dict[str, int] = {}
    for item in bank.get("practice", []):
        practice_by_grade[item["grade"]] = practice_by_grade.get(item["grade"], 0) + 1

    def skill_row(skill: dict, soft: bool) -> dict:
        cov = coverage.get(skill["code"], {})
        return {
            "code": skill["code"],
            "title": skill["title"],
            "category": skill.get("category"),
            "soft": soft,
            "mentions": skill.get("mentions", 0),
            "exam_positions": skill.get("exam_positions", []),
            "questions": cov.get("questions", {}),
            "topics": cov.get("topics", {}),
            "total": cov.get("total", 0),
        }

    return {
        "built_at": {"skills": skills.get("built_at"), "bank": bank.get("built_at")},
        "specializations": skills.get("specializations", []),
        "grades": bank.get("grades", skills.get("grades", [])),
        "levels": skills.get("levels", {}),
        "blueprint": bank.get("blueprint", {}),
        "counts": bank.get("counts", {}),
        "skills": [skill_row(s, False) for s in skills.get("skills", [])],
        "soft_skills": [skill_row(s, True) for s in skills.get("soft_skills", [])],
        "positions": [
            {
                "specialization": p["specialization"],
                "grade": p["grade"],
                "vacancies": p.get("vacancies", 0),
                "exam_skills": p.get("exam_skills", []),
                "soft_skills": [s["code"] for s in p.get("soft_skills", [])],
            }
            for p in skills.get("positions", [])
        ],
    }


@router.get("/positions/{specialization}/{grade}")
def position(specialization: str, grade: str):
    """Требования к должности: hard-навыки с уровнем, софты, темы и число заданий по каждому навыку."""
    skills = _skill_map()
    bank = _bank()
    found = next(
        (p for p in skills.get("positions", []) if p["specialization"] == specialization and p["grade"] == grade),
        None,
    )
    if not found:
        raise ApiError(404, "NOT_FOUND", "Такой должности нет в карте навыков")
    coverage = {row["skill"]: row for row in bank.get("coverage", [])}
    bank_position = next(
        (p for p in bank.get("positions", []) if p["specialization"] == specialization and p["grade"] == grade),
        {},
    )
    soft_codes = set(bank_position.get("soft_skills", [])) | {s["code"] for s in found.get("soft_skills", [])}
    soft_meta = {s["code"]: s for s in skills.get("soft_skills", [])}
    soft_market = {s["code"]: s for s in found.get("soft_skills", [])}

    def with_coverage(skill: dict) -> dict:
        cov = coverage.get(skill["code"], {})
        return {
            **skill,
            "topics": cov.get("topics", {}),
            "questions": cov.get("questions", {}),
            "total_questions": cov.get("total", 0),
        }

    hard = [with_coverage(s) for s in found.get("hard_skills", [])]
    soft = []
    for code in sorted(soft_codes, key=lambda c: -soft_market.get(c, {}).get("weight", 0)):
        meta = soft_market.get(code) or {
            "code": code,
            "title": soft_meta.get(code, {}).get("title", code),
            "category": "soft",
            "mentions": 0,
            "share": 0,
            "level": "baseline",
        }
        soft.append(with_coverage({**meta, "baseline": code in bank.get("soft_baseline", {}).get(grade, [])}))

    grade_index = GRADE_ORDER.index(grade) if grade in GRADE_ORDER else 2
    neighbor = [GRADE_ORDER[i] for i in range(max(0, grade_index - 1), min(len(GRADE_ORDER), grade_index + 2))]
    practice = [
        _public_practice(item, reveal=False)
        for item in bank.get("practice", [])
        if item["grade"] in neighbor
    ]
    return {
        "specialization": specialization,
        "specialization_title": found.get("specialization_title"),
        "grade": grade,
        "grade_title": found.get("grade_title"),
        "vacancies": found.get("vacancies", 0),
        "exam_skills": found.get("exam_skills", []),
        "hard_skills": hard,
        "soft_skills": soft,
        "missing_hard": bank_position.get("missing_hard", []),
        "missing_soft": bank_position.get("missing_soft", []),
        "blueprint": bank.get("blueprint", {}),
        "practice": practice,
    }


@router.get("/skills/{code}")
def skill_detail(code: str):
    """Навык: описание, где требуется, темы по грейдам и число вопросов."""
    skills = _skill_map()
    bank = _bank()
    meta = next((s for s in skills.get("skills", []) if s["code"] == code), None)
    soft = False
    if meta is None:
        meta = next((s for s in skills.get("soft_skills", []) if s["code"] == code), None)
        soft = meta is not None
    if meta is None:
        raise ApiError(404, "NOT_FOUND", "Навык не найден")
    coverage = next((row for row in bank.get("coverage", []) if row["skill"] == code), {})
    topics: dict[str, dict[str, dict]] = {}
    for item in bank["_by_skill"].get(code, []):
        bucket = topics.setdefault(item["grade"], {}).setdefault(
            item["topic"], {"title": item["topic"], "grade": item["grade"], "single": 0, "multi": 0, "total": 0}
        )
        bucket[item["kind"]] += 1
        bucket["total"] += 1
    return {
        **meta,
        "soft": soft,
        "coverage": coverage,
        "topics": {grade: list(rows.values()) for grade, rows in topics.items()},
    }


@router.get("/theory")
def theory(
    skill: str | None = None,
    grade: str | None = None,
    topic: str | None = None,
    kind: str | None = None,
    q: str | None = None,
    reveal: bool = True,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    """Теоретические вопросы с фильтрами. Банк открытый, ответы отдаются по умолчанию."""
    bank = _bank()
    source = bank["_by_skill"].get(skill, []) if skill else bank.get("theory", [])
    needle = (q or "").strip().lower()
    rows = []
    for item in source:
        if grade and item["grade"] != grade:
            continue
        if topic and item["topic"] != topic:
            continue
        if kind and item["kind"] != kind:
            continue
        if needle and needle not in item["prompt"].lower() and not any(
            needle in option["text"].lower() for option in item["options"]
        ):
            continue
        rows.append(item)
    page = rows[offset : offset + limit]
    return {
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "items": [_public_theory(item, reveal) for item in page],
    }


@router.get("/practice")
def practice(grade: str | None = None, domain: str | None = None, reveal: bool = False):
    """Практические задачи. Скрытые тесты отдаются только при reveal=true."""
    bank = _bank()
    rows = []
    for item in bank.get("practice", []):
        if grade and item["grade"] != grade:
            continue
        if domain and domain not in item.get("domains", []):
            continue
        rows.append(_public_practice(item, reveal))
    return {"total": len(rows), "items": rows}


@router.get("/items/{item_id}")
def item(item_id: str, reveal: bool = True):
    bank = _bank()
    found = bank["_by_id"].get(item_id)
    if not found:
        raise ApiError(404, "NOT_FOUND", "Задание не найдено")
    if found["kind"] == "code":
        return _public_practice(found, reveal)
    return _public_theory(found, reveal)
