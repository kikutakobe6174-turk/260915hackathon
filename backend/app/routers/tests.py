from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import not_found

router = APIRouter(tags=["tests"])


def _test_out(t: models.Test, db: Session) -> schemas.Test:
    unit_ids = [
        row.unit_id
        for row in db.query(models.TestUnit).filter(models.TestUnit.test_id == t.id).all()
    ]
    return schemas.Test(
        id=t.id,
        school_id=t.school_id,
        textbook_id=t.textbook_id,
        year=t.year,
        grade=t.grade,
        term=t.term,
        kind=t.kind,
        image_discarded_at=t.image_discarded_at,
        unit_ids=unit_ids,
    )


@router.get("/tests", response_model=list[schemas.Test])
def list_tests(school_id: int | None = None, kind: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Test)
    if school_id is not None:
        q = q.filter(models.Test.school_id == school_id)
    if kind is not None:
        q = q.filter(models.Test.kind == kind)
    return [_test_out(t, db) for t in q.order_by(models.Test.id).all()]


@router.post("/tests", response_model=schemas.Test)
def create_test(body: schemas.CreateTestRequest, db: Session = Depends(get_db)):
    obj = models.Test(
        school_id=body.school_id,
        textbook_id=body.textbook_id,
        year=body.year,
        grade=body.grade,
        term=body.term,
        kind=body.kind,
    )
    db.add(obj)
    db.flush()
    for unit_id in body.unit_ids:
        db.add(models.TestUnit(test_id=obj.id, unit_id=unit_id))
    db.commit()
    db.refresh(obj)
    return _test_out(obj, db)


@router.get("/tests/{test_id}", response_model=schemas.Test)
def get_test(test_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Test, test_id)
    if not obj:
        raise not_found("テスト")
    return _test_out(obj, db)


# ---- 出題傾向 ----


def _trend_item_out(item: models.TrendItem, db: Session) -> schemas.TrendItemOut:
    unit = db.get(models.Unit, item.unit_id) if item.unit_id else None
    fmt = db.get(models.Format, item.format_id)
    return schemas.TrendItemOut(
        id=item.id,
        test_id=item.test_id,
        unit_id=item.unit_id,
        unit_name=unit.name if unit else None,
        format_id=item.format_id,
        format_name=fmt.name if fmt else "",
        question_no=item.question_no,
        points=item.points,
        difficulty=item.difficulty,
        source=item.source,
        llm_job_id=item.llm_job_id,
        reviewed=item.reviewed,
        reviewed_by=item.reviewed_by,
        reviewed_at=item.reviewed_at,
    )


def _trend_summary(test_id: int, db: Session) -> list[schemas.UnitTrendSummary]:
    items = (
        db.query(models.TrendItem)
        .filter(models.TrendItem.test_id == test_id, models.TrendItem.reviewed.is_(True))
        .all()
    )
    total_points = sum(i.points for i in items) or 1
    by_unit: dict[int, list[models.TrendItem]] = {}
    for i in items:
        if i.unit_id is None:
            continue
        by_unit.setdefault(i.unit_id, []).append(i)
    summary = []
    for unit_id, rows in by_unit.items():
        unit = db.get(models.Unit, unit_id)
        summary.append(
            schemas.UnitTrendSummary(
                unit_id=unit_id,
                unit_name=unit.name if unit else "",
                question_count=len(rows),
                point_ratio=sum(r.points for r in rows) / total_points,
            )
        )
    summary.sort(key=lambda s: s.unit_id)
    return summary


@router.get("/tests/{test_id}/trends", response_model=schemas.TestTrendsOut)
def get_trends(test_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Test, test_id):
        raise not_found("テスト")
    items = db.query(models.TrendItem).filter(models.TrendItem.test_id == test_id).all()
    return schemas.TestTrendsOut(
        test_id=test_id,
        items=[_trend_item_out(i, db) for i in items],
        summary=_trend_summary(test_id, db),
    )


