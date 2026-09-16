import json
import logging
import os
import re
from urllib.parse import quote
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .database import connect, init_db
from .document_generator import build_test_docx
from .providers import LLMProvider, LLMProviderError, get_provider, relaxed_validation_enabled
from .pdf_generator import build_test_pdf
from .schemas import (
    GeneratedProblem,
    GenerationExportRequest,
    GenerationJobResponse,
    JobAction,
    LoginRequest,
    ProblemCreate,
    PdfExportRequest,
    PrerequisitePutRequest,
    PrerequisiteReviewRequest,
    SaveGenerationRequest,
    TestCreate,
    TrendAnalysis,
    TrendDraftRequest,
    TrendDraftResponse,
    TrendDraftUpdate,
    TrendPutRequest,
    WorksheetCreateRequest,
)

load_dotenv()

logger = logging.getLogger(__name__)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def error(status: int, code: str, message: str):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="ひかり塾 API", version="1.0.0", lifespan=lifespan)
origins = [origin.strip() for origin in os.getenv("CORS_ORIGIN", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Filename", "Content-Disposition"],
)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "入力内容が不正です。必須項目、配点、難易度を確認してください。", "details": exc.errors()}})


@app.exception_handler(LLMProviderError)
async def provider_error(_: Request, exc: LLMProviderError):
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})


def require_user(conn, user_id: int):
    if not conn.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
        error(404, "USER_NOT_FOUND", "利用者が見つかりません。再ログインしてください。")


def get_test(conn, test_id: int):
    row = conn.execute("SELECT * FROM tests WHERE id=?", (test_id,)).fetchone()
    if not row:
        error(404, "TEST_NOT_FOUND", "テストが見つかりません。")
    return row


def master_data(conn, textbook_id: int, allowed_unit_ids: list[int] | None = None):
    units = [dict(row) for row in conn.execute("SELECT id,name FROM units WHERE textbook_id=? ORDER BY order_no", (textbook_id,))]
    if allowed_unit_ids:
        allowed = set(allowed_unit_ids)
        units = [unit for unit in units if unit["id"] in allowed]
    formats = [dict(row) for row in conn.execute("SELECT id,name FROM formats ORDER BY id")]
    return units, formats


def validate_master_ids(items, units: list[dict], formats: list[dict]):
    unit_ids = {row["id"] for row in units}
    format_ids = {row["id"] for row in formats}
    if any(item.unit_id not in unit_ids for item in items):
        error(422, "UNKNOWN_UNIT", "解析・生成結果に、この教科書に存在しない単元が含まれています。")
    if any(item.format_id not in format_ids for item in items):
        error(422, "UNKNOWN_FORMAT", "解析・生成結果に、存在しない問題形式が含まれています。")


def trend_items_for_job(conn, job_id: int):
    return [dict(row) for row in conn.execute("SELECT question_no,unit_id,format_id,points,difficulty,confidence FROM trend_draft_items WHERE job_id=? ORDER BY id", (job_id,))]


def trend_job_response(conn, job_id: int):
    job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='trend_analysis'", (job_id,)).fetchone()
    if not job:
        error(404, "ANALYSIS_JOB_NOT_FOUND", "解析ジョブが見つかりません。")
    items = trend_items_for_job(conn, job_id)
    fallback = job["provider"] == "quota-template"
    return {"job_id": job_id, "image_discarded": True, "status": job["status"], "total_points": sum(i["points"] for i in items), "items": items,
            "fallback_mode": "quota_template" if fallback else None,
            "notice": "Geminiの無料枠またはレート上限に達したため、編集可能な分析テンプレートを表示しています。元資料の解析結果ではありません。" if fallback else None}


@app.get("/health")
def health():
    # relaxed_validation はデモ用の緩和モードが有効かどうか。運用中に状態を確認できるようにする。
    return {"status": "ok", "relaxed_validation": relaxed_validation_enabled()}


@app.post("/auth/login")
def login(body: LoginRequest):
    with connect() as conn:
        row = conn.execute("SELECT id,name,role FROM users WHERE login_id=? AND password=?", (body.login_id, body.password)).fetchone()
        if not row:
            error(401, "LOGIN_FAILED", "ログインIDまたはパスワードが違います。")
        return {"user": dict(row)}


@app.get("/schools")
def schools():
    with connect() as conn:
        return [dict(row) for row in conn.execute("SELECT id,name FROM schools ORDER BY id")]


@app.get("/textbooks")
def textbooks():
    with connect() as conn:
        return [dict(row) for row in conn.execute("SELECT id,publisher,title,subject FROM textbooks ORDER BY id")]


@app.get("/formats")
def formats():
    with connect() as conn:
        return [dict(row) for row in conn.execute("SELECT id,name FROM formats ORDER BY id")]


@app.get("/textbooks/{textbook_id}/units")
def units(textbook_id: int):
    with connect() as conn:
        return [dict(row) for row in conn.execute("SELECT id,textbook_id,name,order_no FROM units WHERE textbook_id=? ORDER BY order_no", (textbook_id,))]


def test_out(row):
    result = dict(row)
    result["unit_ids"] = json.loads(result.pop("unit_ids_json"))
    return result


