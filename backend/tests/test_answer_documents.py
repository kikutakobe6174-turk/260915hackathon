"""問題用とは別に、正答・解説・3段階ヒントを載せた解答解説版を出力できることを検証する。"""
from io import BytesIO
from urllib.parse import unquote

from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import app

from test_points_from_analysis import _generate_and_save
from test_llm_flow import FakeProvider


def _pdf_text(content: bytes) -> str:
    return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages)


def _docx_text(content: bytes) -> str:
    document = Document(BytesIO(content))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def test_answer_documents_include_answer_explanation_and_hints(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "answers.db"))
    import app.main as main

    app.dependency_overrides[main.get_provider] = lambda: FakeProvider()
    try:
        with TestClient(app) as client:
            generation_job_id, drafts = _generate_and_save(client)
            saved = client.post(f"/llm/problem-batches/{generation_job_id}/save", json={"user_id": 1, "problems": drafts})
            assert saved.status_code == 200, saved.text
            problem_ids = saved.json()["problem_ids"]
            base = {"problem_ids": problem_ids, "duration_minutes": 50, "total_points": 100, "title": "2学期中間テスト対策問題"}

            # --- 問題用（従来どおり解答は載らない） ---
            problem_pdf = client.post("/tests/1/pdf", json=base)
            assert problem_pdf.status_code == 200, problem_pdf.text
            problem_text = _pdf_text(problem_pdf.content)
            assert "解答・解説" not in problem_text
            assert "正答" not in problem_text
            assert "氏名" in problem_text
            assert "解答解説" not in unquote(problem_pdf.headers["X-Filename"])

            # --- 解答解説用PDF ---
            answer_pdf = client.post("/tests/1/pdf", json={**base, "include_answers": True})
            assert answer_pdf.status_code == 200, answer_pdf.text
            assert answer_pdf.content.startswith(b"%PDF")
            answer_text = _pdf_text(answer_pdf.content)
            assert "解答・解説" in answer_text
            assert "正答" in answer_text and "解説" in answer_text
            assert "ヒント1" in answer_text and "ヒント2" in answer_text and "ヒント3" in answer_text
            assert "氏名" not in answer_text  # 配布用ではないので氏名欄・得点欄は出さない
            assert "得点 ______" not in answer_text
            assert unquote(answer_pdf.headers["X-Filename"]).endswith("_対策問題_解答解説.pdf")

            # --- 解答解説用Word ---
            answer_word = client.post("/tests/1/word", json={**base, "include_answers": True})
            assert answer_word.status_code == 200, answer_word.text
            assert answer_word.content.startswith(b"PK")
            word_text = _docx_text(answer_word.content)
            assert "解答・解説" in word_text
            assert "正答" in word_text and "解説" in word_text
            assert "ヒント1" in word_text and "ヒント3" in word_text
            assert unquote(answer_word.headers["X-Filename"]).endswith("_対策問題_解答解説.docx")

            # --- 問題用Wordには解答が載らない ---
            problem_word = client.post("/tests/1/word", json=base)
            assert "正答" not in _docx_text(problem_word.content)

            # --- 生成直後の下書きからも解答解説版を出せる ---
            draft_answer_pdf = client.post(f"/llm/problem-batches/{generation_job_id}/pdf", json={
                "duration_minutes": 50, "total_points": 100, "include_answers": True,
            })
            assert draft_answer_pdf.status_code == 200, draft_answer_pdf.text
            assert "正答" in _pdf_text(draft_answer_pdf.content)

            draft_answer_word = client.post(f"/llm/problem-batches/{generation_job_id}/word", json={
                "duration_minutes": 50, "total_points": 100, "include_answers": True,
            })
            assert draft_answer_word.status_code == 200, draft_answer_word.text
            assert "ヒント2" in _docx_text(draft_answer_word.content)

            # 解答解説版でも配点表示は問題用と同じ
            assert "（5点）" in answer_text and "（10点）" in answer_text
    finally:
        app.dependency_overrides.clear()
