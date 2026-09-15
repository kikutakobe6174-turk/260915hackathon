"""デモデータ投入スクリプト。 `python -m app.seed` で実行する。"""

from passlib.context import CryptContext

from app import models
from app.db import Base, SessionLocal, engine

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_OPERATOR = {"login_id": "operator1", "password": "password123", "name": "運営 太郎"}
DEMO_TEACHER = {"login_id": "teacher1", "password": "password123", "name": "先生 花子"}


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            print("既にデータが存在するため、シードをスキップしました。")
            return

        db.add(models.User(login_id=DEMO_OPERATOR["login_id"], name=DEMO_OPERATOR["name"], role="operator", password_hash=pwd_context.hash(DEMO_OPERATOR["password"])))
        db.add(models.User(login_id=DEMO_TEACHER["login_id"], name=DEMO_TEACHER["name"], role="teacher", password_hash=pwd_context.hash(DEMO_TEACHER["password"])))

        school = models.School(name="第一中学校")
        db.add(school)
        db.flush()

        textbook = models.Textbook(publisher="サンプル出版", title="中学数学 標準", subject="数学")
        db.add(textbook)
        db.flush()

        unit_names = ["正負の数", "文字式", "方程式", "関数", "図形の性質", "確率"]
        units = []
        for i, name in enumerate(unit_names):
            u = models.Unit(textbook_id=textbook.id, name=name, order_no=i + 1)
            db.add(u)
            units.append(u)
        db.flush()

        format_names = ["計算問題", "文章題", "証明問題", "作図"]
        formats = []
        for name in format_names:
            f = models.Format(name=name)
            db.add(f)
            formats.append(f)
        db.flush()

        student = models.Student(
            student_code="S0001", school_id=school.id, grade="中2", level="B", active=True
        )
        db.add(student)

        test = models.Test(
            school_id=school.id,
            textbook_id=textbook.id,
            year=2025,
            grade="中2",
            term="1学期期末",
            kind="past",
        )
        db.add(test)
        db.flush()
        for u in units[:3]:
            db.add(models.TestUnit(test_id=test.id, unit_id=u.id))

        # 「傾向をもとに作問」機能をすぐ試せるよう、出題傾向のサンプルも投入する。
        sample_trends = [
            (units[0], formats[0], "1(1)", 5, 1),
            (units[0], formats[0], "1(2)", 5, 2),
            (units[1], formats[1], "2", 10, 2),
            (units[1], formats[0], "3(1)", 5, 1),
            (units[2], formats[1], "4", 15, 3),
        ]
        for unit, fmt, question_no, points, difficulty in sample_trends:
            db.add(
                models.TrendItem(
                    test_id=test.id,
                    unit_id=unit.id,
                    format_id=fmt.id,
                    question_no=question_no,
                    points=points,
                    difficulty=difficulty,
                    source="manual",
                    reviewed=True,
                )
            )

        db.commit()
        print("シードデータを投入しました。")
        print(f"  operator: login_id={DEMO_OPERATOR['login_id']} password={DEMO_OPERATOR['password']}")
        print(f"  teacher : login_id={DEMO_TEACHER['login_id']} password={DEMO_TEACHER['password']}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