@app.get("/tests")
def tests(school_id: int | None = None, kind: str | None = None):
    clauses, values = [], []
    if school_id is not None:
        clauses.append("school_id=?")
        values.append(school_id)
    if kind is not None:
        clauses.append("kind=?")
        values.append(kind)
    sql = "SELECT * FROM tests" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY year DESC,id DESC"
    with connect() as conn:
        return [test_out(row) for row in conn.execute(sql, values)]


@app.get("/tests/{test_id}")
def test_detail(test_id: int):
    with connect() as conn:
        return test_out(get_test(conn, test_id))


@app.post("/tests")
def create_test(body: TestCreate):
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM schools WHERE id=?", (body.school_id,)).fetchone():
            error(422, "UNKNOWN_SCHOOL", "学校が見つかりません。")
        unit_ids = {row[0] for row in conn.execute("SELECT id FROM units WHERE textbook_id=?", (body.textbook_id,))}
        if any(unit_id not in unit_ids for unit_id in body.unit_ids):
            error(422, "UNKNOWN_UNIT", "選択された単元が教科書に存在しません。")
        cursor = conn.execute("INSERT INTO tests(school_id,textbook_id,year,grade,term,kind,unit_ids_json) VALUES(?,?,?,?,?,?,?)", (body.school_id, body.textbook_id, body.year, body.grade.strip(), body.term.strip(), body.kind, json.dumps(body.unit_ids)))
        return test_out(get_test(conn, cursor.lastrowid))


@app.post("/llm/trend-draft", response_model=TrendDraftResponse)
async def create_trend_draft(body: TrendDraftRequest, provider: LLMProvider = Depends(get_provider)):
    with connect() as conn:
        require_user(conn, body.user_id)
        test = get_test(conn, body.test_id)
        units, formats = master_data(conn, test["textbook_id"], json.loads(test["unit_ids_json"]))
    analysis = await provider.analyze_test(body.image_base64, body.media_type, units, formats)
    validate_master_ids(analysis.items, units, formats)
    with connect() as conn:
        cursor = conn.execute("INSERT INTO llm_jobs(kind,test_id,user_id,status,provider,model) VALUES('trend_analysis',?,?, 'draft',?,?)", (body.test_id, body.user_id, provider.name, getattr(provider, "model", "test")))
        job_id = cursor.lastrowid
        conn.executemany(
            "INSERT INTO trend_draft_items(job_id,question_no,unit_id,format_id,points,difficulty,confidence) VALUES(?,?,?,?,?,?,?)",
            [(job_id, i.question_no, i.unit_id, i.format_id, i.points, i.difficulty, i.confidence) for i in analysis.items],
        )
        conn.execute("UPDATE tests SET image_discarded_at=? WHERE id=?", (utc_now(), body.test_id))
        return trend_job_response(conn, job_id)


@app.get("/llm/trend-drafts/{job_id}")
def get_trend_draft(job_id: int):
    with connect() as conn:
        return trend_job_response(conn, job_id)


@app.put("/llm/trend-drafts/{job_id}")
def update_trend_draft(job_id: int, body: TrendDraftUpdate):
    with connect() as conn:
        require_user(conn, body.user_id)
        job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='trend_analysis'", (job_id,)).fetchone()
        if not job:
            error(404, "ANALYSIS_JOB_NOT_FOUND", "解析ジョブが見つかりません。")
        if job["status"] != "draft":
            error(409, "ANALYSIS_ALREADY_CONFIRMED", "確定済みの解析結果は変更できません。")
        test = get_test(conn, job["test_id"])
        units, formats = master_data(conn, test["textbook_id"])
        validate_master_ids(body.items, units, formats)
        conn.execute("DELETE FROM trend_draft_items WHERE job_id=?", (job_id,))
        conn.executemany("INSERT INTO trend_draft_items(job_id,question_no,unit_id,format_id,points,difficulty,confidence) VALUES(?,?,?,?,?,?,?)", [(job_id, i.question_no, i.unit_id, i.format_id, i.points, i.difficulty, i.confidence) for i in body.items])
        return trend_job_response(conn, job_id)


@app.post("/llm/trend-drafts/{job_id}/confirm")
def confirm_trend_draft(job_id: int, body: JobAction):
    with connect() as conn:
        require_user(conn, body.user_id)
        job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='trend_analysis'", (job_id,)).fetchone()
        if not job:
            error(404, "ANALYSIS_JOB_NOT_FOUND", "解析ジョブが見つかりません。")
        items = trend_items_for_job(conn, job_id)
        if not items:
            error(422, "EMPTY_ANALYSIS", "小問がない解析結果は確定できません。")
        conn.execute("DELETE FROM trends WHERE test_id=?", (job["test_id"],))
        conn.executemany("INSERT INTO trends(test_id,unit_id,format_id,question_no,points,difficulty,confidence,source,llm_job_id,reviewed,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,'llm',?,1,?,?)", [(job["test_id"], i["unit_id"], i["format_id"], i["question_no"], i["points"], i["difficulty"], i["confidence"], job_id, body.user_id, utc_now()) for i in items])
        conn.execute("UPDATE llm_jobs SET status='confirmed',confirmed_at=? WHERE id=?", (utc_now(), job_id))
        return trend_job_response(conn, job_id)


