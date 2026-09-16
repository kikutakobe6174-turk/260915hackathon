export interface PendingTestUpload {
  testId: number;
  base64: string;
  mediaType: string;
  dataUrl: string;
  fileName: string;
}

let pendingUpload: PendingTestUpload | null = null;

// 画像はSPA遷移中のメモリだけで受け渡し、永続ストレージには保存しない。
export function setPendingTestUpload(upload: PendingTestUpload) {
  pendingUpload = upload;
}

export function consumePendingTestUpload(testId: number) {
  if (pendingUpload?.testId !== testId) return null;
  const upload = pendingUpload;
  pendingUpload = null;
  return upload;
}
