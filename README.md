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

Так поднимается всё приложение сразу: Postgres, API и интерфейс. Команды ниже — из корня репозитория.

### Что нужно

- [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) с бэкендом WSL 2 (на Windows 10/11). На macOS и Linux — Docker Desktop или Docker Engine с плагином Compose.
- Свободные порты `5432`, `8000` и `8080`.

Проверка, что клиент видит демон:

```powershell
docker compose version
```

Если команда `docker` не находится, установите Docker Desktop и откройте его из меню Пуск. Дождитесь статуса Engine running.

На Windows 10/11 движку нужен компонент Virtual Machine Platform (бэкенд WSL 2). Если Docker пишет, что он не включён, в PowerShell от администратора:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart
```

После этого перезагрузите компьютер и снова откройте Docker Desktop. В BIOS/UEFI должна быть включена виртуализация (Intel VT-x или AMD-V).

### Запуск

```powershell
docker compose up --build -d
```

Первый запуск скачивает `postgres:16` и собирает образы API и интерфейса. Это несколько минут. API сам дожидается базы, создаёт схему и учебные учётки (`SEED=1`, почта подтверждается через `AUTO_VERIFY=1`). Повторный запуск без `--build` использует уже собранные образы.

| Сервис | Что это | Порт |
| --- | --- | --- |
| `db` | Postgres 16, база `razryad`, пользователь и пароль `razryad` | 5432 |
| `api` | FastAPI, каталог `data/` смонтирован в `/app/data` только для чтения | 8000 |
| `web` | nginx со собранным интерфейсом, `/api/` проксируется на `api` | 8080 |

- Интерфейс: http://127.0.0.1:8080
- OpenAPI: http://127.0.0.1:8000/docs
- Проверка API: http://127.0.0.1:8000/api/v1/health — ответ `{"status":"ok"}`

Состояние:

```powershell
docker compose ps
```

У всех трёх сервисов в колонке STATUS должно быть `Up`.

### Остановка

```powershell
docker compose stop
```

Контейнеры останавливаются, данные Postgres остаются в томе `razryad-db`. Снова поднять без пересборки: `docker compose start`.

Убрать контейнеры и сеть, том с базой оставить:

```powershell
docker compose down
```

Удалить и данные базы (следующий запуск снова создаст учебные учётки):

```powershell
docker compose down -v
```

### Логи и пересборка

```powershell
docker compose logs -f api
docker compose logs -f web
```

После правок в `backend/` или `frontend/` пересоберите образы:

```powershell
docker compose up --build -d
```

Файлы в `data/` (карта навыков и банк заданий) подхватываются без пересборки: каталог примонтирован в API. Если API уже прочитал их в кэш процесса, перезапустите его: `docker compose restart api`.

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
