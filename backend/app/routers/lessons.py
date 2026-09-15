from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import not_found

router = APIRouter(tags=["lessons"])


@router.get("/lessons", response_model=list[schemas.Lesson])
def list_lessons(test_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Lesson)
    if test_id is not None:
        q = q.filter(models.Lesson.test_id == test_id)
    return q.order_by(models.Lesson.id).all()


@router.post("/lessons", response_model=schemas.Lesson)
def create_lesson(body: schemas.CreateLessonRequest, db: Session = Depends(get_db)):
    obj = models.Lesson(
        test_id=body.test_id,
        lesson_date=body.lesson_date,
        class_name=body.class_name,
        round=body.round,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def _answer_sheet_list_item(a: models.AnswerSheet, db: Session) -> schemas.AnswerSheetListItem:
    student = db.get(models.Student, a.student_id)
    school = db.get(models.School, student.school_id) if student else None
    worksheet = db.get(models.Worksheet, a.worksheet_id)
    red_card_count = (
        db.query(models.Attempt)
        .filter(models.Attempt.answer_sheet_id == a.id, models.Attempt.red_card.is_(True))
        .count()
    )
    return schemas.AnswerSheetListItem(
        id=a.id,
        student_id=a.student_id,
        student_code=student.student_code if student else "",
        school_name=school.name if school else "",
        worksheet_id=a.worksheet_id,
        worksheet_level=worksheet.level if worksheet else "A",
        status=a.status,
        red_card_count=red_card_count,
    )


@router.get("/lessons/{lesson_id}/answer-sheets", response_model=list[schemas.AnswerSheetListItem])
def list_answer_sheets(lesson_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Lesson, lesson_id):
        raise not_found("授業回")
    rows = db.query(models.AnswerSheet).filter(models.AnswerSheet.lesson_id == lesson_id).all()
    return [_answer_sheet_list_item(a, db) for a in rows]


@router.post("/lessons/{lesson_id}/answer-sheets", response_model=list[schemas.AnswerSheetListItem])
def create_answer_sheets(
    lesson_id: int, body: schemas.CreateAnswerSheetsRequest, db: Session = Depends(get_db)
):
    if not db.get(models.Lesson, lesson_id):
        raise not_found("授業回")
    created = []
    for a in body.assignments:
        obj = models.AnswerSheet(
            student_id=a.student_id,
            lesson_id=lesson_id,
            worksheet_id=a.worksheet_id,
            status="empty",
            source="manual",
        )
        db.add(obj)
        created.append(obj)
    db.commit()
    for obj in created:
        db.refresh(obj)
    return [_answer_sheet_list_item(a, db) for a in created]
