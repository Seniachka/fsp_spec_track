"""Сборка банка заданий → data/task_bank.json.

Теория собирается из базы знаний scripts/bank_knowledge: каждый факт порождает
несколько вопросов разных форм, термины — вопросы на определение в обе стороны,
авторские вопросы включаются как есть. Практика — алгоритмические задачи с эталонным
решением: тесты генерируются детерминированно, 5 открытых и 15 скрытых.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import pkgutil
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import bank_knowledge  # noqa: E402
from bank_knowledge import practice as practice_module  # noqa: E402

SKILL_MAP = ROOT / "data" / "skill_map.json"
OUT = ROOT / "data" / "task_bank.json"

GRADE_ORDER = ["intern", "junior", "middle", "senior", "lead"]
GRADE_TITLES = {"intern": "Стажёр", "junior": "Junior", "middle": "Middle", "senior": "Senior", "lead": "Lead"}
BASE_DIFFICULTY = {"intern": 1.5, "junior": 2.0, "middle": 3.0, "senior": 4.0, "lead": 4.5}
LETTERS = "abcdef"

# базовые софты по грейду: рынок называет их не в каждой вакансии, но экзамен спрашивает всегда
SOFT_BASELINE = {
    "intern": ["learning", "communication", "responsibility", "attention"],
    "junior": ["learning", "communication", "responsibility", "attention", "teamwork"],
    "middle": ["communication", "responsibility", "autonomy", "time-management", "teamwork", "quality"],
    "senior": ["communication", "autonomy", "time-management", "mentoring", "stakeholders", "quality", "analytical"],
    "lead": ["leadership", "mentoring", "stakeholders", "time-management", "communication", "product-thinking", "stress"],
}

BLUEPRINT = {
    "total_minutes": 60,
    "theory": {
        "minutes": 30,
        "questions": 60,
        "seconds_per_question": 30,
        "mix": {
            "own_grade": 0.7,
            "grade_below": 0.2,
            "grade_above": 0.1,
        },
        "soft_share": 0.1,
        "kinds": {"single": 0.75, "multi": 0.25},
        "rule": (
            "60 вопросов за 30 минут: 70% тем своего грейда, 20% тем грейда ниже, 10% тем грейда выше; "
            "каждый десятый вопрос — софт-скиллы. Два кандидата получают разные вопросы одних и тех же тем."
        ),
    },
    "practice": {
        "minutes": 30,
        "tasks": 3,
        "minutes_per_task": 10,
        "rule": (
            "3 алгоритмические задачи за 30 минут: одна разминочная (сложность грейда − 1), "
            "одна целевая, одна выше грейда. У каждой 5 открытых и 15 скрытых тестов, язык Python 3.12."
        ),
    },
    "scoring": (
        "Теория: 1 балл за верный одиночный, за множественный — доля верно отмеченных без ложных. "
        "Практика: доля пройденных скрытых тестов. Итог = 0.5·теория + 0.5·практика. "
        "Решить всё за час почти невозможно — это задумано: рейтинг строится по доле решённого и по скорости."
    ),
}


def slug(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9а-яё]+", "-", text)
    return text.strip("-")[:48]


def short_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]


def load_knowledge() -> list[dict]:
    for module in pkgutil.iter_modules(bank_knowledge.__path__):
        if module.name == "practice":
            continue
        importlib.import_module(f"bank_knowledge.{module.name}")
    return bank_knowledge.TOPICS


def make_options(rng: random.Random, correct: list[str], wrong: list[str]) -> tuple[list[dict], list[str]]:
    texts = list(correct) + list(wrong)
    rng.shuffle(texts)
    options = [{"id": LETTERS[i], "text": text} for i, text in enumerate(texts)]
    answer = [option["id"] for option in options if option["text"] in set(correct)]
    return options, answer


def pick(rng: random.Random, pool: list[str], count: int, exclude: set[str]) -> list[str]:
    candidates = [item for item in dict.fromkeys(pool) if item not in exclude]
    rng.shuffle(candidates)
    return candidates[:count]


def build_theory(topics: list[dict], skill_titles: dict[str, str]) -> list[dict]:
    items: list[dict] = []
    by_skill_terms: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for t in topics:
        by_skill_terms[t["skill"]].extend(t["terms"])

    for t in topics:
        skill = t["skill"]
        grade = t["grade"]
        title = t["title"]
        base = BASE_DIFFICULTY[grade]
        rng = random.Random(short_id(skill, title))
        true_pool = [fact[0] for fact in t["facts"]]
        false_pool = [wrong for fact in t["facts"] for wrong in fact[1:]]
        prefix = f"{skill}-{slug(title)}"

        def emit(kind: str, prompt: str, correct: list[str], wrong: list[str], difficulty: float, source: str, explanation: str | None, tag: str, code: str | None = None):
            if len(correct) + len(wrong) < 3:
                return
            options, answer = make_options(rng, correct, wrong)
            items.append(
                {
                    "id": f"{prefix}-{tag}",
                    "kind": kind,
                    "skill": skill,
                    "skill_title": skill_titles.get(skill, skill),
                    "topic": title,
                    "grade": grade,
                    "difficulty": round(min(5.0, difficulty), 1),
                    "prompt": prompt,
                    "code": code,
                    "options": options,
                    "answer": answer if kind == "multi" else answer[0],
                    "explanation": explanation,
                    "source": source,
                    "soft": t["soft"],
                }
            )

        # факты: верное среди ложных (две разные раздачи дистракторов), ложное среди верных
        for index, fact in enumerate(t["facts"]):
            truth, *wrongs = fact
            own = list(wrongs)
            others = [w for w in false_pool if w not in own]
            for variant in range(2):
                wrong = own[:3] if variant == 0 else own[:1]
                wrong += pick(rng, others, 3 - len(wrong), set(wrong) | {truth})
                if len(wrong) < 3:
                    wrong += pick(rng, own, 3 - len(wrong), set(wrong))
                if len(wrong) < 2:
                    continue
                emit(
                    "single",
                    f"Какое утверждение о теме «{title}» верно?",
                    [truth],
                    wrong,
                    base,
                    "fact",
                    truth,
                    f"f{index}-{variant}",
                )
            trues = pick(rng, true_pool, 3, {truth})
            if len(trues) >= 2:
                emit(
                    "single",
                    f"Какое утверждение о теме «{title}» НЕВЕРНО?",
                    [own[0]],
                    trues,
                    base + 0.3,
                    "fact",
                    f"Верно так: {truth}",
                    f"n{index}",
                )

        # несколько верных
        if len(t["facts"]) >= 4:
            indices = list(range(len(t["facts"])))
            rng.shuffle(indices)
            groups = [indices[i : i + 2] for i in range(0, len(indices) - 1, 2)]
            for gi, group in enumerate(groups):
                correct = [t["facts"][i][0] for i in group]
                wrong = pick(rng, false_pool, 2, set(correct) | {w for i in group for w in t["facts"][i][1:]})
                if len(wrong) < 2:
                    wrong = pick(rng, false_pool, 2, set(correct))
                emit(
                    "multi",
                    f"Отметьте все верные утверждения о теме «{title}».",
                    correct,
                    wrong,
                    base + 0.5,
                    "fact",
                    " / ".join(correct),
                    f"m{gi}",
                )
            # три верных и одно ложное — другая раздача, чтобы нельзя было угадать «ровно два»
            if len(t["facts"]) >= 5:
                indices = list(range(len(t["facts"])))
                rng.shuffle(indices)
                triples = [indices[i : i + 3] for i in range(0, len(indices) - 2, 3)]
                for gi, group in enumerate(triples):
                    correct = [t["facts"][i][0] for i in group]
                    wrong = pick(rng, false_pool, 1, set(correct) | {w for i in group for w in t["facts"][i][1:]})
                    if not wrong:
                        continue
                    emit(
                        "multi",
                        f"Отметьте все верные утверждения о теме «{title}».",
                        correct,
                        wrong,
                        base + 0.6,
                        "fact",
                        " / ".join(correct),
                        f"m3-{gi}",
                    )
            # одно верное из всех, остальные ложные — multi с единственным верным
            if len(t["facts"]) >= 4:
                for gi, fact in enumerate(t["facts"][:2]):
                    truth, *wrongs = fact
                    wrong = pick(rng, false_pool, 3, {truth} | set(wrongs))
                    if len(wrong) < 3:
                        continue
                    emit(
                        "multi",
                        f"Отметьте все верные утверждения о теме «{title}» (верных может быть одно или несколько).",
                        [truth],
                        wrong,
                        base + 0.4,
                        "fact",
                        truth,
                        f"m1-{gi}",
                    )

        # термины в обе стороны
        definitions_pool = [definition for _term, definition in by_skill_terms[skill]]
        terms_pool = [term for term, _definition in by_skill_terms[skill]]
        for index, (term, definition) in enumerate(t["terms"]):
            wrong_defs = pick(rng, definitions_pool, 3, {definition})
            emit(
                "single",
                f"Что означает термин «{term}»?",
                [definition],
                wrong_defs,
                base - 0.2,
                "term",
                f"{term} — {definition}",
                f"t{index}",
            )
            wrong_terms = pick(rng, terms_pool, 3, {term})
            emit(
                "single",
                f"Какой термин соответствует описанию: «{definition}»?",
                [term],
                wrong_terms,
                base,
                "term",
                f"{term} — {definition}",
                f"r{index}",
            )

        # авторские вопросы
        for index, question in enumerate(t["questions"]):
            options = list(question["o"])
            if "multi" in question:
                correct = [options[i] for i in question["multi"]]
                wrong = [o for i, o in enumerate(options) if i not in question["multi"]]
                emit("multi", question["q"], correct, wrong, base + 0.5, "author", question.get("e"), f"q{index}", question.get("code"))
            else:
                correct = [options[question["a"]]]
                wrong = [o for i, o in enumerate(options) if i != question["a"]]
                emit("single", question["q"], correct, wrong, base + 0.2, "author", question.get("e"), f"q{index}", question.get("code"))
    return items


def build_practice() -> list[dict]:
    items = []
    for task in practice_module.TASKS:
        rng = random.Random(short_id("practice", task["code"]))
        cases = []
        seen = set()
        for sample in task.get("samples", []):
            key = json.dumps(sample, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            cases.append({"args": sample, "expected": task["solve"](*json.loads(json.dumps(sample)))})
        attempts = 0
        while len(cases) < 20 and attempts < 600:
            attempts += 1
            args = task["gen"](rng)
            key = json.dumps(args, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            expected = task["solve"](*json.loads(json.dumps(args)))
            cases.append({"args": args, "expected": expected})
        if len(cases) < 20:
            raise ValueError(f"задача {task['code']}: удалось собрать только {len(cases)} тестов")
        items.append(
            {
                "id": f"practice-{task['code']}",
                "kind": "code",
                "skill": "algorithms",
                "skill_title": "Алгоритмы и структуры данных",
                "domains": task.get("domains", []),
                "grade": task["grade"],
                "difficulty": task["difficulty"],
                "title": task["title"],
                "topic": task["topic"],
                "statement": task["statement"].strip(),
                "signature": task["signature"],
                "starter": task.get("starter") or "def solve(*args):\n    pass\n",
                "language": "python3.12",
                "time_limit_minutes": 10,
                "complexity_hint": task.get("hint"),
                "public_tests": cases[:5],
                "hidden_tests": cases[5:],
            }
        )
    return items


def main() -> int:
    skill_map = json.loads(SKILL_MAP.read_text(encoding="utf-8"))
    skill_titles = {row["code"]: row["title"] for row in skill_map["skills"]}
    skill_titles.update({row["code"]: row["title"] for row in skill_map["soft_skills"]})

    topics = load_knowledge()
    unknown = sorted({t["skill"] for t in topics if t["skill"] not in skill_titles})
    if unknown:
        print("темы ссылаются на неизвестные навыки:", ", ".join(unknown))
        return 1

    theory = build_theory(topics, skill_titles)
    practice = build_practice()

    ids = Counter(item["id"] for item in theory + practice)
    duplicates = [key for key, count in ids.items() if count > 1]
    if duplicates:
        print("дубли идентификаторов:", duplicates[:10])
        return 1

    # покрытие: навык × грейд → число тем и вопросов
    coverage: dict[str, dict] = {}
    for item in theory:
        row = coverage.setdefault(item["skill"], {"skill": item["skill"], "title": item["skill_title"], "topics": {}, "questions": Counter()})
        row["topics"].setdefault(item["grade"], set()).add(item["topic"])
        row["questions"][item["grade"]] += 1
    coverage_rows = []
    for code, row in coverage.items():
        coverage_rows.append(
            {
                "skill": code,
                "title": row["title"],
                "topics": {grade: sorted(titles) for grade, titles in row["topics"].items()},
                "questions": dict(row["questions"]),
                "total": sum(row["questions"].values()),
            }
        )
    coverage_rows.sort(key=lambda row: row["title"])

    # экзаменационные навыки по должностям, с пометкой пробелов
    covered = set(coverage)
    positions = []
    for position in skill_map["positions"]:
        hard = position["exam_skills"]
        soft = SOFT_BASELINE[position["grade"]]
        market_soft = [row["code"] for row in position["soft_skills"] if row["level"] in {"core", "expected"}]
        for code in market_soft:
            if code not in soft:
                soft.append(code)
        positions.append(
            {
                "specialization": position["specialization"],
                "grade": position["grade"],
                "hard_skills": hard,
                "soft_skills": soft,
                "missing_hard": [code for code in hard if code not in covered],
                "missing_soft": [code for code in soft if code not in covered],
            }
        )

    document = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source": {"skills": "data/skill_map.json", "knowledge": "scripts/bank_knowledge"},
        "blueprint": BLUEPRINT,
        "grades": [{"code": code, "title": GRADE_TITLES[code], "base_difficulty": BASE_DIFFICULTY[code]} for code in GRADE_ORDER],
        "soft_baseline": SOFT_BASELINE,
        "counts": {
            "theory": len(theory),
            "practice": len(practice),
            "topics": len(topics),
            "skills_covered": len(covered),
            "theory_by_grade": dict(Counter(item["grade"] for item in theory)),
            "practice_by_grade": dict(Counter(item["grade"] for item in practice)),
        },
        "coverage": coverage_rows,
        "positions": positions,
        "theory": theory,
        "practice": practice,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=1), encoding="utf-8")

    print("тем", len(topics), "теория", len(theory), "практика", len(practice), "навыков покрыто", len(covered))
    print("по грейдам", document["counts"]["theory_by_grade"], document["counts"]["practice_by_grade"])
    gaps = [(p["specialization"], p["grade"], p["missing_hard"]) for p in positions if p["missing_hard"]]
    if gaps:
        print("пробелы по навыкам:")
        for spec, grade, missing in gaps:
            print(f"  {spec}/{grade}: {', '.join(missing)}")
    print("размер", OUT.stat().st_size // 1024, "КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
