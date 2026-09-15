from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import not_found

router = APIRouter(tags=["answer_sheets"])


def _answer_sheet_detail(a: models.AnswerSheet, db: Session) -> schemas.AnswerSheetDetail:
    student = db.get(models.Student, a.student_id)
    lesson = db.get(models.Lesson, a.lesson_id)
    ws_items = (
        db.query(models.WorksheetItem)
        .filter(models.WorksheetItem.worksheet_id == a.worksheet_id)
        .order_by(models.WorksheetItem.sort_order)
        .all()
    )
    attempts_by_item = {
        att.worksheet_item_id: att
        for att in db.query(models.Attempt).filter(models.Attempt.answer_sheet_id == a.id).all()
    }

    items = []
    for wi in ws_items:
        problem = db.get(models.Problem, wi.problem_id)
        unit = db.get(models.Unit, problem.unit_id) if problem else None
        att = attempts_by_item.get(wi.id)
        items.append(
            schemas.AnswerSheetItemDetail(
                worksheet_item_id=wi.id,
                item_no=wi.item_no,
                sort_order=wi.sort_order,
                problem_id=wi.problem_id,
                is_return=wi.is_return,
                parent_item_id=wi.parent_item_id,
                unit_id=problem.unit_id if problem else 0,
                unit_name=unit.name if unit else "",
                attempt=(
                    schemas.AttemptOut(
                        is_correct=att.is_correct,
                        hint_step=att.hint_step,
                        went_return=att.went_return,
                        red_card=att.red_card,
                        memo=att.memo,
                    )
                    if att
                    else None
                ),
            )
        )

    return schemas.AnswerSheetDetail(
        id=a.id,
        student_id=a.student_id,
        student_code=student.student_code if student else "",
        lesson_id=a.lesson_id,
        worksheet_id=a.worksheet_id,
        status=a.status,
        source=a.source,
        llm_job_id=a.llm_job_id,
        confirmed_by=a.confirmed_by,
        confirmed_at=a.confirmed_at,
        round=lesson.round if lesson else 0,
        items=items,
    )


@router.get("/answer-sheets/{answer_sheet_id}", response_model=schemas.AnswerSheetDetail)
def get_answer_sheet(answer_sheet_id: int, db: Session = Depends(get_db)):
    a = db.get(models.AnswerSheet, answer_sheet_id)
    if not a:
        raise not_found("解答用紙")
    return _answer_sheet_detail(a, db)


@router.put("/answer-sheets/{answer_sheet_id}/attempts", response_model=schemas.AttemptsPutResponse)
def put_attempts(
    answer_sheet_id: int, body: schemas.AttemptsPutRequest, db: Session = Depends(get_db)
):
    a = db.get(models.AnswerSheet, answer_sheet_id)
    if not a:
        raise not_found("解答用紙")

    ws_items_by_id = {
        wi.id: wi
        for wi in db.query(models.WorksheetItem).filter(
            models.WorksheetItem.worksheet_id == a.worksheet_id
        )
    }

    warnings: list[schemas.AttemptWarning] = []
    submitted_item_ids = set()
    for att_in in body.attempts:
        submitted_item_ids.add(att_in.worksheet_item_id)
        existing = (
            db.query(models.Attempt)
            .filter(
                models.Attempt.answer_sheet_id == answer_sheet_id,
                models.Attempt.worksheet_item_id == att_in.worksheet_item_id,
            )
            .first()
        )
        if existing is None:
            existing = models.Attempt(
                answer_sheet_id=answer_sheet_id, worksheet_item_id=att_in.worksheet_item_id
            )
            db.add(existing)
        existing.is_correct = att_in.is_correct
        existing.hint_step = att_in.hint_step
        existing.went_return = att_in.went_return
        existing.red_card = att_in.red_card
        existing.memo = att_in.memo

        ws_item = ws_items_by_id.get(att_in.worksheet_item_id)
        is_return_item = bool(ws_item and ws_item.is_return)
        if att_in.is_correct and att_in.red_card:
            warnings.append(
                schemas.AttemptWarning(
                    worksheet_item_id=att_in.worksheet_item_id,
                    code="RETURN_CORRECT_WITH_RED_CARD" if is_return_item else "CORRECT_WITH_RED_CARD",
                    message="正答なのに赤札が付いています" if not is_return_item else "戻り問題が正答なのに赤札が付いています",
                )
            )

    for wi_id, wi in ws_items_by_id.items():
        if wi.is_return and wi_id not in submitted_item_ids:
            warnings.append(
                schemas.AttemptWarning(
                    worksheet_item_id=wi_id,
                    code="RETURN_BLANK",
                    message="戻り問題の解答が未入力です",
                )
            )

    if a.status == "empty":
        a.status = "in_progress"
    db.commit()
    return schemas.AttemptsPutResponse(saved=len(body.attempts), warnings=warnings)


@router.post("/answer-sheets/{answer_sheet_id}/confirm", response_model=schemas.ConfirmAnswerSheetResponse)
def confirm_answer_sheet(
    answer_sheet_id: int, body: schemas.ConfirmAnswerSheetRequest, db: Session = Depends(get_db)
):
    a = db.get(models.AnswerSheet, answer_sheet_id)
    if not a:
        raise not_found("解答用紙")
    a.status = "confirmed"
    a.confirmed_by = body.user_id
    a.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(a)

    next_sheet = (
        db.query(models.AnswerSheet)
        .filter(
            models.AnswerSheet.lesson_id == a.lesson_id,
            models.AnswerSheet.id != a.id,
            models.AnswerSheet.status != "confirmed",
        )
        .order_by(models.AnswerSheet.id)
        .first()
    )

    return schemas.ConfirmAnswerSheetResponse(
        answer_sheet=_answer_sheet_detail(a, db),
        next_answer_sheet_id=next_sheet.id if next_sheet else None,
    )
