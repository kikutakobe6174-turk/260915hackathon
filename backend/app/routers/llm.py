from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import ApiException, not_found
from app.services.gemini import GeminiClient, get_gemini_client

router = APIRouter(prefix="/llm", tags=["llm"])


def _log_job(db: Session, job_type: str, user_id: int) -> models.LlmJob:
    job = models.LlmJob(type=job_type, user_id=user_id)
    db.add(job)
    db.flush()
    return job


def _confirmed_prerequisite_ids(db: Session, unit_id: int) -> list[int]:
    rows = (
        db.query(models.Prerequisite)
        .filter(models.Prerequisite.unit_id == unit_id, models.Prerequisite.confirmed.is_(True))
        .all()
    )
    return [r.prerequisite_unit_id for r in rows]


def _valid_hints(raw_hints) -> list[schemas.ProblemDraftHintOut] | None:
    try:
        hints = [schemas.ProblemDraftHintOut(**h) for h in raw_hints]
    except Exception:
        return None
    steps = sorted(h.step for h in hints)
    if steps != [1, 2, 3]:
        return None
    return sorted(hints, key=lambda h: h.step)


# ---- trend-draft: 過去テスト画像 -> 出題傾向の下書き ----


@router.post("/trend-draft", response_model=schemas.TrendDraftResponse)
def trend_draft(
    body: schemas.TrendDraftRequest,
    db: Session = Depends(get_db),
    gemini: GeminiClient = Depends(get_gemini_client),
):
    test = db.get(models.Test, body.test_id)
    if not test:
        raise not_found("テスト")
    units = db.query(models.Unit).filter(models.Unit.textbook_id == test.textbook_id).all()
    formats = db.query(models.Format).all()
    unit_ids = {u.id for u in units}
    format_ids = {f.id for f in formats}

    unit_list = "\n".join(f"- id={u.id}: {u.name}" for u in units)
    format_list = "\n".join(f"- id={f.id}: {f.name}" for f in formats)
    prompt = f"""あなたは学習塾の教務担当です。添付されたテスト画像から出題された小問を読み取り、
以下のJSON配列形式で出力してください。他のテキストは一切含めないでください。

各要素: {{"question_no": string, "unit_id": number|null, "format_id": number|null,
"points": number, "difficulty": 1|2|3, "confidence": number(0〜1)}}

単元候補(unit_id):
{unit_list}

形式候補(format_id):
{format_list}

unit_id/format_idは上記候補の中から最も近いものを選び、自信がなければnullにしてください。
"""
    raw = gemini.generate_json_from_image(prompt, body.image_base64, body.media_type)
    if not isinstance(raw, list):
        raw = []

    items: list[schemas.TrendDraftItemOut] = []
    for entry in raw:
        try:
            item = schemas.TrendDraftItemOut(
                question_no=str(entry.get("question_no", "")),
                unit_id=entry.get("unit_id") if entry.get("unit_id") in unit_ids else None,
                format_id=entry.get("format_id") if entry.get("format_id") in format_ids else None,
                points=int(entry.get("points", 0)),
                difficulty=entry.get("difficulty", 1),
                confidence=float(entry.get("confidence", 0.5)),
            )
        except Exception:
            continue
        items.append(item)

    job = _log_job(db, "trend_draft", body.user_id)
    db.commit()
    return schemas.TrendDraftResponse(job_id=job.id, image_discarded=True, items=items)


# ---- prereq-suggest: 単元 -> 前提単元の提案 ----


@router.post("/prereq-suggest", response_model=schemas.PrereqSuggestResponse)
def prereq_suggest(
    body: schemas.PrereqSuggestRequest,
    db: Session = Depends(get_db),
    gemini: GeminiClient = Depends(get_gemini_client),
):
    unit = db.get(models.Unit, body.unit_id)
    if not unit:
        raise not_found("単元")
    candidates = (
        db.query(models.Unit)
        .filter(models.Unit.textbook_id == unit.textbook_id, models.Unit.id != unit.id)
        .order_by(models.Unit.order_no)
        .all()
    )
    candidate_ids = {c.id for c in candidates}
    candidate_list = "\n".join(f"- id={c.id}: {c.name}" for c in candidates)

    prompt = f"""あなたは学習塾のカリキュラム担当です。単元「{unit.name}」を理解するために
前提として必要な単元を、以下の候補から選んでください。JSON配列のみを出力してください。

各要素: {{"prerequisite_unit_id": number, "reason": string}}

候補:
{candidate_list}
"""
    raw = gemini.generate_json(prompt)
    if not isinstance(raw, list):
        raw = []

    suggestions: list[schemas.PrereqSuggestionOut] = []
    for entry in raw:
        try:
            pid = int(entry.get("prerequisite_unit_id"))
            reason = str(entry.get("reason", ""))
        except Exception:
            continue
        if pid not in candidate_ids:
            continue
        suggestions.append(schemas.PrereqSuggestionOut(prerequisite_unit_id=pid, reason=reason))

    job = _log_job(db, "prereq_suggest", body.user_id)
    db.commit()
    return schemas.PrereqSuggestResponse(job_id=job.id, suggestions=suggestions)


