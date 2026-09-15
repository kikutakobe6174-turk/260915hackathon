from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import ApiException, not_found

router = APIRouter(tags=["worksheets"])


def _worksheet_out(w: models.Worksheet, db: Session) -> schemas.WorksheetOut:
    items = (
        db.query(models.WorksheetItem)
        .filter(models.WorksheetItem.worksheet_id == w.id)
        .order_by(models.WorksheetItem.sort_order)
        .all()
    )
    return schemas.WorksheetOut(
        id=w.id,
        test_id=w.test_id,
        level=w.level,
        version=w.version,
        printed_at=w.printed_at,
        locked=w.locked,
        items=[
            schemas.WorksheetItemOut(
                id=i.id,
                item_no=i.item_no,
                sort_order=i.sort_order,
                problem_id=i.problem_id,
                is_return=i.is_return,
                parent_item_id=i.parent_item_id,
            )
            for i in items
        ],
    )


def _build_items(worksheet_id: int, items_in: list[schemas.WorksheetItemIn], db: Session):
    created: list[models.WorksheetItem] = []
    normal_no = 0
    return_no = 0
    for idx, item in enumerate(items_in):
        if item.is_return:
            return_no += 1
            item_no = f"R-{return_no}"
        else:
            normal_no += 1
            item_no = str(normal_no)
        obj = models.WorksheetItem(
            worksheet_id=worksheet_id,
            item_no=item_no,
            sort_order=idx,
            problem_id=item.problem_id,
            is_return=item.is_return,
        )
        db.add(obj)
        created.append(obj)
    db.flush()
    for idx, item in enumerate(items_in):
        if item.parent_index is not None:
            created[idx].parent_item_id = created[item.parent_index].id
    db.flush()


@router.get("/tests/{test_id}/worksheets", response_model=list[schemas.WorksheetOut])
def list_worksheets(test_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.Worksheet).filter(models.Worksheet.test_id == test_id).order_by(
        models.Worksheet.id
    ).all()
    return [_worksheet_out(w, db) for w in rows]


@router.post("/tests/{test_id}/worksheets", response_model=schemas.WorksheetOut)
def create_worksheet(test_id: int, body: schemas.WorksheetCreateRequest, db: Session = Depends(get_db)):
    if not db.get(models.Test, test_id):
        raise not_found("テスト")
    w = models.Worksheet(test_id=test_id, level=body.level, version=1, locked=False)
    db.add(w)
    db.flush()
    _build_items(w.id, body.items, db)
    db.commit()
    db.refresh(w)
    return _worksheet_out(w, db)


@router.get("/worksheets/{worksheet_id}", response_model=schemas.WorksheetOut)
def get_worksheet(worksheet_id: int, db: Session = Depends(get_db)):
    w = db.get(models.Worksheet, worksheet_id)
    if not w:
        raise not_found("冊子")
    return _worksheet_out(w, db)


@router.put("/worksheets/{worksheet_id}", response_model=schemas.WorksheetOut)
def update_worksheet(worksheet_id: int, body: schemas.WorksheetCreateRequest, db: Session = Depends(get_db)):
    w = db.get(models.Worksheet, worksheet_id)
    if not w:
        raise not_found("冊子")
    if body.level != w.level:
        raise ApiException(422, "LEVEL_IMMUTABLE", "レベルは既存冊子から変更できません")

    existing_item_ids = [
        row.id
        for row in db.query(models.WorksheetItem.id)
        .filter(models.WorksheetItem.worksheet_id == worksheet_id)
        .all()
    ]
    has_attempts = (
        bool(existing_item_ids)
        and db.query(models.Attempt)
        .filter(models.Attempt.worksheet_item_id.in_(existing_item_ids))
        .count()
        > 0
    )
    if has_attempts:
        raise ApiException(
            409,
            "WORKSHEET_HAS_ATTEMPTS",
            "解答記録のある冊子は編集できません。新しいバージョンを作成してください。",
        )

    db.query(models.WorksheetItem).filter(models.WorksheetItem.worksheet_id == worksheet_id).delete()
    db.flush()
    _build_items(worksheet_id, body.items, db)
    db.commit()
    db.refresh(w)
    return _worksheet_out(w, db)