@app.post("/llm/trend-drafts/{job_id}/generate", response_model=GenerationJobResponse)
async def generate_from_analysis(job_id: int, body: JobAction, provider: LLMProvider = Depends(get_provider)):
    with connect() as conn:
        require_user(conn, body.user_id)
        job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='trend_analysis'", (job_id,)).fetchone()
        if not job:
            error(404, "ANALYSIS_JOB_NOT_FOUND", "解析ジョブが見つかりません。")
        if job["status"] != "confirmed":
            error(409, "ANALYSIS_NOT_CONFIRMED", "解析結果を修正・確定してから問題を生成してください。")
        test = get_test(conn, job["test_id"])
        units, formats = master_data(conn, test["textbook_id"])
        rows = conn.execute("SELECT unit_id,format_id,difficulty,COUNT(*) count FROM trends WHERE llm_job_id=? GROUP BY unit_id,format_id,difficulty", (job_id,)).fetchall()
        specifications = [dict(row) for row in rows]
    generated = await provider.generate_problems(specifications, units, formats)
    validate_master_ids(generated, units, formats)
    expected = Counter((r["unit_id"], r["format_id"], r["difficulty"]) for r in rows for _ in range(r["count"]))
    actual = Counter((p.unit_id, p.format_id, p.difficulty) for p in generated)
    if actual != expected:
        # デモ緩和モードでは、構成が元テストとずれても止めずに下書きを残す（配点は等分へフォールバックする）。
        if not relaxed_validation_enabled():
            error(422, "GENERATION_COUNT_MISMATCH", "生成問題の構成または問題数が元テストと一致しないため、下書きを保存しませんでした。")
        logger.warning("relaxed validation accepted: generated composition differs from the source test (expected=%s actual=%s)", dict(expected), dict(actual))
    with connect() as conn:
        cursor = conn.execute("INSERT INTO llm_jobs(kind,parent_job_id,test_id,user_id,status,provider,model) VALUES('problem_generation',?,?,?,'draft',?,?)", (job_id, job["test_id"], body.user_id, provider.name, getattr(provider, "model", "test")))
        generation_job_id = cursor.lastrowid
        for p in generated:
            conn.execute("INSERT INTO generated_drafts(job_id,unit_id,format_id,difficulty,body,answer,explanation,hints_json) VALUES(?,?,?,?,?,?,?,?)", (generation_job_id, p.unit_id, p.format_id, p.difficulty, p.body, p.answer, p.explanation, json.dumps(p.hints, ensure_ascii=False)))
        return generation_response(conn, generation_job_id)


def generation_response(conn, job_id: int):
    job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='problem_generation'", (job_id,)).fetchone()
    if not job:
        error(404, "GENERATION_JOB_NOT_FOUND", "問題生成ジョブが見つかりません。")
    problems = []
    for row in conn.execute("SELECT * FROM generated_drafts WHERE job_id=? ORDER BY id", (job_id,)):
        problem = dict(row)
        problem["hints"] = json.loads(problem.pop("hints_json"))
        problem.pop("job_id")
        problems.append(problem)
    fallback = job["provider"] == "quota-template"
    return {"job_id": job_id, "analysis_job_id": job["parent_job_id"], "status": job["status"], "problems": problems,
            "fallback_mode": "quota_template" if fallback else None,
            "notice": "Geminiの無料枠またはレート上限に達したため、編集可能な問題テンプレートを生成しました。内容を確認・修正してから使用してください。" if fallback else None}


@app.get("/llm/problem-batches/{job_id}")
def get_generation(job_id: int):
    with connect() as conn:
        return generation_response(conn, job_id)


@app.put("/llm/problem-batches/{job_id}")
def update_generation(job_id: int, body: SaveGenerationRequest):
    with connect() as conn:
        require_user(conn, body.user_id)
        job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='problem_generation'", (job_id,)).fetchone()
        if not job:
            error(404, "GENERATION_JOB_NOT_FOUND", "問題生成ジョブが見つかりません。")
        if job["status"] != "draft":
            error(409, "GENERATION_ALREADY_SAVED", "問題バンクへ保存済みの生成結果です。")
        old = Counter((row["unit_id"], row["format_id"], row["difficulty"]) for row in conn.execute("SELECT unit_id,format_id,difficulty FROM generated_drafts WHERE job_id=?", (job_id,)))
        new = Counter((p.unit_id, p.format_id, p.difficulty) for p in body.problems)
        if old != new:
            error(422, "GENERATION_STRUCTURE_CHANGED", "元テストと同じ構成を保つため、単元・形式・難易度・問題数は変更できません。")
        conn.execute("DELETE FROM generated_drafts WHERE job_id=?", (job_id,))
        for p in body.problems:
            conn.execute("INSERT INTO generated_drafts(job_id,unit_id,format_id,difficulty,body,answer,explanation,hints_json) VALUES(?,?,?,?,?,?,?,?)", (job_id, p.unit_id, p.format_id, p.difficulty, p.body, p.answer, p.explanation, json.dumps(p.hints, ensure_ascii=False)))
        return generation_response(conn, job_id)


