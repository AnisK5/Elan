"use client";

import { useState } from "react";
import {
  DEFAULT_NOTIFY_TIME,
  dismissNotifyPrompt,
  fireRitualNotification,
  getDeviceTimezone,
  isWebPushClientConfigured,
  requestNotificationPermission,
  subscribeWebPush,
  type PlanStatsForNotify,
} from "@/lib/notifications";
import type { Thread } from "@/lib/types";
import { useSettings } from "@/lib/store";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/** Opt-in après une première séance : notif matin avec conseil intégré. */
export default function RitualNotify({
  visible,
  threads,
  planStats,
}: {
  visible: boolean;
  threads: Thread[];
  planStats: PlanStatsForNotify;
}) {
  const { settings, update } = useSettings();
  const [time, setTime] = useState(settings.notifyTime ?? DEFAULT_NOTIFY_TIME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  if (!visible || settings.notifyEnabled || hidden) return null;

  async function enable() {
    setBusy(true);
    setError("");
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      setError("Autorise les notifications dans le navigateur pour activer.");
      setBusy(false);
      return;
    }

    const tz = getDeviceTimezone();
    const notifyTime = time || DEFAULT_NOTIFY_TIME;
    update({
      ...settings,
      notifyEnabled: true,
      notifyTime,
      notifyTimezone: tz,
    });

    if (isWebPushClientConfigured() && isSupabaseConfigured()) {
      const sb = getSupabase();
      const {
        data: { session },
      } = await sb!.auth.getSession();
      if (!session?.access_token) {
        setError(
          "Connecte-toi pour recevoir le rappel sur ton téléphone, même app fermée.",
        );
        setBusy(false);
        return;
      }
      const push = await subscribeWebPush(session.access_token, {
        notifyTime,
        timezone: tz,
      });
      if (!push.ok) {
        const msg =
          push.error === "push-not-configured"
            ? "Web Push pas encore configuré côté serveur (VAPID)."
            : "Impossible d'enregistrer le rappel push — réessaie plus tard.";
        setError(msg);
      }
    }

    setBusy(false);
  }

  async function preview() {
    setBusy(true);
    setError("");
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      setError("Autorise les notifications pour voir l'exemple.");
      setBusy(false);
      return;
    }
    await fireRitualNotification(
      {
        threads,
        stats: planStats,
        name: settings.name,
      },
      true,
    );
    setBusy(false);
  }

  function later() {
    dismissNotifyPrompt();
    setHidden(true);
  }

  const pushReady =
    isWebPushClientConfigured() && isSupabaseConfigured();

  return (
    <div className="animate-rise mt-6 rounded-2xl border border-teal-soft bg-teal-soft/40 p-4">
      <p className="text-sm font-medium text-ink">
        Rappel du matin avec conseil intégré
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-teal-ink">
        À l&apos;heure choisie, Élan t&apos;envoie durée + quoi traiter + ce
        qu&apos;il peut préparer. Tap pour lancer — ou ouvrir pour ajuster.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <span className="text-muted">Heure</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
          />
        </label>
        <button
          onClick={() => void enable()}
          disabled={busy}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-50"
        >
          Activer
        </button>
        <button
          onClick={() => void preview()}
          disabled={busy}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-50"
        >
          Exemple
        </button>
        <button
          onClick={later}
          className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-ink"
        >
          Plus tard
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-amber">{error}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        {pushReady
          ? "Avec un compte : rappel sur ton téléphone même app fermée (installe la PWA)."
          : "Sans compte ou sans Web Push : rappel seulement si l'app reste installée/ouverte."}
      </p>
    </div>
  );
}
