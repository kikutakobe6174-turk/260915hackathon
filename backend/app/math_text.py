import re


_COMMANDS = {
    "\\times": "×",
    "\\cdot": "・",
    "\\div": "÷",
    "\\leq": "≦",
    "\\le": "≦",
    "\\geq": "≧",
    "\\ge": "≧",
    "\\neq": "≠",
    "\\ne": "≠",
    "\\pm": "±",
    "\\pi": "π",
    "\\theta": "θ",
    "\\log": "log",
    "\\sqrt": "√",
    "\\left": "",
    "\\right": "",
}


def normalize_math_text(text: str) -> str:
    """Convert the small LaTeX subset returned by Gemini into printable text."""
    text = text.replace("équation（方程式）", "方程式").replace("equation（方程式）", "方程式")
    text = text.replace("\\(", "").replace("\\)", "").replace("$$", "").replace("$", "")
    text = re.sub(r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}", r"(\1)/(\2)", text)
    text = re.sub(r"\\begin\s*\{cases\}", "{ ", text)
    text = re.sub(r"\\end\s*\{cases\}", " }", text)
    text = text.replace("\\\\", "、")
    for source, replacement in _COMMANDS.items():
        text = text.replace(source, replacement)
    text = re.sub(r"\\text\s*\{([^{}]+)\}", r"\1", text)
    text = text.replace("\\{", "{").replace("\\}", "}")
    text = re.sub(r"\\([A-Za-z]+)", r"\1", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