@app.post("/llm/problem-batches/{job_id}/save")
def save_generation(job_id: int, body: SaveGenerationRequest):
    update_generation(job_id, body)
    with connect() as conn:
        job = conn.execute("SELECT * FROM llm_jobs WHERE id=?", (job_id,)).fetchone()
        rows = conn.execute("SELECT * FROM generated_drafts WHERE job_id=? ORDER BY id", (job_id,)).fetchall()
        # 元テストの小問配点をこの時点で確定させ、以降の再解析に影響されないようにする。
        points = assign_trend_points(conn, rows, llm_job_id=job["parent_job_id"]) or [None] * len(rows)
        ids = []
        for row, row_points in zip(rows, points):
            cursor = conn.execute("INSERT INTO problems(unit_id,format_id,difficulty,body,answer,explanation,is_return,status,source,llm_job_id,analysis_job_id,hints_json,prerequisite_unit_ids_json,points) VALUES(?,?,?,?,?,?,0,'draft','llm',?,?,?, '[]',?)", (row["unit_id"], row["format_id"], row["difficulty"], row["body"], row["answer"], row["explanation"], job_id, job["parent_job_id"], row["hints_json"], row_points))
            ids.append(cursor.lastrowid)
        conn.execute("UPDATE llm_jobs SET status='saved',confirmed_at=? WHERE id=?", (utc_now(), job_id))
        return {"job_id": job_id, "analysis_job_id": job["parent_job_id"], "saved": len(ids), "problem_ids": ids}


def assign_trend_points(conn, rows, *, test_id: int | None = None, llm_job_id: int | None = None) -> list[int] | None:
    """Gemini解析で確定した trends の配点を、同じ 単元×形式×難易度 の問題へ出現順に割り当てる。

    問題は trends の構成(単元×形式×難易度ごとの問題数)をそのまま複製して生成されるため、
    この対応付けで元テストの実配点を復元できる。1問でも対応が取れない場合は None を返し、
    呼び出し側は従来どおり満点の等分へフォールバックする。
    """
    if llm_job_id is not None:
        source = ("SELECT unit_id,format_id,difficulty,points FROM trends WHERE llm_job_id=? ORDER BY id", (llm_job_id,))
    else:
        source = ("SELECT unit_id,format_id,difficulty,points FROM trends WHERE test_id=? ORDER BY id", (test_id,))
    buckets: dict[tuple[int, int, int], list[int]] = {}
    for row in conn.execute(*source):
        buckets.setdefault((row["unit_id"], row["format_id"], row["difficulty"]), []).append(row["points"])
    if not buckets:
        return None
    cursors: dict[tuple[int, int, int], int] = {}
    points = []
    for row in rows:
        key = (row["unit_id"], row["format_id"], row["difficulty"])
        index = cursors.get(key, 0)
        available = buckets.get(key, [])
        if index >= len(available):
            return None
        points.append(available[index])
        cursors[key] = index + 1
    return points


def test_problem_points(conn, test_id: int) -> dict[int, int]:
    """テストに紐づく全問題(id昇順)へ実配点を割り当てた {problem_id: points}。復元できなければ空。"""
    rows = conn.execute(
        "SELECT id,unit_id,format_id,difficulty,points FROM problems WHERE analysis_job_id IN (SELECT id FROM llm_jobs WHERE test_id=?) ORDER BY id",
        (test_id,),
    ).fetchall()
    if not rows:
        return {}
    # 保存時に確定させた配点があればそれを使う（その後テストを再解析しても値がぶれない）。
    # 1問でも確定値があれば、それだけを信頼して部分的な対応表を返す。配点が欠けた問題が
    # 選ばれた場合は selected_problem_points 側が従来の等分へフォールバックする。
    stored = {row["id"]: row["points"] for row in rows if row["points"] is not None}
    if stored:
        return stored
    # points 列を追加する前に保存された問題だけのテストは、trends からの復元を試みる。
    points = assign_trend_points(conn, rows, test_id=test_id)
    return {row["id"]: value for row, value in zip(rows, points)} if points else {}


def selected_problem_points(conn, test_id: int, problem_ids: list[int]) -> list[int] | None:
    """印刷対象として選ばれた問題の配点。1問でも欠ければ None（＝等分にフォールバック）。"""
    mapping = test_problem_points(conn, test_id)
    if not mapping or any(problem_id not in mapping for problem_id in problem_ids):
        return None
    return [mapping[problem_id] for problem_id in problem_ids]


def trend_output(conn, test_id: int):
    items = []
    for row in conn.execute("SELECT t.*,u.name unit_name,f.name format_name FROM trends t JOIN units u ON u.id=t.unit_id JOIN formats f ON f.id=t.format_id WHERE t.test_id=? ORDER BY t.id", (test_id,)):
        item = dict(row)
        item["reviewed"] = bool(item["reviewed"])
        items.append(item)
    total = sum(item["points"] for item in items)
    grouped = {}
    for item in items:
        key = item["unit_id"]
        grouped.setdefault(key, {"unit_id": key, "unit_name": item["unit_name"], "question_count": 0, "points": 0})
        grouped[key]["question_count"] += 1
        grouped[key]["points"] += item["points"]
    summary = [{"unit_id": v["unit_id"], "unit_name": v["unit_name"], "question_count": v["question_count"], "point_ratio": v["points"] / total if total else 0} for v in grouped.values()]
    return {"test_id": test_id, "items": items, "summary": summary}


@app.get("/tests/{test_id}/trends")
def get_trends(test_id: int):
    with connect() as conn:
        get_test(conn, test_id)
        return trend_output(conn, test_id)


