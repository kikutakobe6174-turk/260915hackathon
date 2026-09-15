from collections import defaultdict

from sqlalchemy.orm import Session

from app import models, schemas

# coverageの必要数・multiplierの定義はコード上に仕様が明文化されていないため、
# 「テストの出題傾向1件=必要な問題1問」「multiplierは将来調整できるよう1箇所に集約した固定値」
# という合理的な解釈で実装している。仕様確定時はここを調整する。
COVERAGE_MULTIPLIER = 1


def missing_return_unit_ids(db: Session, unit_ids: list[int]) -> list[int]:
    if not unit_ids:
        return []
    reviewed_return_unit_ids = {
        row.unit_id
        for row in db.query(models.Problem.unit_id)
        .filter(
            models.Problem.unit_id.in_(unit_ids),
            models.Problem.is_return.is_(True),
            models.Problem.status == "reviewed",
        )
        .distinct()
        .all()
    }
    return [uid for uid in unit_ids if uid not in reviewed_return_unit_ids]


def compute_coverage(db: Session, test_id: int) -> schemas.CoverageOut:
    trend_items = (
        db.query(models.TrendItem)
        .filter(models.TrendItem.test_id == test_id, models.TrendItem.unit_id.isnot(None))
        .all()
    )

    required: dict[tuple[int, int, int], int] = defaultdict(int)
    for item in trend_items:
        required[(item.unit_id, item.format_id, item.difficulty)] += 1

    unit_ids = sorted({key[0] for key in required})
    problems = (
        db.query(models.Problem).filter(models.Problem.unit_id.in_(unit_ids)).all()
        if unit_ids
        else []
    )
    reviewed_count: dict[tuple[int, int, int], int] = defaultdict(int)
    draft_count: dict[tuple[int, int, int], int] = defaultdict(int)
    for p in problems:
        key = (p.unit_id, p.format_id, p.difficulty)
        if p.status == "reviewed":
            reviewed_count[key] += 1
        else:
            draft_count[key] += 1

    cells = [
        schemas.CoverageCell(
            unit_id=unit_id,
            format_id=format_id,
            difficulty=difficulty,
            required=count * COVERAGE_MULTIPLIER,
            reviewed=reviewed_count.get((unit_id, format_id, difficulty), 0),
            draft=draft_count.get((unit_id, format_id, difficulty), 0),
        )
        for (unit_id, format_id, difficulty), count in sorted(required.items())
    ]

    return schemas.CoverageOut(
        multiplier=COVERAGE_MULTIPLIER,
        cells=cells,
        return_missing_unit_ids=missing_return_unit_ids(db, unit_ids),
    )


def compute_stats(
    db: Session, test_id: int | None, round_: int | None, level: str | None
) -> schemas.ProblemStatsOut:
    q = (
        db.query(models.Attempt, models.WorksheetItem, models.AnswerSheet, models.Lesson)
        .join(models.WorksheetItem, models.Attempt.worksheet_item_id == models.WorksheetItem.id)
        .join(models.AnswerSheet, models.Attempt.answer_sheet_id == models.AnswerSheet.id)
        .join(models.Lesson, models.AnswerSheet.lesson_id == models.Lesson.id)
    )
    if test_id is not None:
        q = q.join(models.Worksheet, models.WorksheetItem.worksheet_id == models.Worksheet.id).filter(
            models.Worksheet.test_id == test_id
        )
    if round_ is not None:
        q = q.filter(models.Lesson.round == round_)
    if level is not None:
        q = q.join(models.Student, models.AnswerSheet.student_id == models.Student.id).filter(
            models.Student.level == level
        )

    rows = q.all()

    by_problem: dict[int, list] = defaultdict(list)
    for attempt, ws_item, _answer_sheet, lesson in rows:
        by_problem[ws_item.problem_id].append((attempt, lesson))

    items = []
    for problem_id, rows_for_problem in by_problem.items():
        attempts = len(rows_for_problem)
        correct_no_hint = sum(1 for a, _ in rows_for_problem if a.is_correct and a.hint_step == 0)
        correct_by_hint: dict[str, int] = defaultdict(int)
        correct_by_round: dict[str, int] = defaultdict(int)
        wrong_after_hint3 = 0
        for a, lesson in rows_for_problem:
            if a.is_correct and a.hint_step in (1, 2, 3):
                correct_by_hint[str(a.hint_step)] += 1
            if a.hint_step == 3 and not a.is_correct:
                wrong_after_hint3 += 1
            if a.is_correct:
                correct_by_round[str(lesson.round)] += 1

        accuracy = (sum(1 for a, _ in rows_for_problem if a.is_correct) / attempts) if attempts else 0
        flags = []
        if attempts >= 3 and accuracy < 0.5:
            flags.append("low_accuracy")
        if wrong_after_hint3 >= 2:
            flags.append("needs_review")

        items.append(
            schemas.ProblemStatsItem(
                problem_id=problem_id,
                attempts=attempts,
                correct_no_hint=correct_no_hint,
                correct_by_hint=dict(correct_by_hint),
                wrong_after_hint3=wrong_after_hint3,
                correct_by_round=dict(correct_by_round),
                flags=flags,
            )
        )

    items.sort(key=lambda i: i.problem_id)
    return schemas.ProblemStatsOut(items=items)
