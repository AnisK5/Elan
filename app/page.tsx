"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, SessionContext, Thread } from "@/lib/types";
import {
  applyThreadOps,
  clearActiveSession,
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
import InstallPrompt from "@/components/InstallPrompt";
import RitualNotify from "@/components/RitualNotify";
import SettingsSheet from "@/components/SettingsSheet";
import { useRitualReminder } from "@/components/useRitualReminder";
import { isNotifyPromptDismissed, buildOfflinePlanHint } from "@/lib/notifications";
import { isDiagnosticEnabled } from "@/lib/diagnostic";
import { buildPlanViewSnapshot } from "@/lib/plan-candidates";
import PlanDiagnostic, {
  type PlanDiagnosticData,
} from "@/components/PlanDiagnostic";
import Welcome from "@/components/Welcome";
import HelpButton from "@/components/HelpButton";
import BacklogPeek from "@/components/home/BacklogPeek";
import SessionPick from "@/components/home/SessionPick";
import ChatBubble from "@/components/home/ChatBubble";
import WeekMomentum from "@/components/home/WeekMomentum";
import { greeting, Logo } from "@/components/home/Branding";
import { useAuth } from "@/components/AuthProvider";
import { parseThreadOps } from "@/lib/ops";
import { doneCountsThisWeek, completionAt } from "@/lib/week-stats";
import { sessionsToday } from "@/lib/session-memory";
import { apiFetch, anthropicFailMessage, parseStreamError } from "@/lib/anthropic";
import {
  normalizeDuration,
  OUTDOOR_DURATION,
  PLAN_VERSION,
  RESUME_MAX_AGE_MS,
} from "@/lib/constants";
import { AssistantSpeech } from "@/components/HighlightEncart";
import { DEPOSER_PLAN_MESSAGE } from "@/lib/session-mode";
import { trucLabels } from "@/lib/emphasize-truc";
import {
  backlogCounts,
  hasReguliersContainer,
} from "@/lib/entretiens";
import {
  readRitualLaunch,
  RITUAL_SW_MESSAGE,
  stashRitualLaunch,
  type RitualLaunch,
} from "@/lib/ritual-pending";

// Écran d'accueil — orchestration UI. Doc : docs/GUIDE.md

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
  const [diagnosticOn, setDiagnosticOn] = useState(false);
  const [planDiag, setPlanDiag] = useState<PlanDiagnosticData | null>(null);
  const appliedSig = useRef("");
  // Deux sources écrivent le conseil : la reco automatique et le choix manuel
  // de durée. Sans numéro de série, une réponse lente écrase une réponse
  // récente — d'où un conseil calibré sur 15 alors qu'on vient de cliquer 30.
  const planReq = useRef(0);
  const planCtxRef = useRef<SessionContext>("desk");
  // Une fois qu'on a choisi soi-même pour ce backlog, la reco générique n'a
  // plus le droit de reprendre la main.
  const manualPickSig = useRef("");
  const [wrapUpCount, setWrapUpCount] = useState(0);
  const sessionStartRef = useRef("");
  const [ritualBrief, setRitualBrief] = useState<{ message: string } | null>(
    null,
  );
  /** Conseil visible au clic — plus fiable que le state pour l'ouverture. */
  const sessionBriefRef = useRef<string | null>(null);
  /** Bloque le plan auto tant que l'ouverture vient de la notif matin. */
  const ritualLockRef = useRef(false);

  // Discussion libre hors séance : déposer, donner des nouvelles, réfléchir
  // à un truc, demander comment s'organiser demain.
  const [pointText, setPointText] = useState("");
  const [pointBusy, setPointBusy] = useState(false);
  const [pointNote, setPointNote] = useState("");
  const [pointError, setPointError] = useState("");
  const lastPointRef = useRef("");
  const [pointUndo, setPointUndo] = useState<Thread[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  useEffect(() => setChat(readChat()), []);

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
    sessionBriefRef.current = null;
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

  const { open, openActions, openSuivis } = useMemo(
    () => backlogCounts(openThreads, new Date(dayStart)),
    [openThreads, dayStart],
  );

  const showPlanBlock =
    open > 0 || context !== "desk" || hasReguliersContainer(openThreads);

  const trucs = useMemo(() => trucLabels(threads), [threads]);

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

  useEffect(() => {
    setDiagnosticOn(isDiagnosticEnabled());
    function onDiag(e: Event) {
      const on = Boolean((e as CustomEvent<{ on: boolean }>).detail?.on);
      setDiagnosticOn(on);
      if (!on) setPlanDiag(null);
    }
    window.addEventListener("elan-diagnostic", onDiag);
    return () => window.removeEventListener("elan-diagnostic", onDiag);
  }, []);

  // Premier lancement : jamais rien déposé ET jamais fait de séance.
  const isNewcomer = ready && threads.length === 0 && sessions.length === 0;

  const showNotifyPrompt =
    ready &&
    !isNewcomer &&
    sessions.length > 0 &&
    (!isNotifyPromptDismissed() || Boolean(settings.notifyEnabled));

  useRitualReminder({
    enabled: Boolean(settings.notifyEnabled),
    notifyTime: settings.notifyTime,
    notifyTimezone: settings.notifyTimezone,
    ready,
    view,
    threads,
    sessions,
    planStats,
    name: settings.name,
  });

  function applyPick(pick: string, sig: string) {
    if (appliedSig.current === sig || context !== "desk") return;
    appliedSig.current = sig;
    durationSettled.current = true;
    const n = Number(pick);
    setDuration(normalizeDuration(n));
  }

  function planFallbackMessage(ctx: SessionContext): string {
    if (ctx === "courses") {
      return "On part sur les courses — ta liste t'attend en séance.";
    }
    if (ctx === "sortie") {
      return "On regarde ce qui se fait dehors sur ton trajet.";
    }
    if (ctx === "regulier") {
      return "Loyer, URSSAF, draps… on regarde ce qui revient — un pas à la fois.";
    }
    if (ctx === "deposer") {
      return DEPOSER_PLAN_MESSAGE;
    }
    return "Présente-toi et je prends le pouls de tout ça avec toi, un pas à la fois.";
  }

  // Mise en cache par jour + signature du backlog pour ne pas rappeler l'IA sans raison.
  useEffect(() => {
    if (!ready || view !== "home" || ritualLockRef.current) return;
    if (context === "deposer") {
      planCtxRef.current = "deposer";
      planReq.current += 1;
      setPlan({ message: DEPOSER_PLAN_MESSAGE, pick: "15" });
      setPlanLoading(false);
      return;
    }
    if (openThreads.length === 0 && context === "desk") {
      setPlan(null);
      return;
    }
    const dateKey = new Date().toDateString();
    const wantDebug = diagnosticOn;
    try {
      const raw = localStorage.getItem("elan.plan.v1");
      const c = raw ? JSON.parse(raw) : null;
      if (
        !wantDebug &&
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
    apiFetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threads: openThreads,
        stats: planStats,
        context,
        meta: { name: settings.name },
        ...(wantDebug ? { debug: true } : {}),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (planReq.current !== reqId || planCtxRef.current !== context) return;
        const msg = (j?.message ?? "").trim();
        setPlanUnreachable(Boolean(j?.unreachable) || !msg);
        if (msg) {
          setPlan({ message: msg, pick: j?.pick ?? "15" });
          if (manualPickSig.current !== planSig) {
            applyPick(j?.pick ?? "15", planSig);
          }
          if (wantDebug) {
            const view =
              j?.debug &&
              Array.isArray(j.debug.candidates) &&
              Array.isArray(j.debug.waiting)
                ? {
                    candidates: j.debug.candidates as string[],
                    waiting: j.debug.waiting as string[],
                  }
                : buildPlanViewSnapshot(openThreads);
            setPlanDiag({
              view,
              why: typeof j?.debug?.why === "string" ? j.debug.why : undefined,
              system:
                typeof j?.debug?.system === "string"
                  ? j.debug.system
                  : undefined,
              user:
                typeof j?.debug?.user === "string" ? j.debug.user : undefined,
              source: "api",
              message: msg,
              pick: j?.pick ?? "15",
            });
          } else {
            setPlanDiag(null);
          }
        } else {
          const hint = buildOfflinePlanHint(openThreads, duration);
          setPlan(hint);
          if (manualPickSig.current !== planSig) {
            applyPick(hint.pick, planSig);
          }
          if (wantDebug) {
            setPlanDiag({
              view: buildPlanViewSnapshot(openThreads),
              source: "offline",
              message: hint.message,
              pick: hint.pick,
            });
          }
        }
        try {
          if (msg && !wantDebug) {
            localStorage.setItem(
              "elan.plan.v1",
              JSON.stringify({
                v: PLAN_VERSION,
                date: dateKey,
                sig: planSig,
                context,
                message: msg,
                pick: j?.pick ?? "15",
              }),
            );
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (planReq.current !== reqId || planCtxRef.current !== context) return;
        setPlanUnreachable(true);
        const hint = buildOfflinePlanHint(openThreads, duration);
        setPlan(hint);
        if (wantDebug) {
          setPlanDiag({
            view: buildPlanViewSnapshot(openThreads),
            source: "offline",
            message: hint.message,
            pick: hint.pick,
          });
        }
      })
      .finally(() => {
        if (!cancelled && planReq.current === reqId) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, planSig, context, diagnosticOn]);

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
    setContext("desk");
    planCtxRef.current = "desk";
    setView("home");
    setRitualBrief(null);
    sessionBriefRef.current = null;
    ritualLockRef.current = false;
    setWrapUpCount(count);
    setWrapUp(true);
    setTimeout(() => setWrapUp(false), 6000);
  }

  function startFresh(opts?: { brief?: string | null }) {
    clearActiveSession();
    setResume(null);
    sessionStartRef.current = new Date().toISOString();
    // Le texte AFFICHÉ sur la carte, pas un brief de notif resté en mémoire.
    const msg =
      opts && "brief" in opts
        ? (opts.brief?.trim() ?? "")
        : (plan?.message ?? "").trim();
    sessionBriefRef.current = msg || null;
    setRitualBrief(msg ? { message: msg } : null);
    setView("session");
  }

  // Choisir soi-même une durée doit changer le conseil : on ne veut pas lire
  // « je te propose 15 min » alors qu'on vient de cliquer sur 50.
  async function pickDuration(d: number) {
    ritualLockRef.current = false;
    setRitualBrief(null);
    planCtxRef.current = "desk";
    setContext("desk");
    setDuration(d);
    durationSettled.current = true;
    appliedSig.current = planSig;
    manualPickSig.current = planSig;
    await fetchPlan({ chosen: d, ctx: "desk" });
  }

  function startDeposer() {
    ritualLockRef.current = false;
    setContext("deposer");
    setDuration(OUTDOOR_DURATION);
    durationSettled.current = true;
    startFresh({ brief: null });
  }

  function pickContext(ctx: "sortie" | "courses" | "regulier" | "deposer") {
    planCtxRef.current = ctx;
    planReq.current += 1;
    setContext(ctx);
    durationSettled.current = true;
    appliedSig.current = planSig;
    if (ctx === "deposer") {
      setPlan({ message: DEPOSER_PLAN_MESSAGE, pick: "15" });
      setPlanLoading(false);
      return;
    }
    setPlan(null);
    if (ctx === "regulier") {
      setDuration(15);
    }
    void fetchPlan({ ctx });
  }

  async function fetchPlan(opts?: { chosen?: number; ctx?: SessionContext }) {
    const ctx = opts?.ctx ?? context;
    planCtxRef.current = ctx;
    if (ctx === "deposer") {
      planReq.current += 1;
      setPlan({ message: DEPOSER_PLAN_MESSAGE, pick: "15" });
      setPlanLoading(false);
      return;
    }
    if (openThreads.length === 0 && ctx === "desk") return;
    const reqId = ++planReq.current;
    setPlanLoading(true);
    if (ctx !== "desk") setPlan(null);
    const wantDebug = isDiagnosticEnabled();
    try {
      const res = await apiFetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: openThreads,
          stats: planStats,
          chosen: opts?.chosen,
          context: ctx,
          meta: { name: settings.name },
          ...(wantDebug ? { debug: true } : {}),
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          message?: string;
          pick?: string;
          unreachable?: boolean;
          debug?: {
            candidates?: string[];
            waiting?: string[];
            why?: string;
            system?: string;
            user?: string;
          };
        };
        if (planReq.current === reqId && planCtxRef.current === ctx) {
          const msg = (j.message ?? "").trim();
          setPlanUnreachable(Boolean(j.unreachable) || !msg);
          if (msg) {
            const pick = opts?.chosen
              ? String(opts.chosen)
              : (j.pick ?? "15");
            setPlan({ message: msg, pick });
            if (wantDebug) {
              const view =
                j.debug &&
                Array.isArray(j.debug.candidates) &&
                Array.isArray(j.debug.waiting)
                  ? {
                      candidates: j.debug.candidates,
                      waiting: j.debug.waiting,
                    }
                  : buildPlanViewSnapshot(openThreads);
              setPlanDiag({
                view,
                why: j.debug?.why,
                system: j.debug?.system,
                user: j.debug?.user,
                source: "api",
                message: msg,
                pick,
              });
            }
          } else {
            const hint = buildOfflinePlanHint(
              openThreads,
              opts?.chosen ?? duration,
            );
            setPlan(hint);
            if (wantDebug) {
              setPlanDiag({
                view: buildPlanViewSnapshot(openThreads),
                source: "offline",
                message: hint.message,
                pick: hint.pick,
              });
            }
          }
        }
      } else if (planReq.current === reqId && planCtxRef.current === ctx) {
        setPlanUnreachable(true);
        const hint = buildOfflinePlanHint(
          openThreads,
          opts?.chosen ?? duration,
        );
        setPlan(hint);
        if (wantDebug) {
          setPlanDiag({
            view: buildPlanViewSnapshot(openThreads),
            source: "offline",
            message: hint.message,
            pick: hint.pick,
          });
        }
      }
    } catch {
      if (planReq.current === reqId && planCtxRef.current === ctx) {
        setPlanUnreachable(true);
        setPlan((prev) => prev ?? buildOfflinePlanHint(openThreads, opts?.chosen ?? duration));
      }
    } finally {
      if (planReq.current === reqId) setPlanLoading(false);
    }
  }

  function applyRitualLaunch(launch: RitualLaunch) {
    const d = normalizeDuration(launch.pick);
    ritualLockRef.current = true;
    stashRitualLaunch(launch);
    setContext("desk");
    setDuration(d);
    durationSettled.current = true;
    appliedSig.current = planSig;
    manualPickSig.current = planSig;
    const msg = launch.message.trim();
    setPlan({
      message: msg || `Ton créneau de ${d} min est prêt.`,
      pick: String(d),
    });
    if (msg) setRitualBrief({ message: msg });
    try {
      localStorage.setItem(
        "elan.plan.v1",
        JSON.stringify({
          v: PLAN_VERSION,
          date: new Date().toDateString(),
          sig: planSig,
          context: "desk",
          message: msg || `Ton créneau de ${d} min est prêt.`,
          pick: String(d),
        }),
      );
    } catch {
      // ignore
    }
  }

  // Clic notif : appliquer AVANT le plan auto (useLayoutEffect).
  useLayoutEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const launch = readRitualLaunch(window.location.search);
    if (!launch) return;
    applyRitualLaunch(launch);
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // App déjà ouverte (postMessage SW, surtout iOS).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onSwMessage(ev: MessageEvent) {
      const data = ev.data as {
        type?: string;
        pick?: string;
        planMessage?: string;
      };
      if (data?.type !== RITUAL_SW_MESSAGE) return;
      const pick = Number(data.pick ?? 15);
      if (!Number.isFinite(pick)) return;
      applyRitualLaunch({
        pick,
        message: (data.planMessage ?? "").trim(),
      });
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendPoint(retryText?: string) {
    const t = (retryText ?? pointText).trim();
    if (!t || pointBusy) return;
    setPointBusy(true);
    setPointError("");
    setPointText("");
    setPointNote("");
    lastPointRef.current = t;
    // La dernière réplique s'affiche dans la bulle ; on n'ouvre pas l'historique.

    const last = chat[chat.length - 1];
    const withUser: ChatMessage[] =
      retryText && last?.role === "user" && last.content === t
        ? chat
        : [
            ...chat,
            { role: "user", content: t, at: new Date().toISOString() },
          ];
    setChat(withUser);
    writeChat(withUser);

    let answer = "";
    let full: ChatMessage[] | null = null;
    try {
      const res = await apiFetch("/api/chat", {
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
        const { clean, kind } = parseStreamError(answer);
        if (kind) {
          setPointError(anthropicFailMessage(kind));
          setChat(withUser);
          writeChat(withUser);
          setPointBusy(false);
          return;
        }
        if (answer.includes("⟦elan-error")) continue;
        setChat([...withUser, { role: "assistant", content: clean }]);
      }

      const parsed = parseStreamError(answer);
      if (parsed.kind) {
        setPointError(anthropicFailMessage(parsed.kind));
        setChat(withUser);
        writeChat(withUser);
        setPointBusy(false);
        return;
      }

      full = [
        ...withUser,
        {
          role: "assistant",
          content: parsed.clean,
          at: new Date().toISOString(),
        },
      ];
      setChat(full);
      writeChat(full);
    } catch {
      keepAnyway(t);
      setPointError(anthropicFailMessage("unknown"));
      setChat(withUser);
      writeChat(withUser);
      setPointBusy(false);
      return;
    }

    setPointBusy(false);
    if (!full) return;

    try {
      const res = await apiFetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          messages: full.slice(-12).map((m) => ({
            role: m.role,
            content: m.content,
          })),
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
        ritualBrief={
          sessionBriefRef.current
            ? { message: sessionBriefRef.current }
            : ritualBrief
        }
        onEnd={endSession}
      />
    );
  }

  return (
    <>
    <main className={`mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 ${isNewcomer ? "pb-24" : "pb-32"}`}>
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm capitalize text-muted">{today}</span>
          <SettingsSheet
            threads={threads}
            planStats={planStats}
            onSignOut={signOut}
          />
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
              Vide ta tête.
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Un truc, dix trucs — comme ça vient. On range ensemble.
            </p>
            <button
              onClick={startDeposer}
              className="mt-5 w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink"
            >
              Déposer
            </button>
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

            {showPlanBlock ? (
              <div className="mt-3 rounded-xl border border-teal-soft bg-teal-soft/50 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full bg-teal ${planLoading ? "animate-breathe" : ""}`}
                  />
                  <span className="text-xs font-medium tracking-wide text-teal">
                    {planLoading
                      ? context === "desk"
                        ? "Élan réfléchit à ce format…"
                        : context === "regulier"
                          ? "Élan regarde tes réguliers…"
                          : context === "deposer"
                            ? "Élan t'attend…"
                            : "Élan regarde ce qu'il y a dehors…"
                      : context === "desk"
                        ? "Élan te conseille pour aujourd'hui"
                        : context === "sortie"
                          ? "Élan pour ta sortie"
                          : context === "regulier"
                            ? "Élan pour ton régulier"
                            : context === "deposer"
                              ? "Élan pour déposer"
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
                  <div className="animate-rise">
                    <AssistantSpeech
                      content={plan.message}
                      className="whitespace-pre-wrap text-[15px] leading-relaxed text-teal-ink"
                      trucs={trucs}
                    />
                  </div>
                ) : planUnreachable ? (
                  <p className="text-[15px] leading-relaxed text-amber">
                    Je n&apos;arrive pas à joindre Élan pour le moment. Tes
                    trucs sont bien là — tu peux quand même lancer un créneau.
                  </p>
                ) : (
                  <AssistantSpeech
                    content={planFallbackMessage(context)}
                    className="whitespace-pre-wrap text-[15px] leading-relaxed text-teal-ink"
                    trucs={trucs}
                  />
                )}
                {diagnosticOn && planDiag && !planLoading ? (
                  <PlanDiagnostic data={planDiag} />
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Rien qui presse aujourd&apos;hui. Présente-toi si tu veux faire
                le point, ou dépose ce qui te trotte en tête.
              </p>
            )}

            <button
              onClick={() =>
                context === "deposer" ? startDeposer() : startFresh()
              }
              disabled={planLoading && context !== "deposer"}
              className="mt-5 w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink disabled:opacity-50"
            >
              {context === "deposer" ? "Déposer" : "Commencer la séance"}
            </button>
          </>
        )}
      </section>

      {!isNewcomer && (
        <ChatBubble
          chat={chat}
          pointText={pointText}
          onPointText={setPointText}
          onSend={() => void sendPoint()}
          busy={pointBusy}
          error={pointError}
          onRetry={() => void sendPoint(lastPointRef.current)}
          note={pointNote}
          undo={pointUndo}
          onUndo={() => {
            if (!pointUndo) return;
            restoreThreads(pointUndo);
            setPointUndo(null);
            setPointNote("");
          }}
          onReset={resetChat}
          trucs={trucs}
        />
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
        <BacklogPeek
          open={open}
          actions={openActions}
          suivis={openSuivis}
          ready={ready}
        />
      </section>

      <InstallPrompt />

      <RitualNotify
        visible={showNotifyPrompt || wrapUp}
        threads={threads}
        planStats={planStats}
      />

      <footer className="mt-auto pt-10 text-center text-xs text-faint">
        Élan — pense à la séance, pas à la liste.
      </footer>
    </main>

    <HelpButton lift={!isNewcomer} />
    </>
  );
}
