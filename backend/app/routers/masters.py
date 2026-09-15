from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import not_found

router = APIRouter(tags=["masters"])


# ---- schools ----


@router.get("/schools", response_model=list[schemas.School])
def list_schools(db: Session = Depends(get_db)):
    return db.query(models.School).order_by(models.School.id).all()


@router.post("/schools", response_model=schemas.School)
def create_school(body: schemas.SchoolCreate, db: Session = Depends(get_db)):
    obj = models.School(name=body.name)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/schools/{school_id}", response_model=schemas.School)
def update_school(school_id: int, body: schemas.SchoolCreate, db: Session = Depends(get_db)):
    obj = db.get(models.School, school_id)
    if not obj:
        raise not_found("学校")
    obj.name = body.name
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/schools/{school_id}", status_code=204)
def delete_school(school_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.School, school_id)
    if obj:
        db.delete(obj)
        db.commit()


# ---- textbooks ----


@router.get("/textbooks", response_model=list[schemas.Textbook])
def list_textbooks(db: Session = Depends(get_db)):
    return db.query(models.Textbook).order_by(models.Textbook.id).all()


@router.post("/textbooks", response_model=schemas.Textbook)
def create_textbook(body: schemas.TextbookCreate, db: Session = Depends(get_db)):
    obj = models.Textbook(publisher=body.publisher, title=body.title, subject=body.subject)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/textbooks/{textbook_id}", response_model=schemas.Textbook)
def update_textbook(textbook_id: int, body: schemas.TextbookCreate, db: Session = Depends(get_db)):
    obj = db.get(models.Textbook, textbook_id)
    if not obj:
        raise not_found("教科書")
    obj.publisher, obj.title, obj.subject = body.publisher, body.title, body.subject
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/textbooks/{textbook_id}", status_code=204)
def delete_textbook(textbook_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Textbook, textbook_id)
    if obj:
        db.delete(obj)
        db.commit()


# ---- formats ----


@router.get("/formats", response_model=list[schemas.Format])
def list_formats(db: Session = Depends(get_db)):
    return db.query(models.Format).order_by(models.Format.id).all()


@router.post("/formats", response_model=schemas.Format)
def create_format(body: schemas.FormatCreate, db: Session = Depends(get_db)):
    obj = models.Format(name=body.name)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/formats/{format_id}", response_model=schemas.Format)
def update_format(format_id: int, body: schemas.FormatCreate, db: Session = Depends(get_db)):
    obj = db.get(models.Format, format_id)
    if not obj:
        raise not_found("形式")
    obj.name = body.name
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/formats/{format_id}", status_code=204)
def delete_format(format_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Format, format_id)
    if obj:
        db.delete(obj)
        db.commit()


# ---- units (textbooks配下) ----


@router.get("/textbooks/{textbook_id}/units", response_model=list[schemas.Unit])
def list_units(textbook_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Unit)
        .filter(models.Unit.textbook_id == textbook_id)
        .order_by(models.Unit.order_no)
        .all()
    )


@router.post("/textbooks/{textbook_id}/units", response_model=schemas.Unit)
def create_unit(textbook_id: int, body: schemas.UnitCreateRequest, db: Session = Depends(get_db)):
    obj = models.Unit(textbook_id=textbook_id, name=body.name, order_no=body.order_no)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/units/{unit_id}", response_model=schemas.Unit)
def update_unit(unit_id: int, body: schemas.UnitUpdateRequest, db: Session = Depends(get_db)):
    obj = db.get(models.Unit, unit_id)
    if not obj:
        raise not_found("単元")
    obj.name, obj.order_no = body.name, body.order_no
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/units/{unit_id}", status_code=204)
def delete_unit(unit_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Unit, unit_id)
    if obj:
        db.delete(obj)
        db.commit()


@router.post("/textbooks/{textbook_id}/units/import", response_model=schemas.ImportResult)
def import_units(textbook_id: int, body: schemas.UnitImportRequest, db: Session = Depends(get_db)):
    created = 0
    errors: list[schemas.ImportRowError] = []
    for i, row in enumerate(body.rows):
        try:
            if not row.name.strip():
                raise ValueError("名称が空です")
            db.add(models.Unit(textbook_id=textbook_id, name=row.name, order_no=row.order_no))
            created += 1
        except ValueError as err:
            errors.append(schemas.ImportRowError(row=i + 1, message=str(err)))
    db.commit()
    return schemas.ImportResult(created=created, errors=errors)
