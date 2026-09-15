import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_app.db"

_db_path = Path(__file__).resolve().parent.parent / "test_app.db"
if _db_path.exists():
    _db_path.unlink()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from passlib.context import CryptContext  # noqa: E402

from app import models  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.gemini import GeminiClient, get_gemini_client  # noqa: E402

Base.metadata.create_all(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class MockGeminiClient(GeminiClient):
    def __init__(self):
        super().__init__(api_key="test-key")
        self.json_queue: list = []

    def generate_json(self, prompt: str):
        return self.json_queue.pop(0) if self.json_queue else []

    def generate_json_from_image(self, prompt: str, image_base64: str, media_type: str):
        return self.json_queue.pop(0) if self.json_queue else []


mock_gemini = MockGeminiClient()
app.dependency_overrides[get_gemini_client] = lambda: mock_gemini


@pytest.fixture(autouse=True)
def _clean_db():
    yield
    session = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()
    finally:
        session.close()
    mock_gemini.json_queue = []


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def gemini_queue():
    return mock_gemini.json_queue


@pytest.fixture
def seed(db):
    """学校・教科書・単元・形式・ユーザーの最小セットを投入して主要IDを返す。"""
    school = models.School(name="テスト校")
    db.add(school)
    db.flush()

    textbook = models.Textbook(publisher="出版社", title="教科書", subject="数学")
    db.add(textbook)
    db.flush()

    unit_a = models.Unit(textbook_id=textbook.id, name="単元A", order_no=1)
    unit_b = models.Unit(textbook_id=textbook.id, name="単元B", order_no=2)
    db.add_all([unit_a, unit_b])
    db.flush()

    fmt = models.Format(name="計算問題")
    db.add(fmt)
    db.flush()

    operator = models.User(
        login_id="op1", name="運営", role="operator", password_hash=pwd_context.hash("secret123")
    )
    db.add(operator)
    db.flush()

    test = models.Test(
        school_id=school.id,
        textbook_id=textbook.id,
        year=2025,
        grade="中2",
        term="期末",
        kind="past",
    )
    db.add(test)
    db.flush()
    db.add(models.TestUnit(test_id=test.id, unit_id=unit_a.id))
    db.commit()

    return {
        "school_id": school.id,
        "textbook_id": textbook.id,
        "unit_a_id": unit_a.id,
        "unit_b_id": unit_b.id,
        "format_id": fmt.id,
        "user_id": operator.id,
        "test_id": test.id,
    }
