import { describe, expect, it } from "vitest";
import { isUnavailableRoute, UNAVAILABLE_ROUTES } from "@/lib/featureFlags";

describe("isUnavailableRoute", () => {
  it("未実装機能のパスを判定する", () => {
    for (const route of ["/lessons", "/lessons/3", "/answer-sheets/7", "/masters/schools", "/masters/textbooks/1/units", "/masters/students"]) {
      expect(isUnavailableRoute(route)).toBe(true);
    }
  });

  it("MVPメインフローの画面は通す", () => {
    for (const route of ["/", "/tests", "/tests/new", "/tests/2/trends", "/tests/2/bank", "/tests/2/print-preview", "/tests/2/prerequisites", "/tests/2/worksheets", "/problem-bank", "/problems/new", "/problems/12", "/worksheets/1"]) {
      expect(isUnavailableRoute(route)).toBe(false);
    }
  });

  it("前方一致で他のパスを巻き込まない", () => {
    expect(UNAVAILABLE_ROUTES).toContain("/lessons");
    expect(isUnavailableRoute("/lessons-archive")).toBe(false);
    expect(isUnavailableRoute("/masterscopy")).toBe(false);
  });
});
