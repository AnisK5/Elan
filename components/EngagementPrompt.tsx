"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/home/Branding";
import {
  DEFAULT_NOTIFY_TIME,
  dismissNotifyPrompt,
  fireRitualNotification,
  isWebPushClientConfigured,
  persistNotifySchedule,
  requestNotificationPermission,
  type PlanStatsForNotify,
} from "@/lib/notifications";
import {
  dismissPwaPrompt,
  markModalShownThisVisit,
  type EngagementPromptKind,
} from "@/lib/engagement-prompts";
import type { Thread } from "@/lib/types";
import { useSettings } from "@/lib/store";
import { logUsage } from "@/lib/usage-log";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function EngagementPrompt({
  kind,
  threads,
  planStats,
  onClose,
}: {
  kind: EngagementPromptKind;
  threads: Thread[];
  planStats: PlanStatsForNotify;
  onClose: () => void;
}) {
  if (kind === "pwa") {
    return <PwaPrompt onClose={onClose} />;
  }
  return (
    <NotifyPrompt threads={threads} planStats={planStats} onClose={onClose} />
  );
}

function ModalShell({
  title,
  children,
  onDismiss,
  dismissLabel = "Plus tard",
  primary,
}: {
  title: string;
  children: ReactNode;
  onDismiss: () => void;
  dismissLabel?: string;
  primary?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="engagement-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h2
          id="engagement-title"
          className="font-display text-xl font-semibold text-ink"
        >
          {title}
        </h2>
        {children}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl px-4 py-2.5 text-[14px] text-muted transition hover:text-ink"
          >
            {dismissLabel}
          </button>
          {primary}
        </div>
      </div>
    </div>
  );
}

function PwaPrompt({ onClose }: { onClose: () => void }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismissLater() {
    dismissPwaPrompt();
    markModalShownThisVisit();
    onClose();
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    }
    markModalShownThisVisit();
    onClose();
  }

  function understood() {
    markModalShownThisVisit();
    onClose();
  }

  return (
    <ModalShell
      title="Garde Élan sous la main"
      onDismiss={dismissLater}
      primary={
        deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-xl bg-teal px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-teal-ink"
          >
            Installer
          </button>
        ) : isIOS ? (
          <button
            type="button"
            onClick={understood}
            className="rounded-xl bg-teal px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-teal-ink"
          >
            Compris
          </button>
        ) : undefined
      }
    >
      <div className="mt-3 flex items-start gap-3">
        <Logo className="h-10 w-10 rounded-xl" />
        <p className="text-[14px] leading-relaxed text-muted">
          {isIOS ? (
            <>
              Sur iPhone : appuie sur <b>Partager</b>, puis{" "}
              <b>« Sur l&apos;écran d&apos;accueil »</b>. Tu ouvriras ta séance
              en un tap — et les rappels marcheront mieux.
            </>
          ) : deferred ? (
            <>
              Ajoute Élan à ton écran d&apos;accueil : ta séance en un tap, comme
              une vraie app.
            </>
          ) : (
            <>
              Quand ton navigateur le proposera, installe Élan sur ton écran
              d&apos;accueil pour y revenir en un tap.
            </>
          )}
        </p>
      </div>
    </ModalShell>
  );
}

function NotifyPrompt({
  threads,
  planStats,
  onClose,
}: {
  threads: Thread[];
  planStats: PlanStatsForNotify;
  onClose: () => void;
}) {
  const { settings, update } = useSettings();
  const [time, setTime] = useState(settings.notifyTime ?? DEFAULT_NOTIFY_TIME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pushReady =
    isWebPushClientConfigured() && isSupabaseConfigured();

  function dismissLater() {
    dismissNotifyPrompt();
    markModalShownThisVisit();
    onClose();
  }

  async function enable() {
    setBusy(true);
    setError("");
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      setError("Autorise les notifications dans le navigateur pour activer.");
      setBusy(false);
      return;
    }

    const notifyTime = time || DEFAULT_NOTIFY_TIME;
    if (pushReady) {
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
    }

    const result = await persistNotifySchedule({
      settings,
      update,
      notifyTime,
      notifyEnabled: true,
    });
    if (!result.ok) {
      setError(
        result.error === "push-not-configured"
          ? "Web Push pas encore configuré côté serveur (VAPID)."
          : "Impossible d'enregistrer le rappel — réessaie plus tard.",
      );
      setBusy(false);
      return;
    }

    const sb = getSupabase();
    const uid = sb
      ? (await sb.auth.getSession()).data.session?.user?.id
      : null;
    logUsage("notify_on", { userId: uid, meta: { channel: "push" } });
    markModalShownThisVisit();
    onClose();
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
      { threads, stats: planStats, name: settings.name },
      true,
    );
    setBusy(false);
  }

  return (
    <ModalShell
      title="Un petit rappel le matin ?"
      onDismiss={dismissLater}
      primary={
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="rounded-xl bg-teal px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          Activer
        </button>
      }
    >
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        À l&apos;heure choisie, Élan t&apos;envoie durée + quoi traiter. Tap pour
        lancer — sans repasser par l&apos;accueil.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <span className="text-muted">Heure</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-line bg-paper px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void preview()}
          className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-40"
        >
          Exemple
        </button>
      </div>
      {error ? <p className="mt-3 text-xs text-amber">{error}</p> : null}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        {pushReady
          ? "Installe la PWA sur ton téléphone pour les rappels même app fermée."
          : "Sans Web Push : rappel seulement si l'app reste ouverte."}
      </p>
    </ModalShell>
  );
}
