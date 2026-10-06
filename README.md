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