@router.put("/tests/{test_id}/trends", response_model=schemas.TestTrendsOut)
def put_trends(test_id: int, body: schemas.PutTrendsRequest, db: Session = Depends(get_db)):
    if not db.get(models.Test, test_id):
        raise not_found("テスト")
    # 洗い替え: 既存を全削除して入力内容で作り直す。「確認して保存」＝保存時点でreviewed扱い。
    db.query(models.TrendItem).filter(models.TrendItem.test_id == test_id).delete()
    now = datetime.utcnow()
    for item in body.items:
        db.add(
            models.TrendItem(
                test_id=test_id,
                unit_id=item.unit_id,
                format_id=item.format_id,
                question_no=item.question_no,
                points=item.points,
                difficulty=item.difficulty,
                source=item.source,
                llm_job_id=item.llm_job_id,
                reviewed=True,
                reviewed_by=body.user_id,
                reviewed_at=now,
            )
        )
    db.commit()
    items = db.query(models.TrendItem).filter(models.TrendItem.test_id == test_id).all()
    return schemas.TestTrendsOut(
        test_id=test_id,
        items=[_trend_item_out(i, db) for i in items],
        summary=_trend_summary(test_id, db),
    )


# ---- 前提単元 ----


def _prereq_out(p: models.Prerequisite, db: Session) -> schemas.PrerequisiteOut:
    prereq_unit = db.get(models.Unit, p.prerequisite_unit_id)
    return schemas.PrerequisiteOut(
        unit_id=p.unit_id,
        prerequisite_unit_id=p.prerequisite_unit_id,
        prerequisite_unit_name=prereq_unit.name if prereq_unit else "",
        reason=p.reason,
        teacher_note=p.teacher_note,
        source=p.source,
        llm_job_id=p.llm_job_id,
        confirmed=p.confirmed,
        reviewed_by=p.reviewed_by,
        reviewed_at=p.reviewed_at,
    )


@router.get("/tests/{test_id}/prerequisites", response_model=schemas.TestPrerequisitesOut)
def get_test_prerequisites(test_id: int, db: Session = Depends(get_db)):
    test = db.get(models.Test, test_id)
    if not test:
        raise not_found("テスト")
    unit_ids = [
        row.unit_id
        for row in db.query(models.TestUnit).filter(models.TestUnit.test_id == test_id).all()
    ]
    groups = []
    for unit_id in unit_ids:
        unit = db.get(models.Unit, unit_id)
        prereqs = db.query(models.Prerequisite).filter(models.Prerequisite.unit_id == unit_id).all()
        groups.append(
            schemas.UnitPrerequisiteGroup(
                unit_id=unit_id,
                unit_name=unit.name if unit else "",
                confirmed=bool(prereqs) and all(p.confirmed for p in prereqs),
                prerequisites=[_prereq_out(p, db) for p in prereqs],
            )
        )
    return schemas.TestPrerequisitesOut(test_id=test_id, units=groups)


@router.put("/units/{unit_id}/prerequisites", response_model=list[schemas.PrerequisiteOut])
def put_unit_prerequisites(
    unit_id: int, body: schemas.PutUnitPrerequisitesRequest, db: Session = Depends(get_db)
):
    if not db.get(models.Unit, unit_id):
        raise not_found("単元")
    db.query(models.Prerequisite).filter(models.Prerequisite.unit_id == unit_id).delete()
    for item in body.items:
        db.add(
            models.Prerequisite(
                unit_id=unit_id,
                prerequisite_unit_id=item.prerequisite_unit_id,
                reason=item.reason,
                source=item.source,
                llm_job_id=item.llm_job_id,
                confirmed=False,
            )
        )
    db.commit()
    rows = db.query(models.Prerequisite).filter(models.Prerequisite.unit_id == unit_id).all()
    return [_prereq_out(p, db) for p in rows]


@router.post(
    "/units/{unit_id}/prerequisites/{prerequisite_unit_id}/review",
    response_model=schemas.PrerequisiteOut,
)
def review_prerequisite(
    unit_id: int,
    prerequisite_unit_id: int,
    body: schemas.PrerequisiteReviewRequest,
    db: Session = Depends(get_db),
):
    row = db.get(models.Prerequisite, (unit_id, prerequisite_unit_id))
    if not row:
        raise not_found("前提単元")
    row.confirmed = body.confirmed
    if body.teacher_note is not None:
        row.teacher_note = body.teacher_note
    row.reviewed_by = body.user_id
    row.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _prereq_out(row, db)
