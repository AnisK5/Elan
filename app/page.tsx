"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Thread } from "@/lib/types";
import {
  applyThreadOps,
  clearActiveSession,
  importData,
  newId,
  readActiveSession,
  restoreThreads,
  snapshotThreads,
  useSessions,
  useSettings,
  useThreads,
  type ActiveSession,
  type ThreadOp,
} from "@/lib/store";
import QuickCapture from "@/components/QuickCapture";
import Session from "@/components/Session";
import WeekView from "@/components/WeekView";
import ThreadRow from "@/components/ThreadRow";
import InstallPrompt from "@/components/InstallPrompt";
import Welcome from "@/components/Welcome";
import HelpButton from "@/components/HelpButton";
import { useAuth } from "@/components/AuthProvider";

// Bump à chaque changement du prompt de reco (app/api/plan) : invalide le cache
// des reco existantes pour que la nouvelle logique s'applique immédiatement.
const PLAN_VERSION = 8;
const DURATIONS = [5, 15, 30, 50];
// Au-delà de ce délai depuis son démarrage, une séance laissée en plan est
// considérée ratée : on ne rallume pas le minuteur de la veille, on rouvre
// sur l'accueil. Assez large pour couvrir une vraie interruption (appel,
// pause), assez court pour qu'une séance oubliée ne survive pas à la nuit.
const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const { threads, add, ready } = useThreads();
  const { log, sessions } = useSessions();
  const { settings } = useSettings();

  const [view, setView] = useState<"home" | "session" | "week">("home");
  const [duration, setDuration] = useState(15);
  const [today, setToday] = useState("");
  const [dayStart, setDayStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const [wrapUp, setWrapUp] = useState(false);
  const [resume, setResume] = useState<ActiveSession | null>(null);
  const [plan, setPlan] = useState<{ message: string; pick: string } | null>(
    null,
  );
  const [planLoading, setPlanLoading] = useState(false);
  const appliedSig = useRef("");
  const [wrapUpCount, setWrapUpCount] = useState(0);
  const sessionStartRef = useRef("");

  // Point rapide : dire ce qu'on a fait hors séance.
  const [pointText, setPointText] = useState("");
  const [pointBusy, setPointBusy] = useState(false);
  const [pointNote, setPointNote] = useState("");
  const [pointUndo, setPointUndo] = useState<Thread[] | null>(null);

  useEffect(() => setDuration(settings.defaultDurationMin), [settings]);

  // Reprise automatique d'une séance laissée en cours (refresh, onglet fermé…),
  // mais seulement si elle est encore fraîche — sinon on la jette.
  useEffect(() => {
    const a = readActiveSession();
    if (!a || a.messages.length === 0) return;
    const startedMs = Date.parse(a.startedAt);
    const fresh =
      Number.isFinite(startedMs) &&
      Date.now() - startedMs < RESUME_MAX_AGE_MS;
    if (!fresh) {
      clearActiveSession();
      return;
    }
    setResume(a);
    setDuration(a.durationMin);
    sessionStartRef.current = a.startedAt;
    setView("session");
  }, []);
  // « Aujourd'hui » et la carte de la semaine doivent basculer de jour même si
  // l'onglet reste ouvert toute la nuit : on resynchronise à intervalle et au
  // retour sur l'onglet (le setTimeout peut être gelé en arrière-plan / veille).
  useEffect(() => {
    function sync() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      setDayStart((prev) => (prev === d.getTime() ? prev : d.getTime()));
      setToday(
        new Intl.DateTimeFormat("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(d),
      );
    }
    sync();
    const id = setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const openThreads = useMemo(
    () => threads.filter((t) => t.status === "open"),
    [threads],
  );

  const { open, overdue } = useMemo(() => {
    const od = openThreads.filter(
      (t) => t.due && new Date(t.due).setHours(0, 0, 0, 0) < dayStart,
    );
    return { open: openThreads.length, overdue: od.length };
  }, [openThreads, dayStart]);

  // Avancement : trucs bouclés par jour cette semaine (colonne des victoires, sans dénominateur).
  const { doneToday, doneWeek, days, todayIdx } = useMemo(() => {
    const start = new Date(dayStart);
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const d = Array(7).fill(0) as number[];
    const idx = (start.getDay() + 6) % 7;
    for (const t of threads) {
      if (t.status !== "done" || !t.touchedAt) continue;
      const ts = new Date(t.touchedAt);
      ts.setHours(0, 0, 0, 0);
      const diff = Math.round((ts.getTime() - monday.getTime()) / 86_400_000);
      if (diff >= 0 && diff < 7) d[diff]++;
    }
    return {
      days: d,
      todayIdx: idx,
      doneToday: d[idx],
      doneWeek: d.reduce((a, b) => a + b, 0),
    };
  }, [threads, dayStart]);

  // Rythme récent. Sans ça, le planificateur ne voit qu'un volume figé et ne
  // peut pas distinguer « beaucoup de trucs mais on suit » de « ça s'accumule
  // depuis trois semaines » — les deux appellent pourtant des séances
  // différentes.
  const planStats = useMemo(() => {
    const now = Date.now();
    const since = now - 7 * 86_400_000;
    const recent = sessions.filter((s) => Date.parse(s.date) >= since);
    const lastSession = sessions.reduce<number | null>((acc, s) => {
      const ts = Date.parse(s.date);
      if (!Number.isFinite(ts)) return acc;
      return acc === null || ts > acc ? ts : acc;
    }, null);
    return {
      addedLast7: threads.filter((t) => Date.parse(t.createdAt) >= since)
        .length,
      doneLast7: threads.filter(
        (t) =>
          t.status === "done" && t.touchedAt && Date.parse(t.touchedAt) >= since,
      ).length,
      sessionsLast7: recent.length,
      minutesLast7: recent.reduce((a, s) => a + (s.durationMin || 0), 0),
      daysSinceLastSession:
        lastSession === null
          ? null
          : Math.floor((now - lastSession) / 86_400_000),
      stale14: openThreads.filter(
        (t) => now - Date.parse(t.createdAt) > 14 * 86_400_000,
      ).length,
    };
  }, [threads, openThreads, sessions]);

  const planSig = useMemo(
    () =>
      openThreads
        .map(
          (t) =>
            `${t.id}:${t.due ?? ""}:${t.effort ?? ""}:${t.kind}:${t.text}:${t.note ?? ""}`,
        )
        .join("|") +
      `#${planStats.doneLast7}:${planStats.sessionsLast7}:${planStats.daysSinceLastSession}`,
    [openThreads, planStats],
  );

  // Premier lancement : jamais rien déposé ET jamais fait de séance.
  const isNewcomer = ready && threads.length === 0 && sessions.length === 0;

  function applyPick(pick: string, sig: string) {
    if (appliedSig.current === sig) return; // ne pas écraser un choix manuel sur le même backlog
    appliedSig.current = sig;
    const n = Number(pick);
    setDuration(DURATIONS.includes(n) ? n : 15);
  }

  // Recommandation dynamique d'Élan : durée + conseil, calculés sur les vrais trucs.
  // Mise en cache par jour + signature du backlog pour ne pas rappeler l'IA sans raison.
  useEffect(() => {
    if (!ready || view !== "home") return;
    if (openThreads.length === 0) {
      setPlan(null);
      return;
    }
    const dateKey = new Date().toDateString();
    try {
      const raw = localStorage.getItem("elan.plan.v1");
      const c = raw ? JSON.parse(raw) : null;
      if (c && c.v === PLAN_VERSION && c.date === dateKey && c.sig === planSig) {
        setPlan({ message: c.message, pick: c.pick });
        applyPick(c.pick, planSig);
        return;
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    setPlanLoading(true);
    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threads: openThreads,
        stats: planStats,
        meta: { name: settings.name },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const p = { message: j.message ?? "", pick: j.pick ?? "25" };
        setPlan(p);
        applyPick(p.pick, planSig);
        try {
          localStorage.setItem(
            "elan.plan.v1",
            JSON.stringify({ v: PLAN_VERSION, date: dateKey, sig: planSig, ...p }),
          );
        } catch {
          // ignore
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, planSig]);

  function endSession(transcript: ChatMessage[]) {
    if (transcript.length > 1) {
      log({
        id: newId(),
        date: new Date().toISOString(),
        durationMin: duration,
        transcript,
      });
    }
    // Combien de trucs bouclés pendant CETTE séance (depuis son début).
    const start = sessionStartRef.current;
    const count = start
      ? snapshotThreads().filter(
          (t) => t.status === "done" && t.touchedAt && t.touchedAt >= start,
        ).length
      : 0;
    clearActiveSession();
    setResume(null);
    setView("home");
    setWrapUpCount(count);
    setWrapUp(true);
    setTimeout(() => setWrapUp(false), 6000);
  }

  function startFresh() {
    clearActiveSession();
    setResume(null);
    sessionStartRef.current = new Date().toISOString();
    setView("session");
  }

  async function sendPoint() {
    const t = pointText.trim();
    if (!t || pointBusy) return;
    setPointBusy(true);
    setPointText("");
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          messages: [{ role: "user", content: t }],
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { updates?: ThreadOp[]; note?: string };
        if (Array.isArray(j.updates) && j.updates.length > 0) {
          const before = snapshotThreads();
          applyThreadOps(j.updates);
          setPointUndo(before);
          setPointNote(j.note || "trucs mis à jour");
          window.setTimeout(() => {
            setPointNote("");
            setPointUndo(null);
          }, 10000);
        } else {
          setPointNote("Rien à changer de mon côté — mais bien noté.");
          window.setTimeout(() => setPointNote(""), 4000);
        }
      }
    } catch {
      // silencieux
    } finally {
      setPointBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <span className="h-4 w-4 animate-breathe rounded-full bg-teal" />
      </main>
    );
  }

  if (!user) {
    return <Welcome />;
  }

  if (view === "session") {
    return (
      <Session
        durationMin={duration}
        name={settings.name}
        initial={resume}
        onEnd={endSession}
      />
    );
  }

  if (view === "week") {
    return <WeekView onClose={() => setView("home")} />;
  }

  return (
    <>
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-24">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("week")}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted transition hover:text-ink"
          >
            Ma semaine
          </button>
          <span className="text-sm capitalize text-muted">{today}</span>
        </div>
      </header>

      {wrapUp && (
        <div className="animate-rise mb-4 rounded-2xl border border-teal-soft bg-teal-soft px-4 py-3 text-sm text-teal-ink">
          {wrapUpCount > 0 ? (
            <>
              Séance bouclée —{" "}
              <b>
                {wrapUpCount} truc{wrapUpCount > 1 ? "s" : ""} réglé
                {wrapUpCount > 1 ? "s" : ""} 🎉
              </b>{" "}
              Le reste attend sagement, tu n&apos;as pas à y penser.
            </>
          ) : (
            <>
              Séance bouclée. Le reste attend sagement — tu n&apos;as pas à y
              penser jusqu&apos;à demain.
            </>
          )}
        </div>
      )}

      {/* Séance du jour */}
      <section className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-[0_8px_40px_-24px_rgba(38,35,29,0.4)]">
        <p className="text-sm text-muted">
          {isNewcomer ? "Bienvenue 👋" : greeting()}
        </p>

        {isNewcomer ? (
          <>
            <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight text-ink">
              Commence par vider ta tête.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Dépose tout ce qui traîne, en vrac — sans classer, sans prioriser.
              Ensuite je te proposerai un créneau à ta taille, 15, 30 ou 50
              minutes selon ce que tu as sur les bras et ce qui presse. Et je te
              dirai précisément quoi y faire, en restant avec toi.
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-sink/60 px-4 py-3 text-sm text-ink">
              <span className="mt-0.5 text-teal">↓</span>
              <span>
                Pour commencer, vide ta tête juste en dessous. Un truc, dix
                trucs — comme ça vient.
              </span>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight text-ink">
              Ta séance du jour
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-faint">
              Pas de liste à gérer : tu te présentes, on la traverse ensemble, un
              pas à la fois.
            </p>

            {open > 0 ? (
              <div className="mt-3 rounded-xl border border-teal-soft bg-teal-soft/50 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal" />
                  <span className="text-xs font-medium tracking-wide text-teal">
                    Élan te conseille pour aujourd&apos;hui
                  </span>
                </div>
                {plan?.message ? (
                  <p className="animate-rise text-[15px] leading-relaxed text-teal-ink">
                    {plan.message}
                  </p>
                ) : planLoading ? (
                  <div className="flex flex-col gap-1.5 py-0.5">
                    <span className="h-3 w-4/5 animate-pulse rounded bg-teal/15" />
                    <span className="h-3 w-3/5 animate-pulse rounded bg-teal/15" />
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed text-teal-ink">
                    Présente-toi et je prends le pouls de tout ça avec toi, un
                    pas à la fois.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Rien qui presse aujourd&apos;hui. Présente-toi si tu veux faire
                le point, ou dépose ce qui te trotte en tête.
              </p>
            )}

            <div className="mt-5 flex items-center gap-2">
              <DurationPick value={duration} onChange={setDuration} />
            </div>

            <button
              onClick={startFresh}
              className="mt-5 w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink"
            >
              Commencer la séance
            </button>
          </>
        )}
      </section>

      {/* Capture */}
      <section className="mt-8">
        <h2 className="mb-2 px-1 text-sm font-medium text-muted">
          {isNewcomer
            ? "Vide ta tête — dépose tout ce qui traîne."
            : "Quelque chose en tête ? Dépose-le ici."}
        </h2>
        <QuickCapture onAdd={add} autoFocus={isNewcomer} />
      </section>

      {/* Point rapide : dire ce qu'on a fait hors séance */}
      {!isNewcomer && (open > 0 || doneToday > 0) && (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">
            Déjà avancé sur des trucs ? Dis-le-moi.
          </h2>
          <div className="rounded-2xl border border-line bg-surface p-2 shadow-[0_2px_20px_-12px_rgba(38,35,29,0.25)]">
            <div className="flex items-end gap-2">
              <textarea
                value={pointText}
                onChange={(e) => setPointText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendPoint();
                  }
                }}
                rows={1}
                placeholder="ex. j'ai appelé le dentiste et posté la lettre"
                className="max-h-40 min-h-[46px] flex-1 resize-none rounded-xl bg-transparent px-3 py-3 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
              />
              <button
                onClick={sendPoint}
                disabled={!pointText.trim() || pointBusy}
                className="mb-0.5 shrink-0 rounded-xl bg-teal px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
              >
                {pointBusy ? "…" : "Mettre à jour"}
              </button>
            </div>
            {pointNote && (
              <div className="animate-rise flex items-center gap-2 px-2 pb-1.5 pt-1 text-xs text-teal-ink">
                <span>✏️</span>
                <span className="flex-1">{pointNote}</span>
                {pointUndo && (
                  <button
                    onClick={() => {
                      restoreThreads(pointUndo);
                      setPointUndo(null);
                      setPointNote("");
                    }}
                    className="shrink-0 rounded-md px-2 py-0.5 font-medium text-teal underline-offset-2 hover:underline"
                  >
                    annuler
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Avancement — colonne des victoires, jamais ce qui reste */}
      {doneWeek > 0 && (
        <WeekMomentum
          days={days}
          todayIdx={todayIdx}
          doneToday={doneToday}
          doneWeek={doneWeek}
        />
      )}

      {/* État, sans liste anxiogène */}
      <section className="mt-8">
        <BacklogPeek open={open} ready={ready} />
      </section>

      <InstallPrompt />

      <ImportData />

      <footer className="mt-auto flex flex-col items-center gap-1 pt-10 text-center text-xs text-faint">
        <span>Élan — pense à la séance, pas à la liste.</span>
        <button
          onClick={signOut}
          className="text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Se déconnecter
        </button>
      </footer>
    </main>

    <HelpButton />
    </>
  );
}

function BacklogPeek({ open, ready }: { open: number; ready: boolean }) {
  const [show, setShow] = useState(false);
  const { threads, patch, remove } = useThreads();

  if (!ready) return null;

  if (open === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
        Rien en attente. Tête légère — ou dépose ce qui traîne.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-sink/40 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink">
          Je garde{" "}
          <b className="font-display text-lg">{open}</b>{" "}
          {open > 1 ? "trucs" : "truc"} pour toi.
        </p>
        <button
          onClick={() => setShow((s) => !s)}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          {show ? "masquer" : "y jeter un œil"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Tu n&apos;as pas à les gérer, ni même à les regarder. Je m&apos;en occupe
        avec toi pendant la séance, un morceau à la fois.
      </p>

      {show && (
        <div className="mt-3 flex flex-col gap-0.5 border-t border-line pt-3">
          {threads
            .filter((t) => t.status === "open")
            .map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                patch={patch}
                remove={remove}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function WeekMomentum({
  days,
  todayIdx,
  doneToday,
  doneWeek,
}: {
  days: number[];
  todayIdx: number;
  doneToday: number;
  doneWeek: number;
}) {
  const max = Math.max(1, ...days);
  const labels = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-sm text-ink">
          <span className="text-teal">✓</span>{" "}
          <b>{doneToday}</b>{" "}
          {`${doneToday > 1 ? "réglés" : "réglé"} aujourd'hui`}
        </span>
        <span className="text-xs text-muted">{doneWeek} cette semaine</span>
      </div>
      <div className="flex h-12 items-end gap-1.5">
        {days.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-md transition-all ${
                i === todayIdx
                  ? "bg-teal"
                  : c > 0
                    ? "bg-teal-soft"
                    : "bg-sink"
              }`}
              style={{ height: `${6 + (c / max) * 32}px` }}
              title={`${c} réglé${c > 1 ? "s" : ""}`}
            />
            <span
              className={`text-[9px] ${
                i === todayIdx ? "font-semibold text-teal" : "text-faint"
              }`}
            >
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportData() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  function run() {
    try {
      const data = JSON.parse(text);
      const { added } = importData(data);
      setMsg(
        added > 0
          ? `${added} truc${added > 1 ? "s" : ""} importé${added > 1 ? "s" : ""} ✓ — synchronisé sur ton compte.`
          : "Rien de nouveau à importer (déjà présent ?).",
      );
      setText("");
    } catch {
      setMsg("Format invalide — colle bien le JSON copié depuis la console.");
    }
  }

  if (!open) {
    return (
      <div className="mt-8 text-center">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Importer d&apos;anciennes données
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">
        Importer d&apos;anciennes données
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Colle ici le JSON exporté depuis ton ancien appareil/adresse. Tes trucs
        seront fusionnés dans ton compte (sans doublon) et synchronisés.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder='{"threads":[...],"sessions":[...],"settings":...}'
        className="mt-2 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-teal"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={run}
          disabled={!text.trim()}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          Importer
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg("");
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
        >
          Fermer
        </button>
        {msg && <span className="text-xs text-teal-ink">{msg}</span>}
      </div>
    </div>
  );
}

function DurationPick({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-sink p-1">
      {DURATIONS.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            value === d
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {d} min
        </button>
      ))}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Nuit calme.";
  if (h < 12) return "Bonjour.";
  if (h < 18) return "Bel après-midi.";
  return "Bonsoir.";
}

function Logo() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal">
      <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-white" />
    </span>
  );
}
