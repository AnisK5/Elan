import { describe, expect, it } from "vitest";
import { trimSessionMessages } from "./session-context";

describe("trimSessionMessages", () => {
  it("garde tout si sous la limite", () => {
    const msgs = [
      { role: "assistant" as const, content: "a" },
      { role: "user" as const, content: "b" },
    ];
    expect(trimSessionMessages(msgs)).toEqual(msgs);
  });

  it("coupe le début au-delà de la limite", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
      content: String(i),
    }));
    const trimmed = trimSessionMessages(msgs, 16);
    expect(trimmed).toHaveLength(16);
    expect(trimmed[0]?.content).toBe("4");
    expect(trimmed[15]?.content).toBe("19");
  });
});
