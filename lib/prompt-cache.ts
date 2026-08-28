/** Blocs system avec cache éphémère Anthropic (instructions statiques répétées). */

type SystemTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export function cachedSystemBlock(text: string): SystemTextBlock[] {
  return [
    {
      type: "text" as const,
      text,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

/** Instructions statiques en cache + contexte dynamique non caché. */
export function systemPromptBlocks(
  cached: string,
  dynamic?: string,
): SystemTextBlock[] {
  const blocks = cachedSystemBlock(cached);
  if (dynamic?.trim()) {
    blocks.push({ type: "text", text: dynamic });
  }
  return blocks;
}
