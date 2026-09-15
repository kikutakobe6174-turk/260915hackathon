from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import not_found

router = APIRouter(tags=["students"])


@router.get("/students", response_model=list[schemas.Student])
def list_students(
    school_id: int | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Student)
    if school_id is not None:
        q = q.filter(models.Student.school_id == school_id)
    if active is not None:
        q = q.filter(models.Student.active == active)
    return q.order_by(models.Student.id).all()


@router.post("/students", response_model=schemas.Student)
def create_student(body: schemas.StudentCreateRequest, db: Session = Depends(get_db)):
    obj = models.Student(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/students/{student_id}", response_model=schemas.Student)
def update_student(student_id: int, body: schemas.StudentUpdateRequest, db: Session = Depends(get_db)):
    obj = db.get(models.Student, student_id)
    if not obj:
        raise not_found("生徒")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/students/{student_id}", status_code=204)
def delete_student(student_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Student, student_id)
    if obj:
        db.delete(obj)
        db.commit()


@router.post("/students/import", response_model=schemas.ImportResult)
def import_students(body: schemas.StudentImportRequest, db: Session = Depends(get_db)):
    created = 0
    errors: list[schemas.ImportRowError] = []
    for i, row in enumerate(body.rows):
        school = db.query(models.School).filter(models.School.name == row.school_name).first()
        if not school:
            errors.append(schemas.ImportRowError(row=i + 1, message=f"学校「{row.school_name}」が見つかりません"))
            continue
        if not row.student_code.strip():
            errors.append(schemas.ImportRowError(row=i + 1, message="生徒コードが空です"))
            continue
        db.add(
            models.Student(
                student_code=row.student_code,
                school_id=school.id,
                grade=row.grade,
                level=row.level,
                active=True,
            )
        )
        created += 1
    db.commit()
    return schemas.ImportResult(created=created, errors=errors)