@app.put("/tests/{test_id}/trends")
def put_trends(test_id: int, body: TrendPutRequest):
    with connect() as conn:
        require_user(conn, body.user_id)
        test = get_test(conn, test_id)
        units, formats = master_data(conn, test["textbook_id"])
        validate_master_ids(body.items, units, formats)
        conn.execute("DELETE FROM trends WHERE test_id=?", (test_id,))
        conn.executemany("INSERT INTO trends(test_id,unit_id,format_id,question_no,points,difficulty,confidence,source,llm_job_id,reviewed,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)", [(test_id, i.unit_id, i.format_id, i.question_no.strip(), i.points, i.difficulty, i.confidence, i.source, i.llm_job_id, body.user_id, utc_now()) for i in body.items])
        return trend_output(conn, test_id)


def problem_out(conn, row):
    result = dict(row)
    result["is_return"] = bool(result["is_return"])
    result["hints"] = [{"step": i + 1, "body": body} for i, body in enumerate(json.loads(result.pop("hints_json")))]
    result["prerequisite_unit_ids"] = json.loads(result.pop("prerequisite_unit_ids_json"))
    result["unit_name"] = conn.execute("SELECT name FROM units WHERE id=?", (result["unit_id"],)).fetchone()[0]
    result["format_name"] = conn.execute("SELECT name FROM formats WHERE id=?", (result["format_id"],)).fetchone()[0]
    result["prerequisites_missing_return"] = []
    return result


@app.get("/problems")
def list_problems(unit_id: int | None = None, format_id: int | None = None, difficulty: int | None = Query(None, ge=1, le=3), status: str | None = None, is_return: bool | None = None, test_id: int | None = None):
    filters, values = [], []
    for column, value in (("unit_id", unit_id), ("format_id", format_id), ("difficulty", difficulty), ("status", status), ("is_return", is_return)):
        if value is not None:
            filters.append(f"{column}=?")
            values.append(int(value) if isinstance(value, bool) else value)
    if test_id is not None:
        filters.append("analysis_job_id IN (SELECT id FROM llm_jobs WHERE test_id=?)")
        values.append(test_id)
    sql = "SELECT * FROM problems" + (" WHERE " + " AND ".join(filters) if filters else "") + " ORDER BY id DESC"
    with connect() as conn:
        return [problem_out(conn, row) for row in conn.execute(sql, values)]


@app.get("/problems/stats")
def problem_stats(test_id: int | None = None, round: int | None = None, level: str | None = None):
    return {"items": []}


@app.get("/tests/{test_id}/problem-points")
def get_problem_points(test_id: int):
    """画面プレビューがPDF・Wordと同じ配点を表示するための対応表。"""
    with connect() as conn:
        get_test(conn, test_id)
        mapping = test_problem_points(conn, test_id)
        return {
            "test_id": test_id,
            "source": "analysis" if mapping else "even",
            "total_points": sum(mapping.values()) if mapping else None,
            "items": [{"problem_id": problem_id, "points": points} for problem_id, points in mapping.items()],
        }


@app.get("/tests/{test_id}/coverage")
def coverage(test_id: int):
    with connect() as conn:
        get_test(conn, test_id)
        cells = []
        rows = conn.execute("SELECT unit_id,format_id,difficulty,COUNT(*) required FROM trends WHERE test_id=? GROUP BY unit_id,format_id,difficulty", (test_id,)).fetchall()
        for row in rows:
            reviewed = conn.execute("SELECT COUNT(*) FROM problems WHERE unit_id=? AND format_id=? AND difficulty=? AND status='reviewed'", (row["unit_id"], row["format_id"], row["difficulty"])).fetchone()[0]
            draft = conn.execute("SELECT COUNT(*) FROM problems WHERE unit_id=? AND format_id=? AND difficulty=? AND status='draft'", (row["unit_id"], row["format_id"], row["difficulty"])).fetchone()[0]
            cells.append({"unit_id": row["unit_id"], "format_id": row["format_id"], "difficulty": row["difficulty"], "required": row["required"], "reviewed": reviewed, "draft": draft})
        return {"multiplier": 1, "cells": cells, "return_missing_unit_ids": []}


@app.get("/problems/{problem_id:int}")
def get_problem(problem_id: int):
    with connect() as conn:
        row = conn.execute("SELECT * FROM problems WHERE id=?", (problem_id,)).fetchone()
        if not row:
            error(404, "PROBLEM_NOT_FOUND", "問題が見つかりません。")
        return problem_out(conn, row)


@app.post("/problems")
def create_problem(body: ProblemCreate):
    with connect() as conn:
        validate_master_ids([body], [dict(r) for r in conn.execute("SELECT id FROM units")], [dict(r) for r in conn.execute("SELECT id FROM formats")])
        cursor = conn.execute("INSERT INTO problems(unit_id,format_id,difficulty,body,answer,explanation,is_return,status,source,llm_job_id,hints_json,prerequisite_unit_ids_json) VALUES(?,?,?,?,?,?,?,'draft',?,?,?,?)", (body.unit_id, body.format_id, body.difficulty, body.body.strip(), body.answer.strip(), body.explanation, int(body.is_return), body.source, body.llm_job_id, json.dumps(body.hints, ensure_ascii=False), json.dumps(body.prerequisite_unit_ids)))
        return problem_out(conn, conn.execute("SELECT * FROM problems WHERE id=?", (cursor.lastrowid,)).fetchone())


