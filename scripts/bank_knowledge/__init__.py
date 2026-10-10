"""База знаний для банка заданий.

Каждый модуль домена объявляет темы через topic(). Тема привязана к коду навыка
из data/skill_map.json и к грейду, на котором её спрашивают впервые.

Форматы:
  facts     — кортежи ("верное утверждение", "ложный двойник 1", "ложный двойник 2", ...)
  terms     — кортежи ("термин", "определение")
  questions — словари {"q": вопрос, "o": [варианты], "a": индекс верного, "e": пояснение,
              "multi": [индексы] для нескольких верных, "code": фрагмент кода}
"""

from __future__ import annotations

TOPICS: list[dict] = []

GRADES = ("intern", "junior", "middle", "senior", "lead")


def topic(skill: str, grade: str, title: str, facts=(), terms=(), questions=(), soft: bool = False) -> None:
    if grade not in GRADES:
        raise ValueError(f"неизвестный грейд {grade} в теме {skill}/{title}")
    for fact in facts:
        if len(fact) < 2:
            raise ValueError(f"у факта должен быть хотя бы один ложный двойник: {skill}/{title}: {fact[0]}")
    TOPICS.append(
        {
            "skill": skill,
            "grade": grade,
            "title": title,
            "facts": [tuple(fact) for fact in facts],
            "terms": [tuple(term) for term in terms],
            "questions": list(questions),
            "soft": soft,
        }
    )