# ---- problem-draft: 単元/形式/難易度指定での作問 ----


def _problem_prompt(unit_name: str, format_name: str, difficulty: int, count: int) -> str:
    return f"""あなたは学習塾の教材作成担当です。以下の条件で数学の問題を{count}問作成してください。
JSON配列のみを出力し、他のテキストは含めないでください。

条件: 単元「{unit_name}」、形式「{format_name}」、難易度{difficulty}(1〜3)

各要素: {{"body": string, "answer": string, "explanation": string,
"hints": [{{"step": 1, "body": string}}, {{"step": 2, "body": string}}, {{"step": 3, "body": string}}]}}

本文はLaTeX記法（$...$ または $$...$$）を使用可能です。ヒントは必ず3段（step 1,2,3）すべて出力してください。
"""


@router.post("/problem-draft", response_model=schemas.ProblemDraftResponse)
def problem_draft(
    body: schemas.ProblemDraftRequest,
    db: Session = Depends(get_db),
    gemini: GeminiClient = Depends(get_gemini_client),
):
    unit = db.get(models.Unit, body.unit_id)
    fmt = db.get(models.Format, body.format_id)
    if not unit:
        raise not_found("単元")
    if not fmt:
        raise not_found("形式")

    prompt = _problem_prompt(unit.name, fmt.name, body.difficulty, body.count)
    raw = gemini.generate_json(prompt)
    if not isinstance(raw, list):
        raw = []

    drafts: list[schemas.ProblemDraftItemOut] = []
    for entry in raw:
        hints = _valid_hints(entry.get("hints", []))
        if hints is None:
            continue
        try:
            drafts.append(
                schemas.ProblemDraftItemOut(
                    body=str(entry["body"]),
                    answer=str(entry["answer"]),
                    explanation=str(entry.get("explanation", "")),
                    hints=hints,
                    prerequisite_unit_ids=body.prerequisite_unit_ids,
                )
            )
        except Exception:
            continue

    job = _log_job(db, "problem_draft", body.user_id)
    db.commit()
    return schemas.ProblemDraftResponse(job_id=job.id, drafts=drafts)


# ---- trend-problem-draft(新規): テスト×単元の傾向をもとにした作問 ----


MAX_COMBOS_PER_UNIT = 5


