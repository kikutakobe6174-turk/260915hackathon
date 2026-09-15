from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)  # operator | teacher


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)


class Textbook(Base):
    __tablename__ = "textbooks"

    id: Mapped[int] = mapped_column(primary_key=True)
    publisher: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    subject: Mapped[str] = mapped_column(String)


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    textbook_id: Mapped[int] = mapped_column(ForeignKey("textbooks.id"))
    name: Mapped[str] = mapped_column(String)
    order_no: Mapped[int] = mapped_column(Integer)


class Format(Base):
    __tablename__ = "formats"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_code: Mapped[str] = mapped_column(String, unique=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    grade: Mapped[str] = mapped_column(String)
    level: Mapped[str] = mapped_column(String)  # A | B | C
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Test(Base):
    __tablename__ = "tests"

    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    textbook_id: Mapped[int] = mapped_column(ForeignKey("textbooks.id"))
    year: Mapped[int] = mapped_column(Integer)
    grade: Mapped[str] = mapped_column(String)
    term: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # past | target
    image_discarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TestUnit(Base):
    __tablename__ = "test_units"

    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"), primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), primary_key=True)


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"))
    lesson_date: Mapped[date] = mapped_column(Date)
    class_name: Mapped[str] = mapped_column(String)
    round: Mapped[int] = mapped_column(Integer)


class TrendItem(Base):
    __tablename__ = "trend_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"))
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    format_id: Mapped[int] = mapped_column(ForeignKey("formats.id"))
    question_no: Mapped[str] = mapped_column(String)
    points: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String)  # manual | llm
    llm_job_id: Mapped[int | None] = mapped_column(ForeignKey("llm_jobs.id"), nullable=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Prerequisite(Base):
    __tablename__ = "prerequisites"

    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), primary_key=True)
    prerequisite_unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), primary_key=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, default="manual")
    llm_job_id: Mapped[int | None] = mapped_column(ForeignKey("llm_jobs.id"), nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"))
    format_id: Mapped[int] = mapped_column(ForeignKey("formats.id"))
    difficulty: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_return: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="draft")  # draft | reviewed
    source: Mapped[str] = mapped_column(String, default="manual")
    llm_job_id: Mapped[int | None] = mapped_column(ForeignKey("llm_jobs.id"), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    hints: Mapped[list["Hint"]] = relationship(
        back_populates="problem", cascade="all, delete-orphan", order_by="Hint.step"
    )
    prerequisite_links: Mapped[list["ProblemPrerequisite"]] = relationship(
        back_populates="problem", cascade="all, delete-orphan"
    )


class Hint(Base):
    __tablename__ = "hints"

    id: Mapped[int] = mapped_column(primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id"))
    step: Mapped[int] = mapped_column(Integer)  # 1 | 2 | 3
    body: Mapped[str] = mapped_column(Text)

    problem: Mapped[Problem] = relationship(back_populates="hints")


class ProblemPrerequisite(Base):
    __tablename__ = "problem_prerequisites"

    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id"), primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), primary_key=True)

    problem: Mapped[Problem] = relationship(back_populates="prerequisite_links")


class Worksheet(Base):
    __tablename__ = "worksheets"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id"))
    level: Mapped[str] = mapped_column(String)  # A | B | C
    version: Mapped[int] = mapped_column(Integer, default=1)
    printed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    items: Mapped[list["WorksheetItem"]] = relationship(
        back_populates="worksheet", cascade="all, delete-orphan", order_by="WorksheetItem.sort_order"
    )


class WorksheetItem(Base):
    __tablename__ = "worksheet_items"
    __table_args__ = (UniqueConstraint("worksheet_id", "sort_order"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    worksheet_id: Mapped[int] = mapped_column(ForeignKey("worksheets.id"))
    item_no: Mapped[str] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id"))
    is_return: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_item_id: Mapped[int | None] = mapped_column(ForeignKey("worksheet_items.id"), nullable=True)

    worksheet: Mapped[Worksheet] = relationship(back_populates="items")


class AnswerSheet(Base):
    __tablename__ = "answer_sheets"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"))
    worksheet_id: Mapped[int] = mapped_column(ForeignKey("worksheets.id"))
    status: Mapped[str] = mapped_column(String, default="empty")
    source: Mapped[str] = mapped_column(String, default="manual")
    llm_job_id: Mapped[int | None] = mapped_column(ForeignKey("llm_jobs.id"), nullable=True)
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (UniqueConstraint("answer_sheet_id", "worksheet_item_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_sheet_id: Mapped[int] = mapped_column(ForeignKey("answer_sheets.id"))
    worksheet_item_id: Mapped[int] = mapped_column(ForeignKey("worksheet_items.id"))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    hint_step: Mapped[int] = mapped_column(Integer)  # 0..3
    went_return: Mapped[bool] = mapped_column(Boolean, default=False)
    red_card: Mapped[bool] = mapped_column(Boolean, default=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)


class LlmJob(Base):
    __tablename__ = "llm_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
