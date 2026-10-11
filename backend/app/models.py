from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db import Base
from app.security import utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    external_issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    candidate: Mapped["CandidateProfile | None"] = relationship(back_populates="user")
    company: Mapped["Company | None"] = relationship(back_populates="owner")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EmailToken(Base):
    __tablename__ = "email_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doc_type: Mapped[str] = mapped_column(String(64))
    doc_version: Mapped[str] = mapped_column(String(32))
    accepted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Specialization(Base):
    __tablename__ = "specializations"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(128))
    industry: Mapped[str] = mapped_column(String(64), default="it")


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(64))
    rank: Mapped[int] = mapped_column(Integer)


class StackTag(Base):
    __tablename__ = "stack_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"))
    code: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(64))


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80), default="")
    last_name: Mapped[str] = mapped_column(String(80), default="")
    about: Mapped[str] = mapped_column(Text, default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    telegram: Mapped[str] = mapped_column(String(80), default="")
    desired_salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    desired_salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    show_in_search: Mapped[bool] = mapped_column(Boolean, default=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    specialization_id: Mapped[int | None] = mapped_column(ForeignKey("specializations.id"), nullable=True)
    grade_id: Mapped[int | None] = mapped_column(ForeignKey("grades.id"), nullable=True)
    grade_sealed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    grade_change_allowed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    test_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    test_scored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fsp_participant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pending_grade_id: Mapped[int | None] = mapped_column(ForeignKey("grades.id"), nullable=True)
    pending_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    initial_failed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    down_used: Mapped[bool] = mapped_column(Boolean, default=False)
    up_used: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="candidate")


class CandidateStack(Base):
    __tablename__ = "candidate_stack"
    __table_args__ = (UniqueConstraint("candidate_id", "tag_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("stack_tags.id"))


class Experience(Base):
    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    role_title: Mapped[str] = mapped_column(String(128))
    company_name: Mapped[str] = mapped_column(String(128))
    start_year: Mapped[str] = mapped_column(String(8), default="")
    end_year: Mapped[str] = mapped_column(String(8), default="")
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class SoftSkill(Base):
    __tablename__ = "soft_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    label: Mapped[str] = mapped_column(String(80))


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    industry: Mapped[str] = mapped_column(String(160), default="")
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    about: Mapped[str] = mapped_column(Text, default="")

    owner: Mapped[User] = relationship(back_populates="company")


class Need(Base):
    __tablename__ = "needs"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    team_description: Mapped[str] = mapped_column(Text, default="")
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"))
    grade_min_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    grade_max_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    salary_min: Mapped[int] = mapped_column(Integer)
    salary_max: Mapped[int] = mapped_column(Integer)
    prefer_fsp: Mapped[bool] = mapped_column(Boolean, default=False)
    demo_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class NeedStack(Base):
    __tablename__ = "need_stack"
    __table_args__ = (UniqueConstraint("need_id", "tag_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    need_id: Mapped[int] = mapped_column(ForeignKey("needs.id"), index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("stack_tags.id"))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)


class AssessmentItem(Base):
    __tablename__ = "assessment_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"))
    grades: Mapped[list] = mapped_column(JSON)
    kind: Mapped[str] = mapped_column(String(16))
    stratum: Mapped[str] = mapped_column(String(16))
    difficulty: Mapped[float] = mapped_column(Float)
    is_anchor: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="calibrated")
    exposure_count: Mapped[int] = mapped_column(Integer, default=0)
    topic: Mapped[str] = mapped_column(String(120), default="")
    prompt: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON)


class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"))
    claimed_grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    purpose: Mapped[str] = mapped_column(String(16))
    seed: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="started")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mean_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AssessmentSessionItem(Base):
    __tablename__ = "assessment_session_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("assessment_sessions.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("assessment_items.id"))
    position: Mapped[int] = mapped_column(Integer)
    weight: Mapped[int] = mapped_column(Integer)
    params: Mapped[dict] = mapped_column(JSON)
    answer: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class FspAchievement(Base):
    __tablename__ = "fsp_achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    participant_id: Mapped[str] = mapped_column(String(64), index=True)
    discipline: Mapped[str] = mapped_column(String(120))
    competition: Mapped[str] = mapped_column(String(160))
    event_level: Mapped[str] = mapped_column(String(32))
    place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentile: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role_name: Mapped[str] = mapped_column(String(80), default="участник")
    awarded_on: Mapped[str] = mapped_column(String(16), default="")
    source: Mapped[str] = mapped_column(String(64), default="seed-registry")


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    need_id: Mapped[int | None] = mapped_column(ForeignKey("needs.id"), nullable=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    salary_min: Mapped[int] = mapped_column(Integer)
    salary_max: Mapped[int] = mapped_column(Integer)
    contact_channel: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default="sent", index=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ShortlistSnapshot(Base):
    __tablename__ = "shortlist_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    need_id: Mapped[int] = mapped_column(ForeignKey("needs.id"), index=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"))
    rank: Mapped[int] = mapped_column(Integer)
    fit: Mapped[float] = mapped_column(Float)
    explanation: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    specialization_id: Mapped[int] = mapped_column(ForeignKey("specializations.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    salary_min: Mapped[int] = mapped_column(Integer)
    salary_max: Mapped[int] = mapped_column(Integer)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    need_id: Mapped[int | None] = mapped_column(ForeignKey("needs.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("vacancy_id", "candidate_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    vacancy_id: Mapped[int] = mapped_column(ForeignKey("vacancies.id"), index=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.user_id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="sent")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class GoldLabel(Base):
    __tablename__ = "gold_labels"
    __table_args__ = (UniqueConstraint("need_code", "email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    need_code: Mapped[str] = mapped_column(String(64))
    email: Mapped[str] = mapped_column(String(255))
    label: Mapped[int] = mapped_column(Integer)
