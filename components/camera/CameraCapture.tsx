"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, Upload, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

type CameraErrorKind = "NotAllowedError" | "NotFoundError" | "unsupported" | "other";

const ERROR_MESSAGES: Record<CameraErrorKind, string> = {
  NotAllowedError: "カメラの使用が許可されていません。ブラウザの設定でカメラへのアクセスを許可してください。",
  NotFoundError: "カメラが見つかりませんでした。",
  unsupported: "このブラウザ・接続ではカメラ機能が利用できません（HTTPSまたはlocalhostが必要です）。",
  other: "カメラを起動できませんでした。",
};

function drawToJpegBase64(source: CanvasImageSource, width: number, height: number) {
  let w = width;
  let h = height;
  const longEdge = Math.max(w, h);
  if (longEdge > MAX_EDGE) {
    const scale = MAX_EDGE / longEdge;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context取得に失敗しました");
  ctx.drawImage(source, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return dataUrl;
}

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (base64: string, mediaType: string) => void;
  title?: string;
}

// MDN "getUserMedia() による写真の撮影" の方式に準拠した共通カメラコンポーネント。
// 撮影画像はコンポーネントの外（state）に一切保存せず、送信後は破棄する前提。
export function CameraCapture({ open, onOpenChange, onCapture, title = "撮影" }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setErrorKind(null);
    setCapturedDataUrl(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKind("unsupported");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setErrorKind("NotAllowedError");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErrorKind("NotFoundError");
      } else {
        setErrorKind("other");
      }
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    async function run() {
      if (open) {
        await startCamera();
      } else {
        stopStream();
        setCapturedDataUrl(null);
        setErrorKind(null);
      }
    }
    run();
    // アンマウント・モーダルを閉じた時は必ずカメラを止める。
    return () => stopStream();
  }, [open]);

  function handleShoot() {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = drawToJpegBase64(video, video.videoWidth, video.videoHeight);
    setCapturedDataUrl(dataUrl);
    stopStream();
  }

  function handleRetake() {
    startCamera();
  }

  function handleUse() {
    if (!capturedDataUrl) return;
    const base64 = capturedDataUrl.split(",")[1] ?? "";
    onCapture(base64, "image/jpeg");
    onOpenChange(false);
  }

  function handleFileFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const dataUrl = drawToJpegBase64(img, img.naturalWidth, img.naturalHeight);
        setCapturedDataUrl(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>撮影した画像は送信後にこの画面から破棄されます。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {errorKind && (
            <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {ERROR_MESSAGES[errorKind]}
              </span>
              <span>代わりに画像ファイルを選択してください。</span>
              <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900">
                <Upload className="h-4 w-4" />
                画像ファイルを選択
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileFallback}
                />
              </label>
            </div>
          )}

          {!errorKind && !capturedDataUrl && (
            <div className="relative overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="w-full" muted playsInline />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
                  カメラを起動しています…
                </div>
              )}
            </div>
          )}

          {capturedDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedDataUrl} alt="撮影プレビュー" className="w-full rounded-md" />
          )}

          <div className="flex justify-end gap-2">
            {!errorKind && !capturedDataUrl && (
              <Button onClick={handleShoot} disabled={starting}>
                <Camera className="h-4 w-4" />
                撮影
              </Button>
            )}
            {capturedDataUrl && (
              <>
                <Button variant="outline" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4" />
                  撮り直す
                </Button>
                <Button onClick={handleUse}>
                  <Check className="h-4 w-4" />
                  この写真を使う
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
