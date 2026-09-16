import io
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .math_text import normalize_math_text


FONT_DIR = Path("C:/Windows/Fonts")


def _register_fonts() -> tuple[str, str]:
    regular_candidates = [FONT_DIR / "BIZ-UDGothicR.ttc", FONT_DIR / "YuGothR.ttc", FONT_DIR / "msgothic.ttc"]
    bold_candidates = [FONT_DIR / "BIZ-UDGothicB.ttc", FONT_DIR / "YuGothB.ttc", FONT_DIR / "msgothic.ttc"]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if not regular or not bold:
        raise RuntimeError("日本語PDF用フォントが見つかりません。BIZ UDゴシックまたは游ゴシックをインストールしてください。")
    if "SchoolTestJP" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("SchoolTestJP", str(regular), subfontIndex=0))
        pdfmetrics.registerFont(TTFont("SchoolTestJP-Bold", str(bold), subfontIndex=0))
    return "SchoolTestJP", "SchoolTestJP-Bold"


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def _readable_math(text: str) -> str:
    escaped = _escape(normalize_math_text(text))
    escaped = re.sub(r"\^\{([^{}]+)\}", r"<super>\1</super>", escaped)
    escaped = re.sub(r"\^\(([^()]+)\)", r"<super>\1</super>", escaped)
    escaped = re.sub(r"\^([0-9]+)", r"<super>\1</super>", escaped)
    escaped = re.sub(r"_\{([^{}]+)\}", r"<sub>\1</sub>", escaped)
    escaped = re.sub(r"_([0-9]+)", r"<sub>\1</sub>", escaped)
    return escaped


def _distribute(total: int, count: int) -> list[int]:
    quotient, remainder = divmod(total, count)
    return [quotient + (1 if index < remainder else 0) for index in range(count)]


class PageCountCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, font_name: str, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._font_name = font_name

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for page_number, state in enumerate(self._saved_page_states, 1):
            self.__dict__.update(state)
            self.setFont(self._font_name, 8.5)
            self.drawCentredString(A4[0] / 2, 8 * mm, f"{page_number} / {page_count}")
            super().showPage()
        super().save()


def resolve_points(total_points: int, problems: list[dict], problem_points: list[int] | None, group_size: int):
    """Gemini解析の実配点があればそれを使い、無ければ従来どおり大問へ等分する。

    戻り値は (満点, 大問ごとの配点, 小問ごとの配点 or None)。
    """
    groups = [problems[index:index + group_size] for index in range(0, len(problems), group_size)]
    if problem_points and len(problem_points) == len(problems):
        major_points = [sum(problem_points[index:index + group_size]) for index in range(0, len(problem_points), group_size)]
        return sum(problem_points), major_points, list(problem_points)
    return total_points, _distribute(total_points, len(groups)), None


def _answer_flowables(problem: dict, answer_style, hint_style) -> list:
    """正答・解説・3段階ヒントを解答解説版の本文へ並べる。DBに保存済みの値だけを使う。"""
    flowables = [Paragraph(f"<b>正答</b>　{_readable_math(str(problem.get('answer') or '').strip())}", answer_style)]
    explanation = str(problem.get("explanation") or "").strip()
    if explanation:
        flowables.append(Paragraph(f"<b>解説</b>　{_readable_math(explanation)}", answer_style))
    hints = problem.get("hints")
    if hints is None and problem.get("hints_json"):
        hints = json.loads(problem["hints_json"])
    for step, hint in enumerate(hints or [], 1):
        text = hint["body"] if isinstance(hint, dict) else hint
        if str(text).strip():
            flowables.append(Paragraph(f"ヒント{step}　{_readable_math(str(text).strip())}", hint_style))
    return flowables


