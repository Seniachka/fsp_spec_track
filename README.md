# Разряд

Платформа обратного подбора ИТ-специалистов: работодатель находит категорию «специализация + подтверждённый грейд» и сам отправляет приглашение с вилкой. Контакт кандидата открывается после принятия.

Продуктовая спецификация: [docs/specifikaciya.md](docs/specifikaciya.md).

## Локальный запуск без Docker

Нужны Python 3.11+ и Node.js 20+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:JWT_SECRET="dev-only-change-me"
$env:SEED="1"
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Во втором окне:

```powershell
cd frontend
npm install
npm run dev
```

Открыть http://127.0.0.1:5173

База по умолчанию — файл `backend/razryad.db`. Схема создаётся при старте. Повторный запуск не дублирует учебные данные.

## Docker

```powershell
docker compose up --build
```

Интерфейс: http://127.0.0.1:8080  
API и OpenAPI: http://127.0.0.1:8000/docs

Postgres поднимается сервисом `db`. Это основной способ сдачи. На машине без Docker достаточно инструкций выше.

## Учебные входы

Пароль у всех: `demo1234`

| Кто | Почта |
| --- | --- |
| Анна, достижения ФСП есть, тест ещё не сдан | anna@example.com |
| Игорь, категории есть, истории ФСП нет | igor@example.com |
| Марина, работодатель «Северная линия» | marina@example.com |

Ключ к заданиям банка, чтобы провести демо, лежит в [DEMO.md](DEMO.md).

## Проверки

```powershell
cd backend
.\.venv\Scripts\python -m pytest tests -q
```

## Карта навыков и открытый банк заданий

Страница «Навыки и задания» (`/skills`, ссылка в шапке) показывает требования по должностям, все навыки и все вопросы и задачи. Данные лежат в `data/` и собираются скриптами:

```powershell
python scripts/fetch_hh_vacancies.py   # data/hh_it_vacancies.json — вакансии hh.ru, 8 специальностей × 5 грейдов
python scripts/build_skill_map.py      # data/skill_map.json — навыки по должностям с уровнями core/expected
python scripts/build_task_bank.py      # data/task_bank.json — темы, теория (одиночный/множественный выбор), практика
```

Знания по темам лежат в `scripts/bank_knowledge/*.py`: факты с ложными двойниками, термины и авторские вопросы; из них генератор делает варианты вопросов, а из эталонных решений в `practice.py` — по 20 тестов на задачу. API: `/api/v1/bank/overview`, `/bank/positions/{spec}/{grade}`, `/bank/skills/{code}`, `/bank/theory?skill=&grade=&topic=&kind=&q=`, `/bank/practice`, `/bank/items/{id}`. Каталог папки `data/` можно переопределить переменной `BANK_DATA_DIR` (в compose смонтирована как `/app/data`).
