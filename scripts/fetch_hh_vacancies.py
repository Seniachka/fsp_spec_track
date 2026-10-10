"""Сбор публичных IT-вакансий hh.ru в data/hh_it_vacancies.json.

API api.hh.ru/vacancies с этой сети отвечает 403 (ddos-guard), поэтому
карточки читаются с тех же страниц, которые отдаёт сайт браузеру:
поиск и карточка вакансии, начальное состояние в HH-Lux-InitialState.
Контакты рекрутеров не сохраняются.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "hh_it_vacancies.json"
MIN_PER_CELL = 5
AREA = "113"
PAUSE = 0.45

SPECS = [
    {
        "code": "backend",
        "title": "Backend-разработка",
        "roles": ["96", "104"],
        "queries": ["Backend", "Бэкенд", "Back-end"],
        "accept": r"backend|back[\s-]?end|бэкенд|бекенд|бекэнд",
        "reject": r"frontend|front[\s-]?end|фронтенд|\bandroid\b|\bios\b|flutter|react native|тестиров|\bqa\b|аналитик|devops|\bsre\b|преподаватель|дизайнер|fullstack|full[\s-]?stack|фуллстек|data scientist",
    },
    {
        "code": "frontend",
        "title": "Frontend-разработка",
        "roles": ["96", "104"],
        "queries": ["Frontend", "Фронтенд", "Front-end", "React", "Vue"],
        "accept": r"frontend|front[\s-]?end|фронтенд|фронтэнд|\breact\b|\bvue\b|angular",
        "reject": r"backend|бэкенд|\bandroid\b|\bios\b|flutter|react native|мобильн|тестиров|\bqa\b|аналитик|devops|преподаватель|fullstack|full[\s-]?stack|фуллстек",
    },
    {
        "code": "qa",
        "title": "QA и тестирование",
        "roles": ["124"],
        "queries": ["QA", "Тестировщик", "инженер по тестированию", "SDET"],
        "accept": r"\bqa\b|тестиров|quality assurance|sdet|автотест",
        "reject": r"преподаватель|нагрузочного стенда|продаж",
    },
    {
        "code": "data",
        "title": "Данные и аналитика",
        "roles": ["156", "148", "96", "104"],
        "queries": ["аналитик данных", "Data Analyst", "Data Engineer", "инженер данных", "системный аналитик", "BI-аналитик"],
        "accept": r"аналитик данных|data analyst|data engineer|инженер данных|дата-аналитик|системн\w+\s+аналитик|bi[-\s]?аналитик|\bbi\b|\bdwh\b",
        "reject": r"бизнес-аналитик|продакт|product manager|маркетолог|преподаватель|финансов",
    },
    {
        "code": "devops",
        "title": "DevOps / SRE",
        "roles": ["160", "96"],
        "queries": ["DevOps", "SRE", "DevOps-инженер"],
        "accept": r"devops|\bsre\b|site reliability",
        "reject": r"преподаватель|рекрутер",
    },
    {
        "code": "mobile",
        "title": "Мобильная разработка",
        "roles": ["96", "104"],
        "queries": ["Android", "iOS", "Flutter", "React Native", "мобильный разработчик", "Unity", "мобильных приложений"],
        "accept": r"\bandroid\b|\bios\b|\bswift\b|flutter|react native|мобильн|\bunity\b",
        "reject": r"тестиров|\bqa\b|преподаватель|backend|бэкенд|frontend|фронтенд|безопасност|security|банкир|\bкурьер\b",
    },
    {
        "code": "ml",
        "title": "Machine Learning",
        "roles": ["165", "96", "104"],
        "queries": ["Data Scientist", "ML-инженер", "ML инженер", "Machine Learning", "машинного обучения"],
        "accept": r"machine learning|машинн\w+\s+обучен|data scientist|дата-сайентист|ml[-\s]?инженер|\bml engineer\b|\bnlp\b|computer vision|deep learning",
        "reject": r"преподаватель|рекрутер|менеджер по продаж",
    },
    {
        "code": "security",
        "title": "Информационная безопасность",
        "roles": [],
        "queries": ["информационной безопасности", "кибербезопасности", "Information Security", "AppSec", "DevSecOps", "ИБ"],
        "accept": r"информационн\w+\s+безопасност|кибербезопасност|information security|\bappsec\b|devsecops|пентест|penetration|\bsoc\b|security engineer|инженер иб|специалист по иб|application security|\bиб\b",
        "reject": r"пожар|охране труда|охрана труда|го и чс|промышленн\w+\s+безопасност|экономическ\w+\s+безопасност|физическ|продвижен|продаж",
    },
]

GRADES = [
    {
        "code": "intern",
        "title": "Стажёр",
        "words": ["стажер", "стажёр", "Intern", "Trainee", "практикант", "стажировка"],
        "accept": r"стаж[её]р|стажировк|\bintern\b|\btrainee\b",
        "experience": ["noExperience"],
        "allow_experience_fallback": True,
    },
    {
        "code": "junior",
        "title": "Junior",
        "words": ["Junior", "Джуниор", "младший"],
        "accept": r"\bjunior\b|джуниор|\bджун\b|\bjr\b|младш",
        "experience": ["noExperience"],
        "allow_experience_fallback": True,
    },
    {
        "code": "middle",
        "title": "Middle",
        "words": ["Middle", "Мидл", "Миддл"],
        "accept": r"\bmiddle\b|\bmid\b|миддл|\bмидл\b",
        "experience": ["between3And6"],
        "allow_experience_fallback": True,
    },
    {
        "code": "senior",
        "title": "Senior",
        "words": ["Senior", "Сеньор", "старший", "ведущий"],
        "accept": r"\bsenior\b|сеньор|синьор|старш|ведущ",
        "experience": ["moreThan6"],
        "allow_experience_fallback": True,
    },
    {
        "code": "lead",
        "title": "Lead",
        "words": ["Lead", "Teamlead", "тимлид", "техлид", "руководитель"],
        "accept": r"\blead\b|тим[\s-]?лид|team[\s-]?lead|tech[\s-]?lead|техлид|руководитель|начальник\s+(группы|отдела|управления|центра)|head of|\bciso\b",
        "experience": ["moreThan6"],
        "allow_experience_fallback": False,
    },
]

GRADE_BY_CODE = {item["code"]: item for item in GRADES}
SPEC_BY_CODE = {item["code"]: item for item in SPECS}
GLOBAL_REJECT = re.compile(
    r"преподавател|репетитор|методист|куратор курса|менеджер по продажам|"
    r"рекрутер|\bhr\b|бухгалтер|юрист|\bводитель\b|\bкурьер\b",
    re.I,
)
ROLE_NAMES = {
    "96": "Программист, разработчик",
    "104": "Руководитель группы разработки",
    "124": "Тестировщик",
    "156": "BI-аналитик, аналитик данных",
    "148": "Системный аналитик",
    "165": "Дата-сайентист",
    "160": "DevOps-инженер",
    "116": "Специалист по информационной безопасности",
    "10": "Аналитик",
    "150": "Бизнес-аналитик",
}
EXPERIENCE_NAMES = {
    "noExperience": "Нет опыта",
    "between1And3": "От 1 года до 3 лет",
    "between3And6": "От 3 до 6 лет",
    "moreThan6": "Более 6 лет",
}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.skip = True
        if tag == "li":
            self.parts.append("\n- ")
        elif tag in {"p", "div", "br", "tr", "h1", "h2", "h3", "h4", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.skip = False
        if tag in {"p", "li", "h1", "h2", "h3", "h4", "div"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(raw: str) -> str:
    parser = _Text()
    parser.feed(raw or "")
    text = unescape("".join(parser.parts))
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]*-[ \t]*\n+", "\n- ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


HEADER_RULES = (
    (
        "requirements",
        re.compile(
            r"требован|ожидаем|мы ищем|кого мы ищем|человек, которого|наши ожидания|"
            r"что мы жд|для нас важно|нужно знать|подходишь, если|ждём от|ждем от|"
            r"кого хотим|наши пожелания к",
            re.I,
        ),
    ),
    (
        "responsibilities",
        re.compile(
            r"обязанност|предстоит|будешь делать|будете делать|нужно делать|^задачи\b|"
            r"чем заниматься|твои задачи|ваши задачи|что делать|чем предстоит",
            re.I,
        ),
    ),
    (
        "nice_to_have",
        re.compile(r"плюсом|преимуществом|желательно|будет плюс|плюс(ами|ом)? будут", re.I),
    ),
    (
        "conditions",
        re.compile(r"^условия\b|предлагаем|рады предложить|что мы да(?:е|ё)м|мы предлагаем", re.I),
    ),
)


def split_sections(text: str) -> dict[str, str]:
    buckets: dict[str, list[str]] = {
        "requirements": [],
        "responsibilities": [],
        "nice_to_have": [],
        "conditions": [],
    }
    current: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        chunk = "\n".join(buffer).strip()
        if current and chunk:
            buckets[current].append(chunk)
        buffer = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line and len(line) <= 140 and not line.startswith(("-", "•", "—")):
            matched = next((key for key, pattern in HEADER_RULES if pattern.search(line)), None)
            if matched:
                flush()
                current = matched
                continue
        if current:
            buffer.append(raw_line)
    flush()
    return {key: "\n\n".join(parts) for key, parts in buckets.items() if parts}


def classify_grade(title: str) -> str | None:
    hits = [item["code"] for item in GRADES if re.search(item["accept"], title, re.I)]
    if "lead" in hits:
        return "lead"
    if "intern" in hits:
        return "intern"
    core = [code for code in ("junior", "middle", "senior") if code in hits]
    if core:
        return core[0]
    return None


def matches_spec(spec: dict, title: str) -> bool:
    if GLOBAL_REJECT.search(title):
        return False
    if not re.search(spec["accept"], title, re.I):
        return False
    if re.search(spec["reject"], title, re.I):
        return False
    return True


class HhClient:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        self._warm()

    def _warm(self) -> None:
        self._get("https://hh.ru/")

    def _get(self, url: str, params=None) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                response = self.session.get(url, params=params, timeout=40)
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(2 + attempt * 3)
                continue
            if response.status_code in {403, 429, 503}:
                time.sleep(8 + attempt * 7)
                continue
            if response.status_code >= 500:
                time.sleep(2 + attempt * 2)
                continue
            time.sleep(PAUSE)
            return response
        if last_error:
            raise last_error
        raise RuntimeError(f"hh.ru не отдаёт страницу: {url}")

    def state(self, url: str, params=None) -> dict | None:
        response = self._get(url, params=params)
        if response.status_code != 200:
            print(f"  http {response.status_code} {response.url}", flush=True)
            return None
        match = re.search(r'id="HH-Lux-InitialState">(.*?)</template>', response.text)
        if not match:
            print("  нет начального состояния страницы", flush=True)
            return None
        return json.loads(unescape(match.group(1)))

    def search(
        self,
        text: str,
        roles: list[str],
        experience: str | None = None,
        page: int = 0,
        in_name: bool = True,
    ) -> tuple[list[dict], int]:
        params: list[tuple[str, str]] = [
            ("text", text),
            ("area", AREA),
            ("items_on_page", "50"),
            ("page", str(page)),
            ("order_by", "publication_time"),
        ]
        if in_name:
            params.append(("search_field", "name"))
        for role in roles:
            params.append(("professional_role", role))
        if experience:
            params.append(("experience", experience))
        state = self.state("https://hh.ru/search/vacancy", params)
        if not state:
            return [], 0
        result = state.get("vacancySearchResult") or {}
        total = int(result.get("totalResults") or 0)
        batch = result.get("vacancies") or []
        print(
            f"  поиск «{text}» exp={experience or '-'} стр={page} "
            f"найдено={total} карточек={len(batch) if total else 0}",
            flush=True,
        )
        if total <= 0:
            return [], 0
        return batch, total

    def vacancy(self, vacancy_id: int) -> dict | None:
        state = self.state(f"https://hh.ru/vacancy/{vacancy_id}")
        if not state:
            return None
        full = ((state.get("vacancyView") or {}).get("vacancyFull") or {})
        vacancy = full.get("vacancy")
        if not vacancy:
            return None
        vacancy["_extra"] = full.get("extraVacancyFields") or {}
        return vacancy


def company_name(company: dict | None) -> tuple[str | None, str | None]:
    company = company or {}
    return str(company.get("id") or "") or None, company.get("visibleName") or company.get("name")


def role_ids(raw) -> list[str]:
    found: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                nested = item.get("professionalRoleId")
                if isinstance(nested, list):
                    found.extend(str(value) for value in nested)
                elif nested is not None:
                    found.append(str(nested))
            elif item is not None:
                found.append(str(item))
    elif isinstance(raw, dict):
        nested = raw.get("professionalRoleId")
        if isinstance(nested, list):
            found.extend(str(value) for value in nested)
    return found


def experience_of(raw) -> dict | None:
    if isinstance(raw, str):
        return {"id": raw, "name": EXPERIENCE_NAMES.get(raw, raw)}
    if isinstance(raw, dict):
        code = raw.get("id") or raw.get("@id")
        return {"id": code, "name": raw.get("name") or EXPERIENCE_NAMES.get(code, code)}
    return None


def salary_of(raw) -> dict | None:
    raw = raw or {}
    if raw.get("from") is None and raw.get("to") is None:
        return None
    return {
        "from": raw.get("from"),
        "to": raw.get("to"),
        "currency": raw.get("currencyCode"),
        "gross": raw.get("gross"),
        "mode": raw.get("mode"),
    }


def published_of(vacancy: dict) -> str | None:
    raw = vacancy.get("publicationTimeIso") or vacancy.get("publicationTime")
    if isinstance(raw, dict):
        return raw.get("$")
    return raw


def card_record(card: dict, grade_source: str) -> dict | None:
    title = card.get("name") or ""
    employer_id, employer = company_name(card.get("company"))
    if not card.get("vacancyId") or not title:
        return None
    return {
        "id": int(card["vacancyId"]),
        "title": title,
        "employer_id": employer_id,
        "employer": employer,
        "experience_id": card.get("workExperience") if isinstance(card.get("workExperience"), str) else None,
        "internship": bool(card.get("internship")),
        "grade_source": grade_source,
    }


def accept_card(spec: dict, grade: dict, card: dict, grade_source: str) -> dict | None:
    title = card.get("name") or ""
    if not matches_spec(spec, title):
        return None
    titled = classify_grade(title)
    if grade_source == "title":
        if titled != grade["code"]:
            return None
    else:
        if titled not in {None, grade["code"]}:
            return None
        if grade["code"] == "intern" and not card.get("internship") and titled != "intern":
            return None
        experience = card.get("workExperience")
        if experience not in grade["experience"]:
            return None
    return card_record(card, "title" if titled == grade["code"] else grade_source)


def pick_diverse(records: list[dict], limit: int) -> list[dict]:
    chosen: list[dict] = []
    seen_ids: set[int] = set()
    seen_employers: set[str] = set()
    deferred: list[dict] = []
    for record in records:
        if record["id"] in seen_ids:
            continue
        seen_ids.add(record["id"])
        employer = record.get("employer_id") or record["title"]
        if employer in seen_employers:
            deferred.append(record)
            continue
        seen_employers.add(employer)
        chosen.append(record)
        if len(chosen) >= limit:
            return chosen
    for record in deferred:
        chosen.append(record)
        if len(chosen) >= limit:
            break
    return chosen


def build_vacancy(spec: dict, grade: dict, preview: dict, payload: dict) -> dict | None:
    description_html = payload.get("description") or ""
    description = html_to_text(description_html)
    if len(description) > 15000:
        description = description[:15000].rstrip() + "\n…"
    if len(description) < 80:
        return None
    skills = payload.get("keySkills") or []
    if skills and isinstance(skills[0], dict):
        skills = [item.get("name") for item in skills if item.get("name")]
    sections = split_sections(description)
    employer_id, employer = company_name(payload.get("company"))
    area = payload.get("area") or {}
    roles = role_ids(payload.get("professionalRoleIds"))
    formats = payload.get("workFormats") or []
    if formats and isinstance(formats[0], dict):
        formats = [item.get("name") or item.get("id") for item in formats]
    return {
        "id": int(payload.get("vacancyId") or preview["id"]),
        "url": f"https://hh.ru/vacancy/{int(payload.get('vacancyId') or preview['id'])}",
        "title": payload.get("name") or preview["title"],
        "specialization": spec["code"],
        "specialization_title": spec["title"],
        "grade": grade["code"],
        "grade_title": grade["title"],
        "grade_source": preview["grade_source"],
        "employer": employer or preview.get("employer"),
        "employer_id": employer_id or preview.get("employer_id"),
        "city": area.get("name"),
        "salary": salary_of(payload.get("compensation")),
        "experience": experience_of(payload.get("workExperience")),
        "employment_form": payload.get("employmentForm"),
        "work_formats": formats,
        "internship": bool(payload.get("internship")),
        "professional_roles": [
            {"id": role, "name": ROLE_NAMES.get(role, role)} for role in roles
        ],
        "key_skills": skills,
        "published_at": published_of(payload),
        "requirements": sections.get("requirements"),
        "responsibilities": sections.get("responsibilities"),
        "nice_to_have": sections.get("nice_to_have"),
        "description": description,
    }


def collect_cell(client: HhClient, spec: dict, grade: dict, used_ids: set[int]) -> tuple[list[dict], int]:
    previews: list[dict] = []
    seen: set[int] = set()
    searched = 0
    for query in spec["queries"]:
        for word in grade["words"]:
            pages = 2 if grade["code"] in {"intern", "lead"} else 1
            for page in range(pages):
                searched += 1
                batch, total = client.search(f"{word} {query}", spec["roles"], page=page)
                for card in batch:
                    vacancy_id = int(card.get("vacancyId") or 0)
                    if not vacancy_id or vacancy_id in used_ids or vacancy_id in seen:
                        continue
                    accepted = accept_card(spec, grade, card, "title")
                    if not accepted:
                        continue
                    seen.add(vacancy_id)
                    previews.append(accepted)
                if len(previews) >= MIN_PER_CELL + 3 or total <= (page + 1) * 50:
                    break
            if len(previews) >= MIN_PER_CELL + 3:
                break
        if len(previews) >= MIN_PER_CELL + 3:
            break
    if len(previews) < MIN_PER_CELL and grade["allow_experience_fallback"]:
        for query in spec["queries"][:3]:
            for experience in grade["experience"]:
                searched += 1
                batch, _total = client.search(query, spec["roles"], experience=experience)
                for card in batch:
                    vacancy_id = int(card.get("vacancyId") or 0)
                    if not vacancy_id or vacancy_id in used_ids or vacancy_id in seen:
                        continue
                    accepted = accept_card(spec, grade, card, "experience")
                    if not accepted:
                        continue
                    seen.add(vacancy_id)
                    previews.append(accepted)
                if len(previews) >= MIN_PER_CELL + 5:
                    break
            if len(previews) >= MIN_PER_CELL + 5:
                break
    if len(previews) < MIN_PER_CELL and grade["code"] in {"intern", "junior"}:
        pending: list[dict] = []
        for query in spec["queries"][:4]:
            for word in grade["words"][:3]:
                searched += 1
                batch, _total = client.search(f"{word} {query}", spec["roles"], in_name=False)
                for card in batch:
                    vacancy_id = int(card.get("vacancyId") or 0)
                    title = card.get("name") or ""
                    if not vacancy_id or vacancy_id in used_ids or vacancy_id in seen:
                        continue
                    if not matches_spec(spec, title):
                        continue
                    titled = classify_grade(title)
                    if titled == grade["code"]:
                        accepted = card_record(card, "title")
                        if accepted:
                            seen.add(vacancy_id)
                            previews.append(accepted)
                        continue
                    if titled is not None:
                        continue
                    record = card_record(card, "description")
                    if record:
                        seen.add(vacancy_id)
                        pending.append(record)
                if len(previews) >= MIN_PER_CELL + 3:
                    break
            if len(previews) >= MIN_PER_CELL + 3:
                break
        for record in pending:
            if len(previews) >= MIN_PER_CELL + 3:
                break
            payload = client.vacancy(record["id"])
            if not payload:
                continue
            head = html_to_text(payload.get("description") or "")[:900]
            if classify_grade(record["title"] + "\n" + head) != grade["code"]:
                continue
            previews.append(record)
            print(f"  по тексту {record['title']}", flush=True)
    previews.sort(key=lambda item: item["grade_source"] != "title")
    chosen = pick_diverse(previews, MIN_PER_CELL + 3)
    vacancies: list[dict] = []
    for preview in chosen:
        if len(vacancies) >= MIN_PER_CELL:
            break
        payload = client.vacancy(preview["id"])
        if not payload:
            continue
        item = build_vacancy(spec, grade, preview, payload)
        if not item:
            print(f"  пропуск {preview['id']}: пустое описание", flush=True)
            continue
        if not matches_spec(spec, item["title"]):
            continue
        titled = classify_grade(item["title"])
        if preview["grade_source"] == "title" and titled != grade["code"]:
            continue
        vacancies.append(item)
        used_ids.add(item["id"])
        print(f"  + {item['grade']}/{item['specialization']} {item['title']} ({item['employer']})", flush=True)
    return vacancies, searched


def empty_document() -> dict:
    return {
        "source": "hh.ru",
        "area": "Россия",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "min_per_cell": MIN_PER_CELL,
        "note": (
            "Публичные вакансии с hh.ru. Грейд снят с названия, "
            "а если в названии грейда нет — с фильтра опыта и помечен grade_source=experience. "
            "Контакты работодателей не сохраняются."
        ),
        "specializations": [{"code": item["code"], "title": item["title"]} for item in SPECS],
        "grades": [{"code": item["code"], "title": item["title"]} for item in GRADES],
        "cells": [],
    }


def load_document() -> dict:
    if not OUT.exists():
        return empty_document()
    return json.loads(OUT.read_text(encoding="utf-8"))


def save_document(document: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    document["collected_at"] = datetime.now(timezone.utc).isoformat()
    document["summary"] = {
        cell["specialization"] + "/" + cell["grade"]: len(cell["vacancies"])
        for cell in document["cells"]
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")


def vacancy_ok(item: dict) -> bool:
    spec = SPEC_BY_CODE.get(item.get("specialization") or "")
    grade = GRADE_BY_CODE.get(item.get("grade") or "")
    title = item.get("title") or ""
    if spec is None or grade is None or not matches_spec(spec, title):
        return False
    if item.get("grade_source") == "title" and classify_grade(title) != grade["code"]:
        return False
    return True


def merge_vacancies(previous: list[dict], fresh: list[dict]) -> list[dict]:
    by_id: dict[int, dict] = {}
    for item in previous + fresh:
        if not vacancy_ok(item):
            continue
        by_id[int(item["id"])] = item
    ordered = sorted(
        by_id.values(),
        key=lambda item: (
            item.get("grade_source") != "title",
            item.get("employer") or "",
            item.get("title") or "",
        ),
    )
    picked = pick_diverse(
        [
            {
                "id": int(item["id"]),
                "title": item.get("title") or "",
                "employer_id": item.get("employer_id"),
                "grade_source": item.get("grade_source") or "title",
                "payload": item,
            }
            for item in ordered
        ],
        MIN_PER_CELL,
    )
    return [item["payload"] for item in picked]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="коды вида backend:junior")
    args = parser.parse_args()
    only = set(args.only or [])
    document = load_document()
    existing = {(cell["specialization"], cell["grade"]): cell for cell in document["cells"]}
    used_ids = {
        vacancy["id"]
        for cell in document["cells"]
        for vacancy in cell["vacancies"]
    }
    client = HhClient()
    for spec in SPECS:
        for grade in GRADES:
            key = f"{spec['code']}:{grade['code']}"
            if only and key not in only:
                continue
            current = existing.get((spec["code"], grade["code"]))
            if current and len(current["vacancies"]) >= MIN_PER_CELL and not only:
                print(f"есть {key}: {len(current['vacancies'])}", flush=True)
                continue
            print(f"\n== {key} ==", flush=True)
            fresh, searched = collect_cell(client, spec, grade, used_ids)
            previous = list(current["vacancies"]) if current else []
            vacancies = merge_vacancies(previous, fresh)
            for item in vacancies:
                used_ids.add(item["id"])
            cell = {
                "specialization": spec["code"],
                "specialization_title": spec["title"],
                "grade": grade["code"],
                "grade_title": grade["title"],
                "search_requests": searched + (current.get("search_requests", 0) if current else 0),
                "vacancies": vacancies,
            }
            if current:
                document["cells"] = [
                    cell if item is current else item for item in document["cells"]
                ]
            else:
                document["cells"].append(cell)
            existing[(spec["code"], grade["code"])] = cell
            save_document(document)
            print(f"сохранено {key}: {len(vacancies)}", flush=True)
    save_document(document)
    short = [name for name, count in document["summary"].items() if count < MIN_PER_CELL]
    print("итого", document["summary"], flush=True)
    if short:
        print("мало вакансий:", ", ".join(short), flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
