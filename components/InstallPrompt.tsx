"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "elan.installDismissed.v1";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isIOS, setIsIOS] = useState(false);
  const [hidden, setHidden] = useState(true); // caché par défaut (SSR + déjà installé)

  useEffect(() => {
    // Enregistre le service worker (rend l'app installable).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";

    setIsIOS(ios);
    // On montre l'invite si : pas déjà installée, pas déjà refusée, et
    // (on est sur iOS → instructions manuelles, sinon on attend le prompt natif).
    setHidden(standalone || dismissed || (!ios && true));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!dismissed) setHidden(false);
    };
    const onInstalled = () => setHidden(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  return (
    <div className="animate-rise mt-6 rounded-2xl border border-teal-soft bg-teal-soft/50 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal">
          <span className="h-3.5 w-3.5 rounded-full bg-white" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">
            Installe Élan sur ton écran d&apos;accueil
          </p>
          {isIOS ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Appuie sur <b>Partager</b> <span aria-hidden>⎋</span>, puis{" "}
              <b>« Sur l&apos;écran d&apos;accueil »</b>. Tu ouvriras ta séance
              en un tap, comme une vraie app.
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Ouvre ta séance en un tap, comme une vraie app — sans passer par
              le navigateur.
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            {deferred && (
              <button
                onClick={install}
                className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink"
              >
                Installer
              </button>
            )}
            <button
              onClick={dismiss}
              className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-ink"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
