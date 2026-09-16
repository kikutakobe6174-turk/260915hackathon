import io
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


def build_test_pdf(*, school_name: str, grade: str, subject: str, title: str,
                   duration_minutes: int, total_points: int, problems: list[dict],
                   problem_points: list[int] | None = None) -> bytes:
    regular, bold = _register_fonts()
    group_size = 4
    total_points, major_points, per_problem_points = resolve_points(total_points, problems, problem_points, group_size)
    output = io.BytesIO()
    page_width, page_height = A4
    doc = BaseDocTemplate(
        output,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=title,
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

    story = [
        Paragraph(_escape(school_name), school_style),
        Paragraph(f"{_escape(grade)}　{_escape(subject)}<br/>{_escape(title)}", title_style),
    ]
    metadata = Table(
        [
            [Paragraph("実施日：____年__月__日", info_style), Paragraph(f"制限時間：{duration_minutes}分", info_style), Paragraph(f"満点：{total_points}点", info_style)],
            [Paragraph(f"{grade.replace('高', '')}年 ____組　____番", info_style), Paragraph("氏名 ________________________________", info_style), Paragraph(f"得点 ______ / {total_points}", info_style)],
        ],
        colWidths=[doc.width * 0.30, doc.width * 0.46, doc.width * 0.24],
    )
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
        if major_index > 1:
            story.append(PageBreak())
        major = Paragraph(_escape(f"第{major_index}問　次の問いに答えなさい。　　　　　　　　　〔{major_points[major_index - 1]}点〕"), major_style)
        problem_flowables = []
        for sub_index, problem in enumerate(group, 1):
            body = _readable_math(problem["body"].strip())
            if per_problem_points is not None:
                body += _escape(f"　（{per_problem_points[(major_index - 1) * group_size + sub_index - 1]}点）")
            problem_flowables.extend([
                Paragraph(f"({sub_index})　{body}", problem_style),
                Spacer(1, 17 * mm),
            ])
        story.append(KeepTogether([major, *problem_flowables]))
        story.append(Spacer(1, 2 * mm))

    doc.build(story, canvasmaker=lambda *args, **kwargs: PageCountCanvas(*args, font_name=regular, **kwargs))
    return output.getvalue()
