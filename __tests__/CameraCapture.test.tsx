import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CameraCapture } from "@/components/camera/CameraCapture";

const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: originalMediaDevices,
    configurable: true,
  });
});

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}

describe("CameraCapture error fallback", () => {
  it("shows the unsupported-browser message and a file fallback when getUserMedia is unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });

    render(
      <CameraCapture open={true} onOpenChange={() => {}} onCapture={() => {}} />
    );

    expect(
      await screen.findByText(/このブラウザ・接続ではカメラ機能が利用できません/)
    ).toBeInTheDocument();
    expect(screen.getByText("画像ファイルを選択")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /撮影/ })).not.toBeInTheDocument();
  });

  it("shows a permission message and file fallback on NotAllowedError", async () => {
    mockGetUserMedia(() => Promise.reject(new DOMException("denied", "NotAllowedError")));

    render(
      <CameraCapture open={true} onOpenChange={() => {}} onCapture={() => {}} />
    );

    expect(
      await screen.findByText(/カメラの使用が許可されていません/)
    ).toBeInTheDocument();
    expect(screen.getByText("画像ファイルを選択")).toBeInTheDocument();
  });

  it("shows a no-camera message and file fallback on NotFoundError", async () => {
    mockGetUserMedia(() => Promise.reject(new DOMException("no camera", "NotFoundError")));

    render(
      <CameraCapture open={true} onOpenChange={() => {}} onCapture={() => {}} />
    );

    expect(await screen.findByText(/カメラが見つかりませんでした/)).toBeInTheDocument();
    expect(screen.getByText("画像ファイルを選択")).toBeInTheDocument();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    mockGetUserMedia(() => Promise.reject(new Error("boom")));

    render(
      <CameraCapture open={true} onOpenChange={() => {}} onCapture={() => {}} />
    );

    expect(await screen.findByText(/カメラを起動できませんでした/)).toBeInTheDocument();
  });

  it("does not attempt to start the camera while closed", async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    render(
      <CameraCapture open={false} onOpenChange={() => {}} onCapture={() => {}} />
    );

    await waitFor(() => expect(getUserMedia).not.toHaveBeenCalled());
    expect(screen.queryByText("画像ファイルを選択")).not.toBeInTheDocument();
  });
});
