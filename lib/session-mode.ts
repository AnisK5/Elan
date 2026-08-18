import type { SessionContext } from "@/lib/types";

export function isUntimedSession(ctx?: SessionContext): boolean {
  return ctx === "sortie" || ctx === "courses" || ctx === "deposer";
}

export const DEPOSER_PLAN_MESSAGE =
  "On pose tout ce qui te trotte. Pas de chrono — tu parles, je range.";
