"use client";

import { useEffect, useState } from "react";
import type { Thread } from "@/lib/types";
import {
  DEFAULT_NOTIFY_TIME,
  fireRitualNotification,
  getDeviceTimezone,
  isWebPushClientConfigured,
  persistNotifySchedule,
  requestNotificationPermission,
  type PlanStatsForNotify,
} from "@/lib/notifications";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useSettings } from "@/lib/store";
import { useAuth } from "@/components/AuthProvider";

/** Réglages du rappel matin (visible une fois activé). */
export default function RitualNotifySettings({
  threads,
  planStats,
}: {
  threads: Thread[];
  planStats: PlanStatsForNotify;
}) {
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const [time, setTime] = useState(settings.notifyTime ?? DEFAULT_NOTIFY_TIME);
  const [email, setEmail] = useState(Boolean(settings.notifyEmailEnabled));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTime(settings.notifyTime ?? DEFAULT_NOTIFY_TIME);
    setEmail(Boolean(settings.notifyEmailEnabled));
  }, [settings.notifyTime, settings.notifyEmailEnabled]);

  if (!settings.notifyEnabled) return null;

  const dirty =
    time !== (settings.notifyTime ?? DEFAULT_NOTIFY_TIME) ||
    email !== Boolean(settings.notifyEmailEnabled);
  const tz = settings.notifyTimezone ?? getDeviceTimezone();
  const pushReady =
    isWebPushClientConfigured() && isSupabaseConfigured() && Boolean(user);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const result = await persistNotifySchedule({
      settings,
      update,
      notifyTime: time,
      notifyEnabled: true,
      notifyEmailEnabled: email,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "invalid-time"
          ? "Heure invalide."
          : "Impossible d'enregistrer — réessaie.",
      );
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function disable() {
    setBusy(true);
    setError("");
    await persistNotifySchedule({
      settings,
      update,
      notifyTime: time,
      notifyEnabled: false,
      notifyEmailEnabled: false,
    });
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

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">Rappel du matin</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Notif courte sur le téléphone. Le mail reprend le conseil complet du
        jour, plus humain.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <span className="text-muted">Heure</span>
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setSaved(false);
            }}
            className="rounded-lg border border-line bg-paper px-2 py-1 text-sm"
          />
        </label>
        {dirty && (
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-50"
          >
            Enregistrer
          </button>
        )}
        {saved && !dirty && (
          <span className="text-xs text-teal">Enregistré</span>
        )}
        <button
          onClick={() => void preview()}
          disabled={busy}
          className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-50"
        >
          Exemple notif
        </button>
        <button
          onClick={() => void disable()}
          disabled={busy}
          className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-50"
        >
          Désactiver
        </button>
      </div>
      {user && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => {
              setEmail(e.target.checked);
              setSaved(false);
            }}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Mail aussi</span>
            <span className="block text-[12px] leading-relaxed text-muted">
              Conseil complet du jour à{" "}
              {user.email ?? "ton adresse de connexion"} — en plus ou à la place
              de la notif si le push ne passe pas.
            </span>
          </span>
        </label>
      )}
      {error && <p className="mt-2 text-xs text-amber">{error}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        {pushReady
          ? `Fuseau : ${tz}. Rappel push = app fermée (PWA) + cron Supabase actif.`
          : "Sans compte : rappel local seulement si l'app est ouverte à l'heure dite."}
      </p>
    </div>
  );
}
