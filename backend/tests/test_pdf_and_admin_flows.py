from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfReader
from docx import Document

from app.main import app


def create_problem(client, index: int) -> int:
    response = client.post("/problems", json={
        "unit_id": 1,
        "format_id": 1,
        "difficulty": 1,
        "body": f"x^{index + 2} + {index}x を計算しなさい。",
        "answer": "解答",
        "explanation": "解説",
        "is_return": False,
        "hints": ["式を見る", "項を分ける", "計算する"],
        "prerequisite_unit_ids": [],
        "source": "manual",
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_prerequisite_worksheet_and_pdf_flows(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "admin.db"))
    with TestClient(app) as client:
        saved = client.put("/units/2/prerequisites", json={
            "user_id": 1,
            "items": [{"prerequisite_unit_id": 1, "reason": "式の計算が必要", "source": "manual"}],
        })
        assert saved.status_code == 200, saved.text
        reviewed = client.post("/units/2/prerequisites/1/review", json={"user_id": 2, "confirmed": True, "teacher_note": "確認済み"})
        assert reviewed.status_code == 200, reviewed.text
        prerequisite_map = client.get("/tests/1/prerequisites").json()
        assert prerequisite_map["units"][1]["confirmed"] is True

        problem_ids = [create_problem(client, index) for index in range(16)]
        worksheet = client.post("/tests/1/worksheets", json={
            "level": "A",
            "items": [{"problem_id": problem_id, "is_return": False} for problem_id in problem_ids],
        })
        assert worksheet.status_code == 200, worksheet.text
        worksheet_id = worksheet.json()["id"]
        assert len(client.get(f"/worksheets/{worksheet_id}").json()["items"]) == 16

        pdf = client.post("/tests/1/pdf", json={
            "problem_ids": problem_ids,
            "duration_minutes": 50,
            "total_points": 100,
            "title": "2学期中間テスト対策問題",
        })
        assert pdf.status_code == 200, pdf.text
        assert pdf.headers["content-type"] == "application/pdf"
        assert pdf.content.startswith(b"%PDF")
        reader = PdfReader(BytesIO(pdf.content))
        assert len(reader.pages) >= 2
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        assert "2学期中間テスト対策問題" in text
        assert "1 /" in text
        for forbidden in ("AI生成", "AI分析", "LLM", "確信度", "ジョブID", "問題バンクID"):
            assert forbidden not in text

        word = client.post("/tests/1/word", json={
            "problem_ids": problem_ids,
            "duration_minutes": 50,
            "total_points": 100,
            "title": "2学期中間テスト対策問題",
        })
        assert word.status_code == 200, word.text
        assert word.content.startswith(b"PK")
        document = Document(BytesIO(word.content))
        word_text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        assert "2学期中間テスト対策問題" in word_text
        assert "第1問" in word_text
        for forbidden in ("AI生成", "AI分析", "LLM", "確信度", "ジョブID", "問題バンクID"):
            assert forbidden not in word_text
