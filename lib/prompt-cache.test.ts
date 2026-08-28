import { describe, expect, it } from "vitest";
import { cachedSystemBlock, systemPromptBlocks } from "./prompt-cache";

describe("prompt cache helpers", () => {
  it("marque le bloc statique en cache éphémère", () => {
    const blocks = cachedSystemBlock("instructions");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("ajoute le contexte dynamique sans cache", () => {
    const blocks = systemPromptBlocks("core", "trucs du jour");
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.text).toBe("trucs du jour");
    expect(blocks[1]?.cache_control).toBeUndefined();
  });
});
