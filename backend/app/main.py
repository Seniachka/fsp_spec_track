import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, SessionLocal, engine, get_db
from app.deps import require_role
from app.errors import ApiError
from app.routers import auth, bank, candidate, catalog, employer
from app.seed import link_need_vacancies, seed
from app.services.validation import matching_report


def init_db() -> dict | None:
    last_error = None
    for _ in range(30):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            last_error = None
            break
        except Exception as exc:  # база в compose поднимается позже процесса
            last_error = exc
            time.sleep(1)
    if last_error is not None:
        raise last_error
    Base.metadata.create_all(bind=engine)
    _ensure_vacancy_need_link()
    report = None
    if settings.seed:
        db = SessionLocal()
        try:
            seed(db)
            link_need_vacancies(db)
            report = matching_report(db)
        finally:
            db.close()
    return report


def _ensure_vacancy_need_link() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("vacancies"):
        return
    names = {column["name"] for column in inspector.get_columns("vacancies")}
    if "need_id" in names:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE vacancies ADD COLUMN need_id INTEGER"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.validation_report = init_db()
    yield


app = FastAPI(title="Разряд", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
def handle_api_error(_: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(RequestValidationError)
def handle_validation(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION", "message": "Проверьте поля запроса", "details": {"errors": exc.errors()}}},
    )


@app.get("/")
def root():
    return {
        "service": "Разряд API",
        "docs": "/docs",
        "health": "/api/v1/health",
        "ui": "http://127.0.0.1:5173",
    }


api = "/api/v1"
app.include_router(auth.router, prefix=api)
app.include_router(catalog.router, prefix=api)
app.include_router(candidate.router, prefix=api)
app.include_router(employer.router, prefix=api)
app.include_router(bank.router, prefix=api)


@app.get(f"{api}/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get(f"{api}/admin/validation/summary")
def validation_summary(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    report = matching_report(db)
    return report
