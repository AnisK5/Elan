"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, SessionContext, Thread } from "@/lib/types";
import {
  applyThreadOps,
  clearActiveSession,
  importData,
  newId,
  readActiveSession,
  restoreThreads,
  snapshotThreads,
  wakeSnoozed,
  readChat,
  writeChat,
  clearChat,
  useSessions,
  useSettings,
  useThreads,
  type ActiveSession,
} from "@/lib/store";
import Session from "@/components/Session";
import ThreadRow from "@/components/ThreadRow";
import InstallPrompt from "@/components/InstallPrompt";
import Welcome from "@/components/Welcome";
import HelpButton from "@/components/HelpButton";
import { useAuth } from "@/components/AuthProvider";
import { parseThreadOps } from "@/lib/ops";
import { doneCountsThisWeek, completionAt } from "@/lib/week-stats";
import { sessionsToday } from "@/lib/session-memory";

// Bump à chaque changement du prompt de reco (app/api/plan) : invalide le cache
// des reco existantes pour que la nouvelle logique s'applique immédiatement.
const PLAN_VERSION = 12;
const DURATIONS = [5, 15, 30, 50];
// Durée nominale pour les séances dehors (timer masqué, sert au log).
const OUTDOOR_DURATION = 30;
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

  const [view, setView] = useState<"home" | "session">("home");
  const [duration, setDuration] = useState(15);
  const [context, setContext] = useState<SessionContext>("desk");
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
  const [planUnreachable, setPlanUnreachable] = useState(false);
  const appliedSig = useRef("");
  // Deux sources écrivent le conseil : la reco automatique et le choix manuel
  // de durée. Sans numéro de série, une réponse lente écrase une réponse
  // récente — d'où un conseil calibré sur 15 alors qu'on vient de cliquer 30.
  const planReq = useRef(0);
  // Une fois qu'on a choisi soi-même pour ce backlog, la reco générique n'a
  // plus le droit de reprendre la main.
  const manualPickSig = useRef("");
  const [wrapUpCount, setWrapUpCount] = useState(0);
  const sessionStartRef = useRef("");

  // Discussion libre hors séance : déposer, donner des nouvelles, réfléchir
  // à un truc, demander comment s'organiser demain.
  const [pointText, setPointText] = useState("");
  const [pointBusy, setPointBusy] = useState(false);
  const [pointNote, setPointNote] = useState("");
  const [pointUndo, setPointUndo] = useState<Thread[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  // Replié par défaut : l'accueil doit rester calme. Un historique qui grossit
  // à chaque échange recrée le mur de texte que l'app promet d'éviter.
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => setChat(readChat()), []);
  useEffect(() => {
    if (chat.length > 0) chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  // La durée par défaut ne sert qu'au tout premier rendu. `settings` change
  // d'identité à l'hydratation, et sans ce garde l'effet repartait APRÈS la
  // recommandation d'Élan et l'écrasait — d'où une durée jamais présélectionnée
  // sur celle qu'il conseille.
  const durationSettled = useRef(false);
  useEffect(() => {
    if (durationSettled.current) return;
    setDuration(settings.defaultDurationMin);
  }, [settings]);

  // Les trucs mis en pause reviennent d'eux-mêmes le jour dit.
  useEffect(() => {
    if (ready) wakeSnoozed();
  }, [ready]);

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
    setContext(a.context ?? "desk");
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

  const { open, openActions, openSuivis } = useMemo(() => {
    return {
      open: openThreads.length,
      // Séparés à l'affichage : « à faire » descend quand on avance, alors que
      // « à suivre » dépend des autres. Un compteur unique semble figé.
      openActions: openThreads.filter((t) => t.kind !== "suivi").length,
      openSuivis: openThreads.filter((t) => t.kind === "suivi").length,
    };
  }, [openThreads, dayStart]);

  // Avancement : trucs bouclés par jour cette semaine (colonne des victoires, sans dénominateur).
  const { doneToday, doneWeek, days, todayIdx } = useMemo(
    () => doneCountsThisWeek(threads, dayStart),
    [threads, dayStart],
  );

  // Rythme récent. Sans ça, le planificateur ne voit qu'un volume figé et ne
  // peut pas distinguer « beaucoup de trucs mais on suit » de « ça s'accumule
  // depuis trois semaines » — les deux appellent pourtant des séances
  // différentes.
  const planStats = useMemo(() => {
    // Ancré sur dayStart plutôt que Date.now() : stable pendant le rendu, et
    // raisonner en jours calendaires colle mieux au vécu qu'une fenêtre de 168h.
    const since = dayStart - 6 * 86_400_000;
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
          t.status === "done" &&
          completionAt(t) &&
          Date.parse(completionAt(t)!) >= since,
      ).length,
      sessionsLast7: recent.length,
      minutesLast7: recent.reduce((a, s) => a + (s.durationMin || 0), 0),
      daysSinceLastSession:
        lastSession === null
          ? null
          : Math.max(0, Math.round((dayStart - lastSession) / 86_400_000)),
      stale14: openThreads.filter(
        (t) => Date.parse(t.createdAt) < dayStart - 14 * 86_400_000,
      ).length,
    };
  }, [threads, openThreads, sessions, dayStart]);

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
    if (appliedSig.current === sig || context !== "desk") return;
    appliedSig.current = sig;
    durationSettled.current = true;
    const n = Number(pick);
    setDuration(DURATIONS.includes(n) ? n : 15);
  }

  function planFallbackMessage(ctx: SessionContext): string {
    if (ctx === "courses") {
      return "On part sur les courses — ta liste t'attend en séance.";
    }
    if (ctx === "sortie") {
      return "On regarde ce qui se fait dehors sur ton trajet.";
    }
    return "Présente-toi et je prends le pouls de tout ça avec toi, un pas à la fois.";
  }

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
      if (
        c &&
        c.v === PLAN_VERSION &&
        c.date === dateKey &&
        c.sig === planSig &&
        c.context === context
      ) {
        if (manualPickSig.current === planSig) return;
        setPlan({ message: c.message, pick: c.pick });
        applyPick(c.pick, planSig);
        return;
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    const reqId = ++planReq.current;
    setPlanLoading(true);
    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threads: openThreads,
        stats: planStats,
        context,
        meta: { name: settings.name },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        if (planReq.current === reqId) setPlanUnreachable(Boolean(j.unreachable));
        if (planReq.current === reqId) {
          const msg = (j.message ?? "").trim();
          if (msg) setPlan({ message: msg, pick: j.pick ?? "15" });
        }
        if (
          planReq.current === reqId &&
          manualPickSig.current !== planSig
        ) {
          applyPick(j.pick ?? "15", planSig);
        }
        try {
          const msg = (j.message ?? "").trim();
          if (msg) {
            localStorage.setItem(
              "elan.plan.v1",
              JSON.stringify({
                v: PLAN_VERSION,
                date: dateKey,
                sig: planSig,
                context,
                message: msg,
                pick: j.pick ?? "15",
              }),
            );
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && planReq.current === reqId) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, planSig, context]);

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

  // Choisir soi-même une durée doit changer le conseil : on ne veut pas lire
  // « je te propose 15 min » alors qu'on vient de cliquer sur 50.
  async function pickDuration(d: number) {
    setContext("desk");
    setDuration(d);
    durationSettled.current = true;
    appliedSig.current = planSig;
    manualPickSig.current = planSig;
    await fetchPlan({ chosen: d, ctx: "desk" });
  }

  function pickContext(ctx: "sortie" | "courses") {
    setContext(ctx);
    setPlan(null);
    durationSettled.current = true;
    appliedSig.current = planSig;
    // manualPickSig reste réservé au choix de durée bureau — ne pas bloquer le conseil courses/sortie.
  }

  async function fetchPlan(opts?: { chosen?: number; ctx?: SessionContext }) {
    const ctx = opts?.ctx ?? context;
    if (openThreads.length === 0) return;
    const reqId = ++planReq.current;
    setPlanLoading(true);
    if (ctx !== "desk") setPlan(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: openThreads,
          stats: planStats,
          chosen: opts?.chosen,
          context: ctx,
          meta: { name: settings.name },
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          message?: string;
          pick?: string;
          unreachable?: boolean;
        };
        if (planReq.current === reqId) {
          setPlanUnreachable(Boolean(j.unreachable));
          const msg = (j.message ?? "").trim();
          if (msg) {
            setPlan({
              message: msg,
              pick: opts?.chosen ? String(opts.chosen) : (j.pick ?? "15"),
            });
          }
        }
      }
    } catch {
      // on garde le conseil précédent
    } finally {
      if (planReq.current === reqId) setPlanLoading(false);
    }
  }

  async function sendPoint() {
    const t = pointText.trim();
    if (!t || pointBusy) return;
    setPointBusy(true);
    setPointText("");
    setPointNote("");
    // Parler ouvre la discussion : sans ça, la réponse arriverait dans le vide.
    setChatExpanded(true);

    const withUser: ChatMessage[] = [
      ...chat,
      { role: "user", content: t, at: new Date().toISOString() },
    ];
    setChat(withUser);
    writeChat(withUser);

    let answer = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          messages: withUser.map((m) => ({ role: m.role, content: m.content })),
          meta: { name: settings.name },
        }),
      });
      if (!res.ok || !res.body) throw new Error("chat");

      setChat([...withUser, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        setChat([...withUser, { role: "assistant", content: answer }]);
      }

      const full: ChatMessage[] = [
        ...withUser,
        { role: "assistant", content: answer, at: new Date().toISOString() },
      ];
      setChat(full);
      writeChat(full);
    } catch {
      // Ce champ sert aussi de capture : si l'IA est injoignable, ce qui vient
      // d'être écrit ne doit surtout pas disparaître dans le vide.
      keepAnyway(t);
      setChat(chat);
      writeChat(chat);
      setPointBusy(false);
      return;
    }

    setPointBusy(false);

    // Ce qui vient d'être dit peut changer les trucs (fait, reporté, nouveau) :
    // on réconcilie en arrière-plan, sans bloquer la conversation.
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          messages: [
            { role: "user", content: t },
            { role: "assistant", content: answer },
          ],
        }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as { updates?: unknown; note?: string };
      const before = snapshotThreads();
      const ops = parseThreadOps(j.updates, new Set(before.map((t) => t.id)));
      if (ops.length > 0) {
        applyThreadOps(ops);
        setPointUndo(before);
        setPointNote(j.note || "trucs mis à jour");
        window.setTimeout(() => {
          setPointNote("");
          setPointUndo(null);
        }, 10000);
      }
    } catch {
      // la discussion a eu lieu, c'est l'essentiel
    }
  }

  function keepAnyway(text: string) {
    add(text, "action");
    setPointNote("Noté tel quel (je n'ai pas pu joindre Élan).");
    window.setTimeout(() => setPointNote(""), 5000);
  }

  function resetChat() {
    clearChat();
    setChat([]);
    setPointNote("");
    setPointUndo(null);
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
        durationMin={context === "desk" ? duration : OUTDOOR_DURATION}
        context={context}
        name={settings.name}
        initial={resume}
        priorSessionsToday={sessionsToday(sessions)}
        onEnd={endSession}
      />
    );
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
        <span className="text-sm capitalize text-muted">{today}</span>
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

            {/* La durée est au-dessus du conseil : c'est elle qui le
                détermine, la lire après serait lire l'effet avant la cause. */}
            <div className="mt-4 flex items-center gap-2">
              <SessionPick
                duration={duration}
                context={context}
                onPickDuration={pickDuration}
                onPickContext={pickContext}
              />
            </div>

            {open > 0 ? (
              <div className="mt-3 rounded-xl border border-teal-soft bg-teal-soft/50 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full bg-teal ${planLoading ? "animate-breathe" : ""}`}
                  />
                  <span className="text-xs font-medium tracking-wide text-teal">
                    {planLoading
                      ? context === "desk"
                        ? "Élan réfléchit à ce format…"
                        : "Élan regarde ce qu'il y a dehors…"
                      : context === "desk"
                        ? "Élan te conseille pour aujourd'hui"
                        : context === "sortie"
                          ? "Élan pour ta sortie"
                          : "Élan pour tes courses"}
                  </span>
                </div>
                {/* Pendant le recalcul on masque l'ancien conseil : le laisser
                    affiché ferait lire un texte qui ne correspond plus à la
                    durée sélectionnée. */}
                {planLoading ? (
                  <div className="flex flex-col gap-1.5 py-0.5">
                    <span className="h-3 w-4/5 animate-pulse rounded bg-teal/15" />
                    <span className="h-3 w-3/5 animate-pulse rounded bg-teal/15" />
                  </div>
                ) : plan?.message ? (
                  <p className="animate-rise text-[15px] leading-relaxed text-teal-ink">
                    {plan.message}
                  </p>
                ) : planUnreachable ? (
                  <p className="text-[15px] leading-relaxed text-amber">
                    Je n&apos;arrive pas à joindre Élan pour le moment. Tes
                    trucs sont bien là — tu peux quand même lancer un créneau.
                  </p>
                ) : (
                  <p className="text-[15px] leading-relaxed text-teal-ink">
                    {planFallbackMessage(context)}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Rien qui presse aujourd&apos;hui. Présente-toi si tu veux faire
                le point, ou dépose ce qui te trotte en tête.
              </p>
            )}

            <button
              onClick={startFresh}
              className="mt-5 w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink"
            >
              Commencer la séance
            </button>
          </>
        )}
      </section>

      {/* Une seule entrée : déposer, donner des nouvelles, ou les deux à la
          fois. Séparer les deux n'avait pas de sens — c'est la même phrase
          qu'on écrit, et /api/reconcile sait déjà créer autant que mettre
          à jour. */}
      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-sm font-medium text-muted">
            {isNewcomer
              ? "Vide ta tête — dépose tout ce qui traîne."
              : "Quoi de neuf ? Dépose, raconte, ou demande-moi."}
          </h2>
          {chat.length > 0 && (
            <div className="flex shrink-0 items-baseline gap-3">
              <button
                onClick={() => setChatExpanded((v) => !v)}
                className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
              >
                {chatExpanded
                  ? "masquer"
                  : `${chat.length} message${chat.length > 1 ? "s" : ""}`}
              </button>
              {chatExpanded && (
                <button
                  onClick={resetChat}
                  className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
                >
                  effacer
                </button>
              )}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-line px-1 py-0.5">
          {chatExpanded && chat.length > 0 && (
            <div className="max-h-80 overflow-y-auto px-2 pb-2 pt-2">
              <div className="flex flex-col gap-2.5">
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user" ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sink px-3.5 py-2 text-[15px] leading-relaxed text-ink"
                          : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-teal-soft/50 px-3.5 py-2 text-[15px] leading-relaxed text-teal-ink"
                      }
                    >
                      {m.content ||
                        (pointBusy ? (
                          <span className="inline-flex gap-1 py-1">
                            <Dot /> <Dot /> <Dot />
                          </span>
                        ) : null)}
                    </div>
                  </div>
                ))}
              </div>
              <div ref={chatEndRef} />
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={pointText}
              autoFocus={isNewcomer}
              onChange={(e) => setPointText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendPoint();
                }
              }}
              rows={1}
              placeholder={
                isNewcomer
                  ? "ex. relancer Paul pour le devis"
                  : "ex. j'ai appelé le dentiste · on s'organise comment demain ?"
              }
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-xl bg-transparent px-3 py-3 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
            />
            <button
              onClick={sendPoint}
              disabled={!pointText.trim() || pointBusy}
              className="mb-0.5 shrink-0 rounded-xl bg-teal px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
            >
              {pointBusy ? "…" : "Envoyer"}
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
        <BacklogPeek
          open={open}
          actions={openActions}
          suivis={openSuivis}
          ready={ready}
        />
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

function BacklogPeek({
  open,
  actions,
  suivis,
  ready,
}: {
  open: number;
  actions: number;
  suivis: number;
  ready: boolean;
}) {
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
          <b className="font-display text-lg">{actions}</b>{" "}
          {actions > 1 ? "trucs à faire" : "truc à faire"}
          {suivis > 0 && (
            <>
              {" "}
              · <b className="font-display text-lg">{suivis}</b> à suivre
            </>
          )}
          .
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

function SessionPick({
  duration,
  context,
  onPickDuration,
  onPickContext,
}: {
  duration: number;
  context: SessionContext;
  onPickDuration: (d: number) => void;
  onPickContext: (c: "sortie" | "courses") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl bg-sink p-1">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => onPickDuration(d)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              context === "desk" && duration === d
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {d} min
          </button>
        ))}
      </div>
      <span className="text-xs text-faint">·</span>
      <div className="inline-flex rounded-xl bg-sink p-1">
        {(
          [
            { id: "sortie" as const, label: "Sortie" },
            { id: "courses" as const, label: "Courses" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPickContext(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              context === id
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
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

function Dot() {
  return (
    <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-teal/50" />
  );
}

function Logo() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal">
      <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-white" />
    </span>
  );
}
