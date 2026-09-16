import { API_BASE_URL } from "./client";
import { ApiRequestError, type ApiError, type GenerationExportRequest, type PdfExportRequest } from "@/lib/types/api";

async function downloadFile(path: string, body: PdfExportRequest | GenerationExportRequest, fallbackName: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "PDF生成サーバーに接続できませんでした。");
  }
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      json?.error?.code ?? "PDF_EXPORT_FAILED",
      json?.error?.message ?? "PDFの生成に失敗しました。"
    );
  }
  const blob = await response.blob();
  const encodedFilename = response.headers.get("X-Filename");
  const filename = encodedFilename ? decodeURIComponent(encodedFilename) : fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export const downloadTestPdf = (testId: number, body: PdfExportRequest) =>
  downloadFile(`/tests/${testId}/pdf`, body, `test_${testId}.pdf`);

export const downloadTestWord = (testId: number, body: PdfExportRequest) =>
  downloadFile(`/tests/${testId}/word`, body, `test_${testId}.docx`);

export const downloadGenerationPdf = (jobId: number, body: GenerationExportRequest) =>
  downloadFile(`/llm/problem-batches/${jobId}/pdf`, body, `generated_${jobId}.pdf`);

export const downloadGenerationWord = (jobId: number, body: GenerationExportRequest) =>
  downloadFile(`/llm/problem-batches/${jobId}/word`, body, `generated_${jobId}.docx`);