@router.post("/trend-problem-draft", response_model=schemas.TrendProblemDraftResponse)
def trend_problem_draft(
    body: schemas.TrendProblemDraftRequest,
    db: Session = Depends(get_db),
    gemini: GeminiClient = Depends(get_gemini_client),
):
    all_drafts: list[schemas.TrendProblemDraftItemOut] = []
    any_trend_data = False

    for target in body.targets:
        test = db.get(models.Test, target.test_id)
        unit = db.get(models.Unit, target.unit_id)
        if not test or not unit:
            continue

        trend_items = (
            db.query(models.TrendItem)
            .filter(
                models.TrendItem.test_id == target.test_id,
                models.TrendItem.unit_id == target.unit_id,
            )
            .all()
        )
        if not trend_items:
            continue
        any_trend_data = True

        combo_counts: dict[tuple[int, int], list[int]] = defaultdict(list)
        for item in trend_items:
            combo_counts[(item.format_id, item.difficulty)].append(item.points)

        combos = sorted(combo_counts.items(), key=lambda kv: -len(kv[1]))[:MAX_COMBOS_PER_UNIT]
        combo_descriptions = []
        combo_meta = []
        for (format_id, difficulty), points_list in combos:
            fmt = db.get(models.Format, format_id)
            avg_points = round(sum(points_list) / len(points_list))
            combo_descriptions.append(
                f"- 形式「{fmt.name if fmt else format_id}」、難易度{difficulty}、"
                f"出題実績{len(points_list)}回、想定配点{avg_points}点"
            )
            combo_meta.append((format_id, difficulty))

        prompt = f"""あなたは学習塾の教材作成担当です。単元「{unit.name}」について、
過去の出題傾向をもとに、下記の組み合わせごとに1問ずつ数学の問題を作成してください。
JSON配列のみを出力し、他のテキストは含めないでください（配列の長さは組み合わせの数と一致させてください）。

出題傾向:
{chr(10).join(combo_descriptions)}

各要素: {{"body": string, "answer": string, "explanation": string,
"hints": [{{"step": 1, "body": string}}, {{"step": 2, "body": string}}, {{"step": 3, "body": string}}]}}

本文はLaTeX記法（$...$ または $$...$$）を使用可能です。ヒントは必ず3段（step 1,2,3）すべて出力してください。
"""
        raw = gemini.generate_json(prompt)
        if not isinstance(raw, list):
            raw = []

        prerequisite_unit_ids = _confirmed_prerequisite_ids(db, target.unit_id)

        for i, entry in enumerate(raw):
            if i >= len(combo_meta):
                break
            hints = _valid_hints(entry.get("hints", []))
            if hints is None:
                continue
            format_id, difficulty = combo_meta[i]
            try:
                all_drafts.append(
                    schemas.TrendProblemDraftItemOut(
                        test_id=target.test_id,
                        unit_id=target.unit_id,
                        format_id=format_id,
                        difficulty=difficulty,
                        body=str(entry["body"]),
                        answer=str(entry["answer"]),
                        explanation=str(entry.get("explanation", "")),
                        hints=hints,
                        prerequisite_unit_ids=prerequisite_unit_ids,
                    )
                )
            except Exception:
                continue

    if not any_trend_data:
        raise ApiException(
            422,
            "NO_TREND_DATA",
            "選択したテスト・単元の組み合わせに出題傾向データがありません。先に出題傾向を保存してください。",
        )

    job = _log_job(db, "trend_problem_draft", body.user_id)
    db.commit()
    return schemas.TrendProblemDraftResponse(job_id=job.id, drafts=all_drafts)


# ---- sheet-draft: 採点済み解答用紙画像 -> 解答記録の下書き ----


@router.post("/sheet-draft", response_model=schemas.SheetDraftResponse)
def sheet_draft(
    body: schemas.SheetDraftRequest,
    db: Session = Depends(get_db),
    gemini: GeminiClient = Depends(get_gemini_client),
):
    answer_sheet = db.get(models.AnswerSheet, body.answer_sheet_id)
    if not answer_sheet:
        raise not_found("解答用紙")
    ws_items = (
        db.query(models.WorksheetItem)
        .filter(models.WorksheetItem.worksheet_id == answer_sheet.worksheet_id)
        .order_by(models.WorksheetItem.sort_order)
        .all()
    )
    item_by_no = {i.item_no: i for i in ws_items}
    item_list = "\n".join(f"- {i.item_no}" for i in ws_items)

    prompt = f"""あなたは学習塾の採点担当です。添付された生徒の解答用紙画像を読み取り、
各設問番号について採点結果をJSON配列で出力してください。他のテキストは含めないでください。

設問番号一覧:
{item_list}

各要素: {{"item_no": string, "is_correct": boolean, "hint_step": 0|1|2|3,
"went_return": boolean, "red_card": boolean, "confidence": number(0〜1)}}

hint_stepは使用したヒントの段数（未使用なら0）、went_returnは戻り学習に進んだか、
red_cardは先生が注意フラグを付けたマークがあるかを表します。
"""
    raw = gemini.generate_json_from_image(prompt, body.image_base64, body.media_type)
    if not isinstance(raw, list):
        raw = []

    rows: list[schemas.SheetDraftRowOut] = []
    for entry in raw:
        item_no = str(entry.get("item_no", ""))
        ws_item = item_by_no.get(item_no)
        try:
            rows.append(
                schemas.SheetDraftRowOut(
                    item_no=item_no,
                    worksheet_item_id=ws_item.id if ws_item else None,
                    is_correct=bool(entry.get("is_correct", False)),
                    hint_step=entry.get("hint_step", 0),
                    went_return=bool(entry.get("went_return", False)),
                    red_card=bool(entry.get("red_card", False)),
                    confidence=float(entry.get("confidence", 0.5)),
                )
            )
        except Exception:
            continue

    if answer_sheet.status == "empty":
        answer_sheet.status = "llm_draft"
    job = _log_job(db, "sheet_draft", body.user_id)
    db.commit()
    return schemas.SheetDraftResponse(job_id=job.id, image_discarded=True, rows=rows)
