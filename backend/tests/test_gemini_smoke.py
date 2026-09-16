import base64
import os

import pytest
from dotenv import load_dotenv

from app.providers import GeminiProvider

load_dotenv()


@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="GEMINI_API_KEY が設定された場合だけ実通信する")
def test_real_gemini_image_smoke():
    # 1x1 PNG。通信・認証・画像入力・構造化出力の経路確認用であり、内容精度テストではない。
    image = base64.b64encode(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")).decode()
    provider = GeminiProvider()
    import asyncio
    result = asyncio.run(provider._request(
        [{"text": "画像を受け取れたらokをtrueで返してください。"}, {"inlineData": {"mimeType": "image/png", "data": image}}],
        {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
    ))
    assert result == {"ok": True}


def _single_page_pdf(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 14 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(pdf)


@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="GEMINI_API_KEY が設定された場合だけ実通信する")
def test_real_gemini_pdf_analysis_smoke():
    pdf = _single_page_pdf("High School Mathematics I Test - Question 1 (5 points): Expand (x+2)(x+3). Total: 5 points.")
    provider = GeminiProvider()
    import asyncio
    result = asyncio.run(provider.analyze_test(
        base64.b64encode(pdf).decode(),
        "application/pdf",
        [{"id": 101, "name": "数と式"}],
        [{"id": 1, "name": "計算"}],
    ))
    assert result.total_points == 5
    assert len(result.items) == 1
    assert result.items[0].unit_id == 101
    assert result.items[0].format_id == 1