@app.put("/problems/{problem_id:int}")
def update_problem(problem_id: int, body: ProblemCreate):
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM problems WHERE id=?", (problem_id,)).fetchone():
            error(404, "PROBLEM_NOT_FOUND", "問題が見つかりません。")
        validate_master_ids([body], [dict(r) for r in conn.execute("SELECT id FROM units")], [dict(r) for r in conn.execute("SELECT id FROM formats")])
        conn.execute("UPDATE problems SET unit_id=?,format_id=?,difficulty=?,body=?,answer=?,explanation=?,is_return=?,source=?,llm_job_id=?,hints_json=?,prerequisite_unit_ids_json=? WHERE id=?", (body.unit_id, body.format_id, body.difficulty, body.body.strip(), body.answer.strip(), body.explanation, int(body.is_return), body.source, body.llm_job_id, json.dumps(body.hints, ensure_ascii=False), json.dumps(body.prerequisite_unit_ids), problem_id))
        return problem_out(conn, conn.execute("SELECT * FROM problems WHERE id=?", (problem_id,)).fetchone())


@app.post("/problems/{problem_id:int}/review")
def review_problem(problem_id: int, body: JobAction):
    with connect() as conn:
        require_user(conn, body.user_id)
        if not conn.execute("SELECT 1 FROM problems WHERE id=?", (problem_id,)).fetchone():
            error(404, "PROBLEM_NOT_FOUND", "問題が見つかりません。")
        conn.execute("UPDATE problems SET status='reviewed',reviewed_by=?,reviewed_at=? WHERE id=?", (body.user_id, utc_now(), problem_id))
        return problem_out(conn, conn.execute("SELECT * FROM problems WHERE id=?", (problem_id,)).fetchone())


def prerequisite_out(row):
    result = dict(row)
    result["confirmed"] = bool(result["confirmed"])
    return result


@app.get("/tests/{test_id}/prerequisites")
def get_test_prerequisites(test_id: int):
    with connect() as conn:
        test = get_test(conn, test_id)
        unit_ids = json.loads(test["unit_ids_json"])
        groups = []
        for unit_id in unit_ids:
            unit = conn.execute("SELECT id,name FROM units WHERE id=?", (unit_id,)).fetchone()
            if not unit:
                continue
            rows = conn.execute(
                "SELECT p.*,u.name prerequisite_unit_name FROM unit_prerequisites p JOIN units u ON u.id=p.prerequisite_unit_id WHERE p.unit_id=? ORDER BY u.order_no",
                (unit_id,),
            ).fetchall()
            items = [prerequisite_out(row) for row in rows]
            groups.append({"unit_id": unit_id, "unit_name": unit["name"], "confirmed": bool(items) and all(item["confirmed"] for item in items), "prerequisites": items})
        return {"test_id": test_id, "units": groups}


@app.put("/units/{unit_id}/prerequisites")
def put_unit_prerequisites(unit_id: int, body: PrerequisitePutRequest):
    with connect() as conn:
        require_user(conn, body.user_id)
        unit = conn.execute("SELECT textbook_id FROM units WHERE id=?", (unit_id,)).fetchone()
        if not unit:
            error(404, "UNIT_NOT_FOUND", "単元が見つかりません。")
        prerequisite_ids = [item.prerequisite_unit_id for item in body.items]
        if unit_id in prerequisite_ids or len(set(prerequisite_ids)) != len(prerequisite_ids):
            error(422, "INVALID_PREREQUISITE", "同じ単元や重複した単元は前提単元に指定できません。")
        valid = {row[0] for row in conn.execute("SELECT id FROM units WHERE textbook_id=?", (unit["textbook_id"],))}
        if any(item_id not in valid for item_id in prerequisite_ids):
            error(422, "UNKNOWN_PREREQUISITE", "同じ教科書に存在する単元を選択してください。")
        conn.execute("DELETE FROM unit_prerequisites WHERE unit_id=?", (unit_id,))
        for item in body.items:
            conn.execute(
                "INSERT INTO unit_prerequisites(unit_id,prerequisite_unit_id,reason,source,llm_job_id) VALUES(?,?,?,?,?)",
                (unit_id, item.prerequisite_unit_id, item.reason, item.source, item.llm_job_id),
            )
        rows = conn.execute("SELECT p.*,u.name prerequisite_unit_name FROM unit_prerequisites p JOIN units u ON u.id=p.prerequisite_unit_id WHERE p.unit_id=? ORDER BY u.order_no", (unit_id,)).fetchall()
        return [prerequisite_out(row) for row in rows]


@app.post("/units/{unit_id}/prerequisites/{prerequisite_unit_id}/review")
def review_prerequisite(unit_id: int, prerequisite_unit_id: int, body: PrerequisiteReviewRequest):
    with connect() as conn:
        require_user(conn, body.user_id)
        row = conn.execute("SELECT 1 FROM unit_prerequisites WHERE unit_id=? AND prerequisite_unit_id=?", (unit_id, prerequisite_unit_id)).fetchone()
        if not row:
            error(404, "PREREQUISITE_NOT_FOUND", "前提単元が見つかりません。")
        conn.execute(
            "UPDATE unit_prerequisites SET confirmed=?,teacher_note=?,reviewed_by=?,reviewed_at=? WHERE unit_id=? AND prerequisite_unit_id=?",
            (int(body.confirmed), body.teacher_note, body.user_id, utc_now(), unit_id, prerequisite_unit_id),
        )
        row = conn.execute("SELECT p.*,u.name prerequisite_unit_name FROM unit_prerequisites p JOIN units u ON u.id=p.prerequisite_unit_id WHERE p.unit_id=? AND p.prerequisite_unit_id=?", (unit_id, prerequisite_unit_id)).fetchone()
        return prerequisite_out(row)


