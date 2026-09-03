import { describe, expect, it } from "vitest";
import { isAiApiPath } from "./ai-enabled";

describe("isAiApiPath", () => {
  it("reconnaît les routes IA", () => {
    expect(isAiApiPath("/api/plan")).toBe(true);
    expect(isAiApiPath("/api/session")).toBe(true);
    expect(isAiApiPath("/api/chat?x=1")).toBe(true);
    expect(isAiApiPath("/api/reconcile")).toBe(true);
    expect(isAiApiPath("/api/tidy")).toBe(true);
    expect(isAiApiPath("/api/ai/ping")).toBe(true);
  });

  it("laisse passer le reste", () => {
    expect(isAiApiPath("/api/admin/analytics")).toBe(false);
    expect(isAiApiPath("/api/push/subscribe")).toBe(false);
  });
});
