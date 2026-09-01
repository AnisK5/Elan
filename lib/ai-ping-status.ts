import type { AnthropicFailKind } from "./anthropic";
import type { AiBlockKind } from "./ai-access";

export type AiKeySource = "user" | "shared" | "none";

export interface AiPingProbe {
  ok: boolean;
  errorKind?: AnthropicFailKind;
}

export interface AiPingStatus {
  ok: boolean;
  keySource: AiKeySource;
  errorKind?: AnthropicFailKind;
  blocked?: AiBlockKind;
  fallbackToApp?: boolean;
  app?: AiPingProbe;
  user?: AiPingProbe | null;
  quota?: { used: number; limit: number };
}

export function resolveAiPingStatus(opts: {
  userKeyActive: boolean;
  sharedKey: string;
  blocked?: AiBlockKind;
  quota?: { used: number; limit: number };
  app: AiPingProbe;
  user: AiPingProbe | null;
}): AiPingStatus {
  const { userKeyActive, sharedKey, blocked, quota, app, user } = opts;

  if (!userKeyActive) {
    if (!sharedKey) {
      return {
        ok: false,
        keySource: "none",
        errorKind: "no_key",
        blocked: "no_key",
        app,
      };
    }
    return {
      ok: app.ok,
      keySource: "shared",
      errorKind: app.ok ? undefined : app.errorKind,
      quota,
      app,
    };
  }

  if (!user) {
    return {
      ok: false,
      keySource: "user",
      errorKind: "credits",
      app,
      user: { ok: false, errorKind: "credits" },
    };
  }

  if (user.ok) {
    return { ok: true, keySource: "user", app, user };
  }

  if (app.ok) {
    return {
      ok: true,
      keySource: "user",
      fallbackToApp: true,
      app,
      user,
    };
  }

  return {
    ok: false,
    keySource: userKeyActive ? "user" : "shared",
    errorKind: user.errorKind ?? app.errorKind ?? "credits",
    app,
    user,
  };
}