def build_test_pdf(*, school_name: str, grade: str, subject: str, title: str,
                   duration_minutes: int, total_points: int, problems: list[dict],
                   problem_points: list[int] | None = None, include_answers: bool = False) -> bytes:
    regular, bold = _register_fonts()
    group_size = 4
    total_points, major_points, per_problem_points = resolve_points(total_points, problems, problem_points, group_size)
    display_title = f"{title}　解答・解説" if include_answers else title
    output = io.BytesIO()
    page_width, page_height = A4
    doc = BaseDocTemplate(
        output,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=display_title,
        author=school_name,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")

    doc.addPageTemplates([PageTemplate(id="test", frames=[frame])])
    styles = getSampleStyleSheet()
    school_style = ParagraphStyle("school", parent=styles["Normal"], fontName=regular, fontSize=10.5, leading=15, alignment=TA_CENTER)
    title_style = ParagraphStyle("title", parent=styles["Normal"], fontName=bold, fontSize=15, leading=21, alignment=TA_CENTER, spaceAfter=4 * mm)
    info_style = ParagraphStyle("info", parent=styles["Normal"], fontName=regular, fontSize=9.5, leading=14)
    major_style = ParagraphStyle("major", parent=styles["Normal"], fontName=bold, fontSize=11, leading=17, spaceAfter=3 * mm)
    problem_style = ParagraphStyle("problem", parent=styles["Normal"], fontName=regular, fontSize=10.5, leading=18, alignment=TA_LEFT)
    answer_style = ParagraphStyle("answer", parent=styles["Normal"], fontName=regular, fontSize=10, leading=16, alignment=TA_LEFT, leftIndent=8 * mm, spaceBefore=1 * mm)
    hint_style = ParagraphStyle("hint", parent=styles["Normal"], fontName=regular, fontSize=9, leading=14, alignment=TA_LEFT, leftIndent=12 * mm, textColor=colors.HexColor("#334155"))

    story = [
        Paragraph(_escape(school_name), school_style),
        Paragraph(f"{_escape(grade)}　{_escape(subject)}<br/>{_escape(display_title)}", title_style),
    ]
    metadata_rows = [
        [Paragraph("実施日：____年__月__日", info_style), Paragraph(f"制限時間：{duration_minutes}分", info_style), Paragraph(f"満点：{total_points}点", info_style)],
    ]
    if not include_answers:
        # 解答・解説版は配布用ではないため、氏名欄・得点欄は入れない。
        metadata_rows.append(
            [Paragraph(f"{grade.replace('高', '')}年 ____組　____番", info_style), Paragraph("氏名 ________________________________", info_style), Paragraph(f"得点 ______ / {total_points}", info_style)]
        )
    metadata = Table(metadata_rows, colWidths=[doc.width * 0.30, doc.width * 0.46, doc.width * 0.24])
    metadata.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), regular),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.extend([metadata, HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceBefore=2 * mm, spaceAfter=5 * mm)])

    groups = [problems[index:index + group_size] for index in range(0, len(problems), group_size)]
    for major_index, group in enumerate(groups, 1):
        if major_index > 1 and not include_answers:
            story.append(PageBreak())
        heading = f"第{major_index}問" if include_answers else f"第{major_index}問　次の問いに答えなさい。　　　　　　　　　"
        major = Paragraph(_escape(f"{heading}〔{major_points[major_index - 1]}点〕"), major_style)
        problem_flowables = []
        for sub_index, problem in enumerate(group, 1):
            body = _readable_math(problem["body"].strip())
            if per_problem_points is not None:
                body += _escape(f"　（{per_problem_points[(major_index - 1) * group_size + sub_index - 1]}点）")
            problem_flowables.append(Paragraph(f"({sub_index})　{body}", problem_style))
            if include_answers:
                problem_flowables.extend(_answer_flowables(problem, answer_style, hint_style))
                problem_flowables.append(Spacer(1, 4 * mm))
            else:
                problem_flowables.append(Spacer(1, 17 * mm))
        story.append(KeepTogether([major, *problem_flowables]))
        story.append(Spacer(1, 2 * mm))

    doc.build(story, canvasmaker=lambda *args, **kwargs: PageCountCanvas(*args, font_name=regular, **kwargs))
    return output.getvalue()