def worksheet_out(conn, row):
    result = dict(row)
    result["locked"] = bool(result["locked"])
    result["items"] = []
    for item in conn.execute("SELECT * FROM worksheet_items WHERE worksheet_id=? ORDER BY sort_order", (row["id"],)):
        value = dict(item)
        value["is_return"] = bool(value["is_return"])
        value.pop("worksheet_id")
        result["items"].append(value)
    result.pop("created_at", None)
    return result


def save_worksheet_items(conn, worksheet_id: int, items):
    problem_ids = [item.problem_id for item in items]
    existing = {row[0] for row in conn.execute(f"SELECT id FROM problems WHERE id IN ({','.join('?' for _ in problem_ids)})", problem_ids)} if problem_ids else set()
    if len(existing) != len(set(problem_ids)):
        error(422, "UNKNOWN_PROBLEM", "冊子に追加された問題が問題バンクに見つかりません。")
    conn.execute("DELETE FROM worksheet_items WHERE worksheet_id=?", (worksheet_id,))
    inserted_ids = []
    main_no = return_no = 0
    for index, item in enumerate(items):
        if item.is_return:
            return_no += 1
            item_no = f"R-{return_no}"
        else:
            main_no += 1
            item_no = str(main_no)
        parent_item_id = None
        if item.parent_index is not None:
            if item.parent_index >= index or item.parent_index >= len(inserted_ids):
                error(422, "INVALID_PARENT", "戻り問題の元問題は、それより前にある問題を選択してください。")
            parent_item_id = inserted_ids[item.parent_index]
        if item.is_return and parent_item_id is None:
            error(422, "MISSING_PARENT", "戻り問題には元の問題を指定してください。")
        cursor = conn.execute("INSERT INTO worksheet_items(worksheet_id,item_no,sort_order,problem_id,is_return,parent_item_id) VALUES(?,?,?,?,?,?)", (worksheet_id, item_no, index, item.problem_id, int(item.is_return), parent_item_id))
        inserted_ids.append(cursor.lastrowid)


@app.get("/tests/{test_id}/worksheets")
def list_worksheets(test_id: int):
    with connect() as conn:
        get_test(conn, test_id)
        return [worksheet_out(conn, row) for row in conn.execute("SELECT * FROM worksheets WHERE test_id=? ORDER BY level,version DESC", (test_id,))]


@app.post("/tests/{test_id}/worksheets")
def create_worksheet(test_id: int, body: WorksheetCreateRequest):
    with connect() as conn:
        get_test(conn, test_id)
        version = conn.execute("SELECT COALESCE(MAX(version),0)+1 FROM worksheets WHERE test_id=? AND level=?", (test_id, body.level)).fetchone()[0]
        cursor = conn.execute("INSERT INTO worksheets(test_id,level,version) VALUES(?,?,?)", (test_id, body.level, version))
        save_worksheet_items(conn, cursor.lastrowid, body.items)
        return worksheet_out(conn, conn.execute("SELECT * FROM worksheets WHERE id=?", (cursor.lastrowid,)).fetchone())


@app.get("/worksheets/{worksheet_id}")
def get_worksheet(worksheet_id: int):
    with connect() as conn:
        row = conn.execute("SELECT * FROM worksheets WHERE id=?", (worksheet_id,)).fetchone()
        if not row:
            error(404, "WORKSHEET_NOT_FOUND", "冊子が見つかりません。")
        return worksheet_out(conn, row)


@app.put("/worksheets/{worksheet_id}")
def update_worksheet(worksheet_id: int, body: WorksheetCreateRequest):
    with connect() as conn:
        row = conn.execute("SELECT * FROM worksheets WHERE id=?", (worksheet_id,)).fetchone()
        if not row:
            error(404, "WORKSHEET_NOT_FOUND", "冊子が見つかりません。")
        if row["locked"]:
            error(409, "WORKSHEET_LOCKED", "解答記録があるため、この冊子は編集できません。新しい版を作成してください。")
        save_worksheet_items(conn, worksheet_id, body.items)
        return worksheet_out(conn, conn.execute("SELECT * FROM worksheets WHERE id=?", (worksheet_id,)).fetchone())


