"""Идемпотентный учебный набор. Повторный запуск не плодит дубликаты."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.fixtures.bank import ITEMS
from app.models import (
    AssessmentItem,
    CandidateProfile,
    CandidateStack,
    Company,
    Consent,
    Experience,
    FspAchievement,
    GoldLabel,
    Grade,
    Need,
    NeedStack,
    SoftSkill,
    Specialization,
    StackTag,
    User,
    Vacancy,
)
from app.security import hash_password, utcnow

DOC_VERSION = "2026-10-06"
SPECS = [
    ("backend", "Backend-разработка"),
    ("frontend", "Frontend-разработка"),
    ("qa", "QA и тестирование"),
    ("data", "Данные и аналитика"),
    ("devops", "DevOps / SRE"),
    ("mobile", "Мобильная разработка"),
    ("ml", "Machine Learning"),
    ("security", "Информационная безопасность"),
]
GRADES = [
    ("intern", "Стажёр", 0),
    ("junior", "Junior", 1),
    ("middle", "Middle", 2),
    ("senior", "Senior", 3),
    ("lead", "Lead", 4),
]
TAGS = {
    "backend": [("go", "Go"), ("python", "Python"), ("java", "Java"), ("postgres", "PostgreSQL"), ("redis", "Redis"), ("kafka", "Kafka"), ("docker", "Docker")],
    "frontend": [("typescript", "TypeScript"), ("react", "React"), ("css", "CSS"), ("nextjs", "Next.js")],
    "qa": [("pytest", "pytest"), ("selenium", "Selenium"), ("sql", "SQL"), ("postman", "Postman")],
    "data": [("sql", "SQL"), ("python", "Python")],
    "devops": [("docker", "Docker"), ("k8s", "Kubernetes")],
    "mobile": [("kotlin", "Kotlin"), ("swift", "Swift")],
    "ml": [("python", "Python"), ("pytorch", "PyTorch")],
    "security": [("networks", "Сети"), ("appsec", "AppSec")],
}

# first, last, email, spec, grade, score, tags, salary, fsp(place, level, discipline) or None
PEOPLE = [
    ("Игорь", "Смирнов", "igor@example.com", "backend", "middle", 76, ["go", "postgres"], (180_000, 240_000), None),
    ("Кира", "Соколова", "kira@example.com", "backend", "middle", 74, ["go", "postgres", "redis"], (200_000, 280_000), (3, "regional", "Алгоритмы")),
    ("Олег", "Павлов", "oleg@example.com", "backend", "middle", 71, ["go", "postgres"], (190_000, 250_000), (None, "uni", "Алгоритмы")),
    ("Светлана", "Морозова", "sveta@example.com", "backend", "middle", 73, ["go", "postgres", "docker"], (210_000, 270_000), (2, "uni", "Алгоритмы")),
    ("Денис", "Волков", "denis@example.com", "backend", "middle", 70, ["go", "postgres", "kafka"], (200_000, 260_000), None),
    ("Алина", "Егорова", "alina@example.com", "backend", "middle", 68, ["go", "postgres"], (220_000, 300_000), (1, "regional", "Алгоритмы")),
    ("Пётр", "Никитин", "petr@example.com", "backend", "middle", 88, ["python", "docker"], (250_000, 350_000), None),
    ("Нина", "Белова", "nina@example.com", "backend", "middle", 80, ["go"], (210_000, 300_000), None),
    ("Глеб", "Орлов", "gleb@example.com", "backend", "middle", 90, ["java", "docker"], (300_000, 400_000), (1, "national", "Продуктовый хакатон")),
    ("Мария", "Крылова", "maria@example.com", "backend", "junior", 72, ["python", "postgres"], (120_000, 160_000), (2, "regional", "Алгоритмы")),
    ("Илья", "Фомин", "ilya@example.com", "backend", "junior", 66, ["go"], (100_000, 150_000), None),
    ("Ева", "Зайцева", "eva@example.com", "backend", "junior", 80, ["java", "docker"], (130_000, 180_000), (3, "uni", "Алгоритмы")),
    ("Роман", "Лебедев", "roman@example.com", "backend", "senior", 81, ["go", "postgres", "kafka"], (350_000, 450_000), (1, "national", "Алгоритмы")),
    ("Татьяна", "Орлова", "tanya@example.com", "backend", "senior", 77, ["java", "postgres"], (320_000, 420_000), (2, "regional", "Алгоритмы")),
    ("Павел", "Громов", "pavel@example.com", "backend", "senior", 69, ["python", "docker"], (300_000, 380_000), None),
    ("Вера", "Савельева", "vera@example.com", "frontend", "middle", 78, ["react", "typescript", "css"], (200_000, 280_000), (2, "national", "Продуктовый хакатон")),
    ("Максим", "Киселёв", "maxim@example.com", "frontend", "middle", 74, ["react", "typescript"], (190_000, 260_000), None),
    ("Юлия", "Новикова", "yulia@example.com", "frontend", "middle", 71, ["react", "css"], (180_000, 250_000), (3, "regional", "Продуктовый хакатон")),
    ("Артём", "Баранов", "artem@example.com", "frontend", "middle", 84, ["css", "nextjs"], (220_000, 300_000), None),
    ("Софья", "Титова", "sofya@example.com", "frontend", "junior", 70, ["react", "css"], (110_000, 160_000), (None, "uni", "Продуктовый хакатон")),
    ("Никита", "Ершов", "nikita@example.com", "frontend", "junior", 64, ["typescript"], (100_000, 140_000), None),
    ("Полина", "Виноградова", "polina@example.com", "qa", "middle", 77, ["pytest", "sql", "postman"], (160_000, 230_000), (2, "regional", "CTF")),
    ("Фёдор", "Макаров", "fedor@example.com", "qa", "middle", 73, ["pytest", "selenium"], (150_000, 220_000), None),
    ("Дарья", "Кузнецова", "darya@example.com", "qa", "middle", 69, ["sql", "postman"], (140_000, 200_000), (1, "uni", "CTF")),
    ("Сергей", "Белов", "sergey@example.com", "qa", "senior", 80, ["pytest", "selenium", "sql"], (250_000, 340_000), (1, "national", "CTF")),
    ("Ольга", "Фролова", "olga@example.com", "qa", "senior", 75, ["postman", "sql"], (230_000, 310_000), None),
    ("Иван", "Медведев", "ivan@example.com", "data", "middle", 74, ["sql", "python"], (200_000, 280_000), (3, "national", "Алгоритмы")),
    ("Елена", "Сорокина", "elena@example.com", "devops", "middle", 76, ["docker", "k8s"], (220_000, 320_000), None),
    ("Константин", "Алексеев", "kostya@example.com", "ml", "middle", 82, ["python", "pytorch"], (250_000, 360_000), (2, "international", "Алгоритмы")),
    ("Наталья", "Быкова", "natalya@example.com", "security", "middle", 79, ["appsec", "networks"], (240_000, 340_000), (1, "national", "CTF")),
]

GOLD = {
    "be-middle-go": {
        "igor@example.com": 2,
        "kira@example.com": 2,
        "oleg@example.com": 2,
        "sveta@example.com": 2,
        "denis@example.com": 2,
        "alina@example.com": 2,
        "petr@example.com": 1,
        "nina@example.com": 1,
        "gleb@example.com": 1,
    },
    "fe-middle-react": {
        "vera@example.com": 2,
        "maxim@example.com": 2,
        "yulia@example.com": 2,
        "artem@example.com": 1,
    },
    "qa-middle-pytest": {
        "polina@example.com": 2,
        "fedor@example.com": 2,
        "darya@example.com": 1,
    },
    "be-senior-go": {
        "roman@example.com": 2,
        "tanya@example.com": 1,
        "pavel@example.com": 1,
    },
}


def _consent(db: Session, user_id: int) -> None:
    now = utcnow()
    for doc_type in ("personal_data", "profile_publication"):
        db.add(Consent(user_id=user_id, doc_type=doc_type, doc_version=DOC_VERSION, accepted_at=now))


def refresh_code_bank(db: Session) -> None:
    """Подменяет банк кода и открытые попытки, чтобы в них были 5 открытых и 15 скрытых тестов."""
    from sqlalchemy.orm.attributes import flag_modified

    from app.models import AssessmentSession, AssessmentSessionItem

    by_code = {item["code"]: item for item in ITEMS if item["kind"] == "code"}
    stored = {row.code: row for row in db.query(AssessmentItem).all()}
    for code, fresh in by_code.items():
        row = stored.get(code)
        if row is None:
            continue
        row.prompt = fresh["prompt"]
        row.payload = fresh["payload"]
        flag_modified(row, "payload")
    open_slots = (
        db.query(AssessmentSessionItem)
        .join(AssessmentSession, AssessmentSession.id == AssessmentSessionItem.session_id)
        .filter(AssessmentSession.status == "started")
        .all()
    )
    for slot in open_slots:
        params = dict(slot.params or {})
        if params.get("kind") != "code":
            continue
        bank_item = db.get(AssessmentItem, slot.item_id)
        if bank_item is None:
            continue
        variant = ((bank_item.payload or {}).get("variants") or [{}])[0]
        params["public_tests"] = variant.get("public_tests") or []
        params["hidden"] = variant.get("hidden") or []
        params["language"] = "python3.12"
        params["starter"] = (bank_item.payload or {}).get("starter")
        params["signature"] = (bank_item.payload or {}).get("signature")
        params["prompt"] = bank_item.prompt
        slot.params = params
        flag_modified(slot, "params")
    db.commit()


def _skill_map_path() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "data" / "skill_map.json"
        if candidate.exists():
            return candidate
    return None


def refresh_stack_catalog(db: Session) -> None:
    """Дописывает стек из актуальной карты навыков. Старые теги не удаляет."""
    path = _skill_map_path()
    specs = {row.code: row for row in db.query(Specialization).all()}
    if path is None or not specs:
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    existing = {(tag.specialization_id, tag.code): tag for tag in db.query(StackTag).all()}
    for skill in payload.get("skills", []):
        code = str(skill.get("code") or "").strip()
        title = str(skill.get("title") or code).strip()[:64]
        if not code:
            continue
        spec_codes: list[str] = []
        for position in skill.get("exam_positions") or []:
            spec_code = str(position).split("/", 1)[0]
            if spec_code in specs and spec_code not in spec_codes:
                spec_codes.append(spec_code)
        if not spec_codes:
            spec_codes = [next(iter(specs))]
        for spec_code in spec_codes:
            spec = specs[spec_code]
            current = existing.get((spec.id, code))
            if current is None:
                row = StackTag(specialization_id=spec.id, code=code, title=title)
                db.add(row)
                existing[(spec.id, code)] = row
            elif current.title != title:
                current.title = title
    db.commit()


def release_demo_attempt_lock(db: Session) -> None:
    """Учебные профили сдают тест сразу: без паузы 7 и 90 дней."""
    rows = (
        db.query(CandidateProfile)
        .join(User, User.id == CandidateProfile.user_id)
        .filter(User.email.like("%@example.com"))
        .all()
    )
    for profile in rows:
        profile.grade_change_allowed_at = None
    db.commit()


def seed(db: Session) -> None:
    if db.query(User).filter(User.email == "marina@example.com").first():
        refresh_code_bank(db)
        refresh_stack_catalog(db)
        release_demo_attempt_lock(db)
        return
    password_hash = hash_password("demo1234")
    specs = {}
    for code, title in SPECS:
        row = Specialization(code=code, title=title, industry="it")
        db.add(row)
        db.flush()
        specs[code] = row
    grades = {}
    for code, title, rank in GRADES:
        row = Grade(code=code, title=title, rank=rank)
        db.add(row)
        db.flush()
        grades[code] = row
    tags = {}
    for spec_code, pairs in TAGS.items():
        for code, title in pairs:
            row = StackTag(specialization_id=specs[spec_code].id, code=code, title=title)
            db.add(row)
            db.flush()
            tags[(spec_code, code)] = row
    for item in ITEMS:
        db.add(
            AssessmentItem(
                code=item["code"],
                specialization_id=specs[item["spec"]].id,
                grades=item["grades"],
                kind=item["kind"],
                stratum=item["stratum"],
                difficulty=item["difficulty"],
                is_anchor=item["anchor"],
                status="calibrated",
                topic=item["topic"],
                prompt=item["prompt"],
                payload=item["payload"],
            )
        )
    now = utcnow()
    participant_seq = 1100

    def add_person(first, last, email, spec, grade, score, stack, salary, fsp, published=True):
        nonlocal participant_seq
        user = User(email=email, password_hash=password_hash, role="candidate", email_verified_at=now)
        db.add(user)
        db.flush()
        _consent(db, user.id)
        participant_id = None
        if fsp is not None:
            participant_id = f"FSP-{participant_seq}"
            participant_seq += 1
            place, level, discipline = fsp
            db.add(
                FspAchievement(
                    participant_id=participant_id,
                    discipline=discipline,
                    competition="Кубок Разряда",
                    event_level=level,
                    place=place,
                    percentile=20 if place is None else None,
                    role_name="участник",
                    awarded_on="2025-11-02",
                    source="seed-registry",
                )
            )
        profile = CandidateProfile(
            user_id=user.id,
            first_name=first,
            last_name=last,
            about="Ищу команду, где грейд подтверждён задачей, а не формулировкой в резюме.",
            phone=f"+7999{user.id:07d}",
            telegram=f"@{email.split('@')[0]}_demo",
            desired_salary_min=salary[0],
            desired_salary_max=salary[1],
            published=published,
            show_in_search=True,
            specialization_id=specs[spec].id if grade else None,
            grade_id=grades[grade].id if grade else None,
            test_score=score,
            test_scored_at=now if score is not None else None,
            grade_sealed_at=now if grade else None,
            grade_change_allowed_at=None,
            fsp_participant_id=participant_id,
        )
        db.add(profile)
        db.flush()
        for code in stack:
            tag = tags.get((spec, code))
            if tag:
                db.add(CandidateStack(candidate_id=user.id, tag_id=tag.id))
        db.add(Experience(candidate_id=user.id, role_title=f"{grade or 'кандидат'} инженер", company_name="Контурная лаборатория", start_year="2023", end_year="", is_current=True))
        db.add(SoftSkill(candidate_id=user.id, label="ясность"))
        return user

    anna = add_person(
        "Анна", "Ковалева", "anna@example.com", "backend", None, None,
        ["go", "postgres", "redis"], (230_000, 260_000), None,
    )
    anna_profile = db.get(CandidateProfile, anna.id)
    anna_profile.about = "Участвую в соревнованиях ФСП. Хочу, чтобы результат читался как подтверждение, а не как хобби."
    anna_profile.fsp_participant_id = "FSP-1001"
    db.add(
        FspAchievement(
            participant_id="FSP-1001",
            discipline="Алгоритмы",
            competition="Открытый кубок",
            event_level="national",
            place=2,
            role_name="разработчик решения",
            awarded_on="2025-11-02",
            source="seed-registry",
        )
    )
    for person in PEOPLE:
        add_person(*person)

    marina = User(email="marina@example.com", password_hash=password_hash, role="employer", email_verified_at=now)
    db.add(marina)
    db.flush()
    _consent(db, marina.id)
    company = Company(
        owner_user_id=marina.id,
        name="Северная линия",
        industry="Финтех, платежи",
        contact_email="marina@example.com",
        about="Команда из сорока инженеров. Ищем людей в платёжный контур, без очереди из случайных резюме.",
    )
    db.add(company)
    db.flush()
    needs = [
        ("be-middle-go", "Middle Backend на Go", "Платежи и внутренние API. Нужен человек, который сам доводит задачу до продакшена.", "backend", "middle", "middle", 200_000, 280_000, ["go", "postgres"]),
        ("fe-middle-react", "Middle Frontend, React", "Личный кабинет клиента. Важны интерфейсные состояния и доступность.", "frontend", "middle", "middle", 190_000, 270_000, ["react", "typescript"]),
        ("qa-middle-pytest", "Middle QA", "Платёжные сценарии. Нужны границы, регрессия и понятные проверки API.", "qa", "middle", "middle", 150_000, 230_000, ["pytest"]),
        ("be-senior-go", "Senior Backend на Go", "Надёжность сервиса списаний. Нужен человек, который проектирует изменение, а не только закрывает тикет.", "backend", "senior", "senior", 340_000, 460_000, ["go"]),
    ]
    for code, title, team, spec, gmin, gmax, smin, smax, stack in needs:
        need = Need(
            company_id=company.id,
            title=title,
            team_description=team,
            specialization_id=specs[spec].id,
            grade_min_id=grades[gmin].id,
            grade_max_id=grades[gmax].id,
            salary_min=smin,
            salary_max=smax,
            prefer_fsp=False,
            demo_code=code,
        )
        db.add(need)
        db.flush()
        for tag_code in stack:
            db.add(NeedStack(need_id=need.id, tag_id=tags[(spec, tag_code)].id, is_required=True))
        for email, label in GOLD[code].items():
            db.add(GoldLabel(need_code=code, email=email, label=label))
    db.add(
        Vacancy(
            company_id=company.id,
            title="Backend-разработчик, Middle",
            description="Открытая вакансия того же контура. Основной путь — приглашение из подборки. Отклик нужен тем, кому ещё не написали.",
            specialization_id=specs["backend"].id,
            grade_id=grades["middle"].id,
            salary_min=220_000,
            salary_max=270_000,
            is_published=True,
        )
    )
    admin = User(email="admin@example.com", password_hash=password_hash, role="admin", email_verified_at=now)
    db.add(admin)
    db.commit()
    refresh_code_bank(db)
    refresh_stack_catalog(db)


def link_need_vacancies(db: Session) -> None:
    """Публичная вакансия для каждой потребности, чтобы отклики и карточка были одним объектом."""
    for need in db.query(Need).all():
        row = db.query(Vacancy).filter(Vacancy.need_id == need.id).one_or_none()
        if row is None:
            row = Vacancy(
                company_id=need.company_id,
                need_id=need.id,
                is_published=True,
                title=need.title,
                description=need.team_description,
                specialization_id=need.specialization_id,
                grade_id=need.grade_min_id,
                salary_min=need.salary_min,
                salary_max=need.salary_max,
            )
            db.add(row)
        else:
            row.is_published = True
    db.query(Vacancy).filter(Vacancy.need_id.is_(None)).update({Vacancy.is_published: False})
    db.commit()
