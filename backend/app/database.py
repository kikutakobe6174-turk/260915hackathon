import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def database_path() -> Path:
    configured = os.getenv("DATABASE_PATH")
    if configured:
        return Path(configured).resolve()
    return (Path(__file__).resolve().parents[1] / "data" / "app.db").resolve()


@contextmanager
def connect():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, login_id TEXT UNIQUE, password TEXT, name TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS textbooks(id INTEGER PRIMARY KEY, publisher TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY, textbook_id INTEGER NOT NULL, name TEXT NOT NULL, order_no INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS formats(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tests(id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL, textbook_id INTEGER NOT NULL, year INTEGER NOT NULL, grade TEXT NOT NULL, term TEXT NOT NULL, kind TEXT NOT NULL, image_discarded_at TEXT, unit_ids_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS llm_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, parent_job_id INTEGER, test_id INTEGER, user_id INTEGER NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS trend_draft_items(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, question_no TEXT NOT NULL, unit_id INTEGER NOT NULL, format_id INTEGER NOT NULL, points INTEGER NOT NULL, difficulty INTEGER NOT NULL, confidence REAL NOT NULL);
CREATE TABLE IF NOT EXISTS trends(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, unit_id INTEGER NOT NULL, format_id INTEGER NOT NULL, question_no TEXT NOT NULL, points INTEGER NOT NULL, difficulty INTEGER NOT NULL, confidence REAL, source TEXT NOT NULL, llm_job_id INTEGER, reviewed INTEGER NOT NULL DEFAULT 0, reviewed_by INTEGER, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS generated_drafts(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, unit_id INTEGER NOT NULL, format_id INTEGER NOT NULL, difficulty INTEGER NOT NULL, body TEXT NOT NULL, answer TEXT NOT NULL, explanation TEXT NOT NULL, hints_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS problems(id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id INTEGER NOT NULL, format_id INTEGER NOT NULL, difficulty INTEGER NOT NULL, body TEXT NOT NULL, answer TEXT NOT NULL, explanation TEXT, is_return INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT 'manual', llm_job_id INTEGER, analysis_job_id INTEGER, reviewed_by INTEGER, reviewed_at TEXT, hints_json TEXT NOT NULL, prerequisite_unit_ids_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS unit_prerequisites(unit_id INTEGER NOT NULL, prerequisite_unit_id INTEGER NOT NULL, reason TEXT, teacher_note TEXT, source TEXT NOT NULL DEFAULT 'manual', llm_job_id INTEGER, confirmed INTEGER NOT NULL DEFAULT 0, reviewed_by INTEGER, reviewed_at TEXT, PRIMARY KEY(unit_id, prerequisite_unit_id));
CREATE TABLE IF NOT EXISTS worksheets(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, level TEXT NOT NULL, version INTEGER NOT NULL, printed_at TEXT, locked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS worksheet_items(id INTEGER PRIMARY KEY AUTOINCREMENT, worksheet_id INTEGER NOT NULL, item_no TEXT NOT NULL, sort_order INTEGER NOT NULL, problem_id INTEGER NOT NULL, is_return INTEGER NOT NULL DEFAULT 0, parent_item_id INTEGER);
"""


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(problems)")}
        if "analysis_job_id" not in columns:
            conn.execute("ALTER TABLE problems ADD COLUMN analysis_job_id INTEGER")
        # 元テストの小問配点。問題バンク保存時に確定させ、以降の再解析に左右されないようにする。
        if "points" not in columns:
            conn.execute("ALTER TABLE problems ADD COLUMN points INTEGER")
        trend_columns = {row[1] for row in conn.execute("PRAGMA table_info(trends)")}
        if "confidence" not in trend_columns:
            conn.execute("ALTER TABLE trends ADD COLUMN confidence REAL")
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO users(id,login_id,password,name,role) VALUES(?,?,?,?,?)",
                [(1, "operator1", "password123", "運営担当", "operator"), (2, "teacher1", "password123", "担当講師", "teacher")],
            )
        if conn.execute("SELECT COUNT(*) FROM schools").fetchone()[0] == 0:
            conn.execute("INSERT INTO schools(id,name) VALUES(1,'ひかり中学校')")
            conn.execute("INSERT INTO textbooks(id,publisher,title,subject) VALUES(1,'啓林館','未来へひろがる数学2','数学')")
            conn.executemany(
                "INSERT INTO units(id,textbook_id,name,order_no) VALUES(?,?,?,?)",
                [(1, 1, "式の計算", 1), (2, 1, "連立方程式", 2), (3, 1, "一次関数", 3), (4, 1, "図形の性質", 4)],
            )
            conn.executemany("INSERT INTO formats(id,name) VALUES(?,?)", [(1, "計算"), (2, "選択"), (3, "記述"), (4, "証明")])
            conn.execute(
                "INSERT INTO tests(id,school_id,textbook_id,year,grade,term,kind,unit_ids_json) VALUES(1,1,1,2026,'中2','2学期中間','past',?)",
                (json.dumps([1, 2, 3]),),
            )
        # 実画像フローをすぐ確認できる高校数学Iのseed。既存DBへも不足分だけ追加する。
        conn.execute("INSERT OR IGNORE INTO schools(id,name) VALUES(2,'ひかり高等学校')")
        conn.execute("INSERT OR IGNORE INTO textbooks(id,publisher,title,subject) VALUES(2,'数研出版','高等学校 数学I','数学')")
        conn.executemany(
            "INSERT OR IGNORE INTO units(id,textbook_id,name,order_no) VALUES(?,?,?,?)",
            [
                (101, 2, "数と式", 1),
                (102, 2, "集合と命題", 2),
                (103, 2, "二次関数", 3),
                (104, 2, "図形と計量", 4),
                (105, 2, "データの分析", 5),
            ],
        )
        conn.execute(
            "INSERT OR IGNORE INTO tests(id,school_id,textbook_id,year,grade,term,kind,unit_ids_json) VALUES(2,2,2,2026,'高1','1学期中間','past',?)",
            (json.dumps([101, 102, 103, 104, 105]),),
        )
        # 指数・対数・微分を含む高校数学IIの過去問解析用seed。
        conn.execute("INSERT OR IGNORE INTO textbooks(id,publisher,title,subject) VALUES(3,'数研出版','高等学校 数学II','数学')")
        conn.executemany(
            "INSERT OR IGNORE INTO units(id,textbook_id,name,order_no) VALUES(?,?,?,?)",
            [
                (201, 3, "式と証明・高次方程式", 1),
                (202, 3, "図形と方程式", 2),
                (203, 3, "三角関数", 3),
                (204, 3, "指数関数・対数関数", 4),
                (205, 3, "微分法", 5),
                (206, 3, "積分法", 6),
            ],
        )
        conn.execute(
            "INSERT OR IGNORE INTO tests(id,school_id,textbook_id,year,grade,term,kind,unit_ids_json) VALUES(3,2,3,2026,'高2','後期中間','past',?)",
            (json.dumps([204, 205]),),
        )
        conn.execute("UPDATE tests SET term='2学期中間' WHERE id=3 AND term='後期中間'")