@app.post("/tests/{test_id}/pdf")
def export_test_pdf(test_id: int, body: PdfExportRequest):
    with connect() as conn:
        test = get_test(conn, test_id)
        school = conn.execute("SELECT name FROM schools WHERE id=?", (test["school_id"],)).fetchone()
        textbook = conn.execute("SELECT title,subject FROM textbooks WHERE id=?", (test["textbook_id"],)).fetchone()
        rows = conn.execute(f"SELECT * FROM problems WHERE id IN ({','.join('?' for _ in body.problem_ids)})", body.problem_ids).fetchall()
        by_id = {row["id"]: dict(row) for row in rows}
        if any(problem_id not in by_id for problem_id in body.problem_ids):
            error(422, "UNKNOWN_PROBLEM", "PDFに含める問題が問題バンクに見つかりません。")
        problems = [by_id[problem_id] for problem_id in body.problem_ids]
        subject = re.sub(r"^高等学校\s*", "", textbook["title"]) or textbook["subject"]
        title = (body.title or f"{test['term']}テスト対策問題").strip()
        pdf = build_test_pdf(
            school_name=school["name"], grade=test["grade"], subject=subject, title=title,
            duration_minutes=body.duration_minutes, total_points=body.total_points, problems=problems,
            problem_points=selected_problem_points(conn, test_id, body.problem_ids),
            include_answers=body.include_answers,
        )
        filename = document_filename(test, subject, "pdf", body.include_answers)
        return Response(pdf, media_type="application/pdf", headers=attachment_headers(filename))


def test_document_context(conn, test_id: int):
    test = get_test(conn, test_id)
    school = conn.execute("SELECT name FROM schools WHERE id=?", (test["school_id"],)).fetchone()
    textbook = conn.execute("SELECT title,subject FROM textbooks WHERE id=?", (test["textbook_id"],)).fetchone()
    subject = re.sub(r"^高等学校\s*", "", textbook["title"]) or textbook["subject"]
    return test, school["name"], subject


def document_filename(test, subject: str, extension: str, include_answers: bool = False):
    safe_subject = re.sub(r'[\\/:*?"<>|\s]+', '', subject)
    safe_term = re.sub(r'[\\/:*?"<>|\s]+', '', test["term"])
    suffix = "_解答解説" if include_answers else ""
    return f"{test['year']}_{test['grade']}_{safe_subject}_{safe_term}_対策問題{suffix}.{extension}"


def attachment_headers(filename: str):
    encoded_filename = quote(filename)
    return {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}", "X-Filename": encoded_filename}


@app.post("/tests/{test_id}/word")
def export_test_word(test_id: int, body: PdfExportRequest):
    with connect() as conn:
        test, school_name, subject = test_document_context(conn, test_id)
        rows = conn.execute(f"SELECT * FROM problems WHERE id IN ({','.join('?' for _ in body.problem_ids)})", body.problem_ids).fetchall()
        by_id = {row["id"]: dict(row) for row in rows}
        if any(problem_id not in by_id for problem_id in body.problem_ids):
            error(422, "UNKNOWN_PROBLEM", "Wordに含める問題が問題バンクに見つかりません。")
        problems = [by_id[problem_id] for problem_id in body.problem_ids]
        title = (body.title or f"{test['term']}テスト対策問題").strip()
        content = build_test_docx(
            school_name=school_name, grade=test["grade"], subject=subject, title=title,
            duration_minutes=body.duration_minutes, total_points=body.total_points, problems=problems,
            problem_points=selected_problem_points(conn, test_id, body.problem_ids),
            include_answers=body.include_answers,
        )
        filename = document_filename(test, subject, "docx", body.include_answers)
        return Response(content, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers=attachment_headers(filename))


def generation_export_context(conn, generation_job_id: int):
    job = conn.execute("SELECT * FROM llm_jobs WHERE id=? AND kind='problem_generation'", (generation_job_id,)).fetchone()
    if not job:
        error(404, "GENERATION_JOB_NOT_FOUND", "問題生成ジョブが見つかりません。")
    problems = [dict(row) for row in conn.execute("SELECT * FROM generated_drafts WHERE job_id=? ORDER BY id", (generation_job_id,))]
    if not problems:
        error(422, "EMPTY_GENERATION", "生成問題がないためファイルを作成できません。")
    test, school_name, subject = test_document_context(conn, job["test_id"])
    return test, school_name, subject, problems, assign_trend_points(conn, problems, llm_job_id=job["parent_job_id"])


@app.post("/llm/problem-batches/{generation_job_id}/pdf")
def export_generation_pdf(generation_job_id: int, body: GenerationExportRequest):
    with connect() as conn:
        test, school_name, subject, problems, problem_points = generation_export_context(conn, generation_job_id)
        title = (body.title or f"{test['term']}テスト対策問題").strip()
        content = build_test_pdf(
            school_name=school_name, grade=test["grade"], subject=subject, title=title,
            duration_minutes=body.duration_minutes, total_points=body.total_points, problems=problems,
            problem_points=problem_points, include_answers=body.include_answers,
        )
        filename = document_filename(test, subject, "pdf", body.include_answers)
        return Response(content, media_type="application/pdf", headers=attachment_headers(filename))


@app.post("/llm/problem-batches/{generation_job_id}/word")
def export_generation_word(generation_job_id: int, body: GenerationExportRequest):
    with connect() as conn:
        test, school_name, subject, problems, problem_points = generation_export_context(conn, generation_job_id)
        title = (body.title or f"{test['term']}テスト対策問題").strip()
        content = build_test_docx(
            school_name=school_name, grade=test["grade"], subject=subject, title=title,
            duration_minutes=body.duration_minutes, total_points=body.total_points, problems=problems,
            problem_points=problem_points, include_answers=body.include_answers,
        )
        filename = document_filename(test, subject, "docx", body.include_answers)
        return Response(content, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers=attachment_headers(filename))
