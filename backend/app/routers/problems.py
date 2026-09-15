from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import ApiException, not_found
from app.services.coverage import compute_coverage, compute_stats, missing_return_unit_ids

router = APIRouter(tags=["problems"])


def _problem_out(p: models.Problem, db: Session) -> schemas.ProblemOut:
    unit = db.get(models.Unit, p.unit_id)
    fmt = db.get(models.Format, p.format_id)
    prereq_unit_ids = [link.unit_id for link in p.prerequisite_links]
    hints = sorted(p.hints, key=lambda h: h.step)
    return schemas.ProblemOut(
        id=p.id,
        unit_id=p.unit_id,
        unit_name=unit.name if unit else "",
        format_id=p.format_id,
        format_name=fmt.name if fmt else "",
        difficulty=p.difficulty,
        body=p.body,
        answer=p.answer,
        explanation=p.explanation,
        is_return=p.is_return,
        status=p.status,
        source=p.source,
        llm_job_id=p.llm_job_id,
        reviewed_by=p.reviewed_by,
        reviewed_at=p.reviewed_at,
        hints=[schemas.HintOut(step=h.step, body=h.body) for h in hints],
        prerequisite_unit_ids=prereq_unit_ids,
        prerequisites_missing_return=missing_return_unit_ids(db, prereq_unit_ids),
    )


@router.get("/problems", response_model=list[schemas.ProblemOut])
def list_problems(
    unit_id: int | None = None,
    format_id: int | None = None,
    difficulty: int | None = None,
    status: str | None = None,
    is_return: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Problem)
    if unit_id is not None:
        q = q.filter(models.Problem.unit_id == unit_id)
    if format_id is not None:
        q = q.filter(models.Problem.format_id == format_id)
    if difficulty is not None:
        q = q.filter(models.Problem.difficulty == difficulty)
    if status is not None:
        q = q.filter(models.Problem.status == status)
    if is_return is not None:
        q = q.filter(models.Problem.is_return == is_return)
    return [_problem_out(p, db) for p in q.order_by(models.Problem.id).all()]


def _apply_problem_body(p: models.Problem, body: schemas.ProblemInRequest, db: Session):
    p.unit_id = body.unit_id
    p.format_id = body.format_id
    p.difficulty = body.difficulty
    p.body = body.body
    p.answer = body.answer
    p.explanation = body.explanation
    p.is_return = body.is_return
    p.source = body.source
    p.llm_job_id = body.llm_job_id

    p.hints.clear()
    for step, text in zip((1, 2, 3), body.hints):
        p.hints.append(models.Hint(step=step, body=text))

    p.prerequisite_links.clear()
    for uid in body.prerequisite_unit_ids:
        p.prerequisite_links.append(models.ProblemPrerequisite(unit_id=uid))


@router.post("/problems", response_model=schemas.ProblemOut)
def create_problem(body: schemas.ProblemInRequest, db: Session = Depends(get_db)):
    if len(body.hints) != 3 or any(not h.strip() for h in body.hints):
        raise ApiException(422, "INVALID_HINTS", "ヒントは3段すべて入力してください")
    p = models.Problem(status="draft")
    _apply_problem_body(p, body, db)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _problem_out(p, db)


@router.get("/problems/stats", response_model=schemas.ProblemStatsOut)
def problem_stats(
    test_id: int | None = None,
    round: int | None = None,
    level: str | None = None,
    db: Session = Depends(get_db),
):
    return compute_stats(db, test_id, round, level)


@router.get("/problems/{problem_id}", response_model=schemas.ProblemOut)
def get_problem(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Problem, problem_id)
    if not p:
        raise not_found("問題")
    return _problem_out(p, db)


@router.put("/problems/{problem_id}", response_model=schemas.ProblemOut)
def update_problem(problem_id: int, body: schemas.ProblemInRequest, db: Session = Depends(get_db)):
    p = db.get(models.Problem, problem_id)
    if not p:
        raise not_found("問題")
    if len(body.hints) != 3 or any(not h.strip() for h in body.hints):
        raise ApiException(422, "INVALID_HINTS", "ヒントは3段すべて入力してください")
    _apply_problem_body(p, body, db)
    db.commit()
    db.refresh(p)
    return _problem_out(p, db)


@router.post("/problems/{problem_id}/review", response_model=schemas.ProblemOut)
def review_problem(problem_id: int, body: schemas.ProblemReviewRequest, db: Session = Depends(get_db)):
    p = db.get(models.Problem, problem_id)
    if not p:
        raise not_found("問題")
    p.status = "reviewed"
    p.reviewed_by = body.user_id
    p.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _problem_out(p, db)


@router.get("/tests/{test_id}/coverage", response_model=schemas.CoverageOut)
def get_coverage(test_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Test, test_id):
        raise not_found("テスト")
    return compute_coverage(db, test_id)
