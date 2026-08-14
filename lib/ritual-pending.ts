/** Données passées quand l'utilisateur ouvre l'app depuis la notif matin. */
export interface RitualLaunch {
  pick: number;
  message: string;
}

export const RITUAL_SW_MESSAGE = "elan-ritual-launch";
const RITUAL_STORAGE_KEY = "elan.ritual.pending.v1";
const RITUAL_TTL_MS = 30 * 60 * 1000;

/** URL d'ouverture après clic notif (message court encodé). */
export function buildRitualLaunchUrl(pick: string, planMessage: string): string {
  const params = new URLSearchParams({ ritual: "1", pick });
  const msg = planMessage.trim();
  if (msg) params.set("msg", msg);
  return `/?${params.toString()}`;
}

/** Lit ritual=1 depuis l'URL (client uniquement). */
export function parseRitualLaunch(search: string): RitualLaunch | null {
  const sp = new URLSearchParams(search);
  if (sp.get("ritual") !== "1") return null;
  const pickRaw = sp.get("pick");
  const pick = pickRaw ? Number(pickRaw) : 15;
  const message = sp.get("msg")?.trim() ?? "";
  if (!Number.isFinite(pick) || pick <= 0) return null;
  return { pick, message };
}

export function stashRitualLaunch(launch: RitualLaunch): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    RITUAL_STORAGE_KEY,
    JSON.stringify({ ...launch, at: Date.now() }),
  );
}

export function takeStashedRitualLaunch(): RitualLaunch | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RITUAL_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RITUAL_STORAGE_KEY);
    const j = JSON.parse(raw) as RitualLaunch & { at?: number };
    if (typeof j.at === "number" && Date.now() - j.at > RITUAL_TTL_MS) {
      return null;
    }
    if (!Number.isFinite(j.pick) || j.pick <= 0) return null;
    return { pick: j.pick, message: j.message ?? "" };
  } catch {
    return null;
  }
}

/** URL ou sessionStorage (postMessage iOS). */
export function readRitualLaunch(search: string): RitualLaunch | null {
  return parseRitualLaunch(search) ?? takeStashedRitualLaunch();
}
