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
  readSituation,
  writeSituation,
  readDayPlan,
  writeDayPlan,
  saveAcquisition,
  useSessions,
  useSettings,
  useThreads,
  type ActiveSession,
} from "@/lib/store";
import Session from "@/components/Session";
import AiDegradedBanner from "@/components/AiDegradedBanner";
import ByokFallbackNotice from "@/components/ByokFallbackNotice";
import EngagementPrompt from "@/components/EngagementPrompt";
import ProductSurveyPrompt from "@/components/ProductSurveyPrompt";
import SettingsSheet from "@/components/SettingsSheet";
import SessionPulseFeedback from "@/components/SessionPulseFeedback";
import { useRitualReminder } from "@/components/useRitualReminder";
import {
  buildOfflinePlanHint,
  isWebPushClientConfigured,
} from "@/lib/notifications";
import {
  markModalShownThisVisit,
  resolveEngagementPrompt,
  wasModalShownThisVisit,
  type EngagementPromptKind,
} from "@/lib/engagement-prompts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isDiagnosticEnabled } from "@/lib/diagnostic";
import { buildPlanViewSnapshot, planViewFromDebug } from "@/lib/plan-candidates";
import PlanDiagnostic, {
  type PlanDiagnosticData,
} from "@/components/PlanDiagnostic";
import Welcome from "@/components/Welcome";
import HelpButton from "@/components/HelpButton";
import AcquisitionPrompt, {
  needsAcquisitionPrompt,
  isAcquisitionResolved,
} from "@/components/AcquisitionPrompt";
import BacklogPeek from "@/components/home/BacklogPeek";
import SessionPick from "@/components/home/SessionPick";
import ChatBubble from "@/components/home/ChatBubble";
import UsageWeek from "@/components/home/UsageWeek";
import { greeting, Logo, welcomeLine } from "@/components/home/Branding";
import { useAuth } from "@/components/AuthProvider";
import { filterEffectiveOps, parseThreadOps } from "@/lib/ops";
import { extractSituationFromConvo, mergeSituation } from "@/lib/situation";
import { completionAt } from "@/lib/week-stats";
import { computeUsageWeek } from "@/lib/usage";
import {
  buildSignupMeta,
  captureAcquisitionFromUrl,
  dismissAcquisitionPrompt,
  readStoredAttribution,
  type AcquisitionInfo,
} from "@/lib/acquisition";
import { logUsage, startDwellTracker, useUsageEvents } from "@/lib/usage-log";
import { sessionsToday } from "@/lib/session-memory";
import { apiFetch, anthropicFailMessage, parseStreamError, type AnthropicFailKind } from "@/lib/anthropic";
import { aiRetryHint, reportAiFail, reportAiRecovered } from "@/lib/ai-fail-client";
import { probeAiRecovery } from "@/lib/ai-recovery-client";
import { needsWtpSurvey } from "@/lib/product-surveys";
import {
  normalizeDuration,
  OUTDOOR_DURATION,
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
import {
  dayPlanMatches,
  dayPlanPileMatches,
  isDayPlanContext,
  planDateKey,
  slotOf,
  upsertDayPlanSlot,
  whySignature,
  type DayPlanContext,
} from "@/lib/day-plan";

// Écran d'accueil — orchestration UI. Doc : docs/GUIDE.md

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const { threads, add, ready } = useThreads();
  const { log, sessions } = useSessions();
  const { settings } = useSettings();
  const usageEvents = useUsageEvents();

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
  const [planAiNote, setPlanAiNote] = useState("");
  const [liveAiKind, setLiveAiKind] = useState<AnthropicFailKind | null>(null);
  const [showWtpSurvey, setShowWtpSurvey] = useState(false);
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
  /** Après un pick "sortie" du conseil : ne pas recharger le plan Sortie. */
  const planSkipFetchRef = useRef(false);
  const skipPlanCacheOnceRef = useRef(false);
  const [planRecoveryTick, setPlanRecoveryTick] = useState(0);

  // Discussion libre hors séance : déposer, donner des nouvelles, réfléchir
  // à un truc, demander comment s'organiser demain.
  const [pointText, setPointText] = useState("");
  const [pointBusy, setPointBusy] = useState(false);
  const [pointNote, setPointNote] = useState("");
  const [pointError, setPointError] = useState("");
  const lastPointRef = useRef("");
  const pointNoteTimer = useRef(0);
  const [pointUndo, setPointUndo] = useState<Thread[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [situationText, setSituationText] = useState("");
  const [showAcquisition, setShowAcquisition] = useState(false);
  const [engagementPrompt, setEngagementPrompt] =
    useState<EngagementPromptKind | null>(null);
  const [hasPushSub, setHasPushSub] = useState<boolean | null>(null);
  const signupLogged = useRef(false);

  useEffect(() => {
    captureAcquisitionFromUrl();
    const sync = () => setChat(readChat());
    sync();
    const onCustom = (e: Event) => {
      const key = (e as CustomEvent).detail;
      if (key === "elan.chat.v1" || key === "elan.settings.v1") sync();
    };
    window.addEventListener("elan:sync", onCustom);
    return () => window.removeEventListener("elan:sync", onCustom);
  }, []);

  useEffect(() => {
    function onAiRecovered() {
      setLiveAiKind(null);
      setPlanAiNote("");
      setPlanUnreachable(false);
      skipPlanCacheOnceRef.current = true;
      setPlanRecoveryTick((t) => t + 1);
    }
    window.addEventListener("elan:ai-recovered", onAiRecovered);
    function onDismiss() {
      setLiveAiKind(null);
      setPlanAiNote("");
    }
    window.addEventListener("elan:ai-dismiss", onDismiss);
    return () => {
      window.removeEventListener("elan:ai-recovered", onAiRecovered);
      window.removeEventListener("elan:ai-dismiss", onDismiss);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void probeAiRecovery({ force: true });
  }, [ready]);

  useEffect(() => {
    setSituationText(
      readSituation()?.text ?? settings.situation ?? "",
    );
  }, [ready, settings.situation]);
  useEffect(() => {
    const s = extractSituationFromConvo(chat);
    if (!s) return;
    writeSituation(mergeSituation(readSituation(), s));
    setSituationText(readSituation()?.text ?? s.text);
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

  // Reprise d'une séance laissée en cours — bannière sur l'accueil, pas d'entrée auto.
  useEffect(() => {
    const a = readActiveSession();
    if (!a || a.messages.length === 0) return;
    const startedMs = Date.parse(a.startedAt);
    const fresh =
      Number.isFinite(startedMs) &&
      Date.now() - startedMs < RESUME_MAX_AGE_MS;
    if (!fresh) {
      if (a.messages.length > 1) {
        saveSessionRecord(a.messages.filter((m) => m.content.trim()), {
          sessionId: a.sessionId,
          startedAt: a.startedAt,
          durationMin: a.durationMin,
          sessionContext: a.context,
        });
      }
      clearActiveSession();
      return;
    }
    setResume(a);
    setDuration(a.durationMin);
    setContext(a.context ?? "desk");
    sessionStartRef.current = a.startedAt;
    sessionBriefRef.current = null;
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

  const usageWeek = useMemo(
    () => computeUsageWeek(usageEvents, sessions, threads, dayStart),
    [usageEvents, sessions, threads, dayStart],
  );
  const away = /pas chez|à vienne/i.test(situationText);

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
    () => whySignature(openThreads, situationText),
    [openThreads, situationText],
  );

  function cachedPlanSlot(ctx: SessionContext) {
    const dateKey = planDateKey();
    const cached = readDayPlan();
    if (!cached || !isDayPlanContext(ctx)) return null;
    if (
      dayPlanMatches(cached, planSig, dateKey) ||
      dayPlanPileMatches(cached, openThreads, dateKey)
    ) {
      return slotOf(cached, ctx);
    }
    return null;
  }

  function persistPlanSlot(
    ctx: DayPlanContext,
    slot: { why: string; message: string; pick: string },
  ) {
    writeDayPlan(
      upsertDayPlanSlot(readDayPlan(), planSig, ctx, slot, planDateKey()),
    );
  }

  useEffect(() => {
    if (!ready) return;
    logUsage("open", { userId: user?.id ?? null });
    if (user?.created_at && user.id && !signupLogged.current) {
      const hours =
        (Date.now() - Date.parse(user.created_at)) / 3_600_000;
      if (hours < 24) {
        signupLogged.current = true;
        const attribution = readStoredAttribution();
        const provider =
          (user.app_metadata?.provider as string | undefined) ??
          (user.identities?.[0]?.provider as string | undefined);
        logUsage("signup", {
          userId: user.id,
          meta: buildSignupMeta(attribution, provider),
        });
        if (attribution && !settings.acquisition?.attribution) {
          saveAcquisition({
            ...(settings.acquisition ?? {}),
            attribution,
          });
        }
      }
    }
    return startDwellTracker(user?.id ?? null);
  }, [ready, user?.id, user?.created_at, settings.acquisition]);

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
  const showChat = ready && (threads.length > 0 || sessions.length > 0);

  useEffect(() => {
    if (!ready || !user) return;
    if (!needsAcquisitionPrompt(settings.acquisition)) return;
    setShowAcquisition(true);
  }, [ready, user, settings.acquisition]);

  function submitAcquisition(channel: string, detail?: string) {
    const next: AcquisitionInfo = {
      ...(settings.acquisition ?? {}),
      attribution: settings.acquisition?.attribution ?? readStoredAttribution() ?? undefined,
      survey: {
        channel,
        detail,
        answeredAt: new Date().toISOString(),
      },
    };
    saveAcquisition(next);
    markModalShownThisVisit();
    setShowAcquisition(false);
  }

  function dismissAcquisition() {
    dismissAcquisitionPrompt(90);
    markModalShownThisVisit();
    setShowAcquisition(false);
  }

  const pushReady =
    isWebPushClientConfigured() && isSupabaseConfigured();

  useEffect(() => {
    if (!pushReady || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setHasPushSub(false);
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setHasPushSub(!!sub);
      })
      .catch(() => {
        if (!cancelled) setHasPushSub(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pushReady, settings.notifyEnabled]);

  useEffect(() => {
    if (!ready || !user || showAcquisition) {
      setEngagementPrompt(null);
      return;
    }
    setEngagementPrompt(
      resolveEngagementPrompt({
        acquisition: settings.acquisition,
        modalShownThisVisit: wasModalShownThisVisit(),
        sessionsCount: sessions.length,
        threadsCount: threads.length,
        settings,
        pushReady,
        hasPushSub,
      }),
    );
  }, [
    ready,
    user,
    showAcquisition,
    sessions.length,
    threads.length,
    settings,
    settings.acquisition,
    pushReady,
    hasPushSub,
  ]);

  useEffect(() => {
    if (!ready || !user || showAcquisition || engagementPrompt) {
      setShowWtpSurvey(false);
      return;
    }
    setShowWtpSurvey(
      needsWtpSurvey({
        sessionsCount: sessions.length,
        modalShownThisVisit: wasModalShownThisVisit(),
        acquisitionResolved: isAcquisitionResolved(settings.acquisition),
      }),
    );
  }, [
    ready,
    user,
    showAcquisition,
    engagementPrompt,
    sessions.length,
    settings.acquisition,
  ]);

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
    if (appliedSig.current === sig) return;
    if (pick === "sortie") {
      appliedSig.current = sig;
      durationSettled.current = true;
      planSkipFetchRef.current = true;
      planCtxRef.current = "sortie";
      setContext("sortie");
      return;
    }
    if (context !== "desk") return;
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

  // Cache jour + signature pile/cadre — pas de nouvel arbitrage si why encore valide.
  useEffect(() => {
    if (!ready || view !== "home" || ritualLockRef.current) return;
    if (planSkipFetchRef.current) {
      planSkipFetchRef.current = false;
      return;
    }
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
    const wantDebug = diagnosticOn;
    const skipCache = skipPlanCacheOnceRef.current;
    if (skipCache) skipPlanCacheOnceRef.current = false;
    if (!wantDebug && !skipCache && isDayPlanContext(context)) {
      const slot = cachedPlanSlot(context);
      if (slot) {
        if (manualPickSig.current === planSig) return;
        setPlan({ message: slot.message, pick: slot.pick });
        applyPick(slot.pick, planSig);
        return;
      }
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
        meta: { name: settings.name, situation: situationText || undefined },
        messages: chat.slice(-16).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(wantDebug ? { debug: true } : {}),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (planReq.current !== reqId || planCtxRef.current !== context) return;
        const msg = (j?.message ?? "").trim();
        const unreachable = Boolean(j?.unreachable) || !msg;
        setPlanUnreachable(unreachable);
        const errorKind = j?.errorKind as AnthropicFailKind | undefined;
        if (errorKind) {
          reportAiFail(errorKind);
          setLiveAiKind(errorKind);
        } else if (!unreachable) {
          reportAiRecovered();
          setLiveAiKind(null);
          setPlanAiNote("");
        }
        setPlanAiNote(
          unreachable && errorKind ? anthropicFailMessage(errorKind) : "",
        );
        // Même en cas d'échec Claude, on garde un conseil concret (serveur ou
        // secours local) pour pouvoir lancer la séance sans attendre.
        const pick = j?.pick ?? "15";
        const effective = msg
          ? { message: msg, pick }
          : buildOfflinePlanHint(openThreads, duration);
        setPlan(effective);
        if (manualPickSig.current !== planSig) {
          applyPick(effective.pick, planSig);
        }
        if (msg && !unreachable) {
          const why = (j?.why ?? "").trim();
          if (
            why &&
            !wantDebug &&
            isDayPlanContext(context)
          ) {
            persistPlanSlot(context, {
              why,
              message: msg,
              pick: effective.pick,
            });
          }
        }
        if (wantDebug) {
          const view =
            (j?.debug && planViewFromDebug(j.debug)) ||
            buildPlanViewSnapshot(openThreads);
          setPlanDiag({
            view,
            why: typeof j?.debug?.why === "string" ? j.debug.why : (j?.why ?? ""),
            system:
              typeof j?.debug?.system === "string"
                ? j.debug.system
                : undefined,
            user:
              typeof j?.debug?.user === "string" ? j.debug.user : undefined,
            source: j ? "api" : "offline",
            message: effective.message,
            pick: effective.pick,
          });
        } else {
          setPlanDiag(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (planReq.current !== reqId || planCtxRef.current !== context) return;
        setPlanUnreachable(true);
        setPlanAiNote("");
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
      })
      .finally(() => {
        if (!cancelled && planReq.current === reqId) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, planSig, context, diagnosticOn, planRecoveryTick]);

  function saveSessionRecord(
    transcript: ChatMessage[],
    opts: {
      sessionId?: string;
      startedAt?: string;
      durationMin?: number;
      sessionContext?: SessionContext;
    } = {},
  ) {
    if (transcript.length <= 1) return;
    const started = Date.parse(opts.startedAt ?? sessionStartRef.current);
    const elapsedMin = Number.isFinite(started)
      ? Math.max(1, Math.round((Date.now() - started) / 60_000))
      : (opts.durationMin ?? duration);
    log({
      id: opts.sessionId ?? newId(),
      date: new Date().toISOString(),
      durationMin: elapsedMin,
      transcript,
      context: opts.sessionContext ?? context,
    });
    logUsage("session", {
      durationSec: elapsedMin * 60,
      userId: user?.id ?? null,
    });
  }

  function endSession(transcript: ChatMessage[], sessionId?: string) {
    saveSessionRecord(transcript, { sessionId });
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
    // Le texte AFFICHÉ sur la carte (y compris conseil de secours si Claude
    // n'a pas répondu) — pas un brief de notif resté en mémoire.
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
    planSkipFetchRef.current = true;
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
    const cached = cachedPlanSlot(ctx);
    const phraseWhy =
      !wantDebug &&
      opts?.chosen &&
      cached?.why &&
      isDayPlanContext(ctx)
        ? cached.why
        : undefined;
    try {
      const res = await apiFetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: openThreads,
          stats: planStats,
          chosen: opts?.chosen,
          context: ctx,
          meta: { name: settings.name, situation: situationText || undefined },
          messages: chat.slice(-16).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(phraseWhy ? { why: phraseWhy } : {}),
          ...(wantDebug ? { debug: true } : {}),
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          message?: string;
          pick?: string;
          why?: string;
          unreachable?: boolean;
          errorKind?: AnthropicFailKind;
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
          const unreachable = Boolean(j.unreachable) || !msg;
          setPlanUnreachable(unreachable);
          if (j.errorKind) {
            reportAiFail(j.errorKind);
            setLiveAiKind(j.errorKind);
          } else if (!unreachable) {
            reportAiRecovered();
            setLiveAiKind(null);
            setPlanAiNote("");
          }
          setPlanAiNote(
            unreachable && j.errorKind
              ? anthropicFailMessage(j.errorKind)
              : "",
          );
          const pick = opts?.chosen
            ? String(opts.chosen)
            : (j.pick ?? "15");
          const effective = msg
            ? { message: msg, pick }
            : buildOfflinePlanHint(
                openThreads,
                opts?.chosen ?? duration,
              );
          setPlan(effective);
          if (msg && !unreachable) {
            const why = (j.why ?? cached?.why ?? "").trim();
            if (why && !wantDebug && isDayPlanContext(ctx)) {
              persistPlanSlot(ctx, {
                why,
                message: msg,
                pick: effective.pick,
              });
            }
          }
          if (wantDebug) {
            const view =
              (j.debug && planViewFromDebug(j.debug)) ||
              buildPlanViewSnapshot(openThreads);
            setPlanDiag({
              view,
              why: j.debug?.why ?? (j.why ?? ""),
              system: j.debug?.system,
              user: j.debug?.user,
              source: "api",
              message: effective.message,
              pick: effective.pick,
            });
          }
        }
      } else if (planReq.current === reqId && planCtxRef.current === ctx) {
        setPlanUnreachable(true);
        setPlanAiNote("");
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
        setPlanAiNote("");
        setPlan(
          (prev) =>
            prev ??
            buildOfflinePlanHint(openThreads, opts?.chosen ?? duration),
        );
        if (wantDebug) {
          setPlanDiag({
            view: buildPlanViewSnapshot(openThreads),
            source: "offline",
            message: "",
            pick: "15",
          });
        }
      }
    } finally {
      if (planReq.current === reqId) setPlanLoading(false);
    }
  }

  function applyRitualLaunch(launch: RitualLaunch) {
    const ctx = launch.context ?? "desk";
    const d = ctx === "sortie" ? OUTDOOR_DURATION : normalizeDuration(launch.pick);
    const pick = ctx === "sortie" ? "sortie" : String(d);
    const fallback =
      ctx === "sortie"
        ? "Je te propose une Sortie — on regarde ce qui se fait dehors."
        : `Ton créneau de ${d} min est prêt.`;
    logUsage("ritual", { userId: user?.id ?? null });
    ritualLockRef.current = true;
    stashRitualLaunch(launch);
    planSkipFetchRef.current = true;
    planCtxRef.current = ctx;
    setContext(ctx);
    setDuration(d);
    durationSettled.current = true;
    appliedSig.current = planSig;
    manualPickSig.current = planSig;
    const stored = isDayPlanContext(ctx) ? cachedPlanSlot(ctx) : null;
    const msg = stored?.message.trim() || launch.message.trim() || fallback;
    setPlan({ message: msg, pick: stored?.pick ?? pick });
    if (msg) setRitualBrief({ message: msg });
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

  function showPointNote(text: string, undo: Thread[] | null) {
    window.clearTimeout(pointNoteTimer.current);
    setPointNote(text);
    setPointUndo(undo);
    pointNoteTimer.current = window.setTimeout(() => {
      setPointNote("");
      setPointUndo(null);
    }, 10000);
  }

  async function applyReconcile(messages: ChatMessage[]): Promise<boolean> {
    try {
      const prevSit = readSituation();
      const res = await apiFetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          // Assez de contexte pour le greffier, sans ruminer tout le fil.
          messages: messages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          situation: prevSit?.text ?? null,
        }),
      });
      if (!res.ok) return false;
      const j = (await res.json()) as {
        updates?: unknown;
        note?: string;
        situation?: string;
      };
      const extracted = extractSituationFromConvo(messages.slice(-4));
      const fromApi = j.situation?.trim()
        ? { text: j.situation.trim() }
        : null;
      const sit = mergeSituation(extracted, fromApi);
      const sitChanged = Boolean(
        sit && sit.text.trim() !== (prevSit?.text ?? "").trim(),
      );
      if (sitChanged && sit) {
        writeSituation(sit);
        setSituationText(sit.text);
      }
      const before = snapshotThreads();
      const ops = filterEffectiveOps(
        before,
        parseThreadOps(
          j.updates,
          new Set(before.map((t) => t.id)),
          before,
        ),
      );
      if (ops.length === 0) {
        if (sitChanged) {
          showPointNote(j.note || "c'est noté", null);
          return true;
        }
        return false;
      }
      applyThreadOps(ops);
      showPointNote(j.note || "trucs mis à jour", before);
      return true;
    } catch {
      return false;
    }
  }

  async function sendPoint(retryText?: string) {
    const t = (retryText ?? pointText).trim();
    if (!t || pointBusy) return;
    setPointBusy(true);
    setPointError("");
    setPointText("");
    window.clearTimeout(pointNoteTimer.current);
    setPointNote("");
    setPointUndo(null);
    lastPointRef.current = t;
    logUsage("aside", { userId: user?.id ?? null });

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

    // Ranger tout de suite : n'attend pas la réplique d'Élan.
    const clerkP = applyReconcile(withUser);

    let answer = "";
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: snapshotThreads(),
          messages: withUser.map((m) => ({ role: m.role, content: m.content })),
          meta: {
            name: settings.name,
            situation: situationText || undefined,
            exchangeIndex: withUser.filter((m) => m.role === "user").length,
          },
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
          reportAiFail(kind);
          setLiveAiKind(kind);
          setPointError(anthropicFailMessage(kind));
          setChat(withUser);
          writeChat(withUser);
          setPointBusy(false);
          const wrote = await clerkP;
          if (!wrote) keepAnyway(t);
          return;
        }
        if (answer.includes("⟦elan-error")) continue;
        setChat([...withUser, { role: "assistant", content: clean }]);
      }

      const parsed = parseStreamError(answer);
      if (parsed.kind) {
        reportAiFail(parsed.kind);
        setLiveAiKind(parsed.kind);
        setPointError(anthropicFailMessage(parsed.kind));
        setChat(withUser);
        writeChat(withUser);
        setPointBusy(false);
        const wrote = await clerkP;
        if (!wrote) keepAnyway(t);
        return;
      }

      const full: ChatMessage[] = [
        ...withUser,
        {
          role: "assistant",
          content: parsed.clean,
          at: new Date().toISOString(),
        },
      ];
      setChat(full);
      writeChat(full);
      reportAiRecovered();
      setLiveAiKind(null);
      setPointBusy(false);
      const wrote = await clerkP;
      // Seconde passe : le greffier a vu le message, pas encore la réplique.
      // Si rien n'a bougé, on relit l'échange entier (comme en séance).
      if (!wrote) await applyReconcile(full);
      return;
    } catch {
      const wrote = await clerkP;
      if (!wrote) keepAnyway(t);
      setPointError(anthropicFailMessage("unknown"));
      setChat(withUser);
      writeChat(withUser);
      setPointBusy(false);
      return;
    }
  }

  function keepAnyway(text: string) {
    add(text, "action");
    showPointNote("Noté tel quel (je n'ai pas pu joindre Élan).", null);
  }

  function resetChat() {
    window.clearTimeout(pointNoteTimer.current);
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
        situation={situationText || undefined}
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

      <AiDegradedBanner
        liveKind={
          liveAiKind === "credits" ||
          liveAiKind === "quota" ||
          liveAiKind === "no_key"
            ? liveAiKind
            : null
        }
      />

      <ByokFallbackNotice />

      {wrapUp && (
        <div className="animate-rise mb-4 flex flex-col gap-3">
          <div className="rounded-2xl border border-teal-soft bg-teal-soft px-4 py-3 text-sm text-teal-ink">
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
          <SessionPulseFeedback />
        </div>
      )}

      {/* Séance du jour */}
      <section className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-[0_8px_40px_-24px_rgba(38,35,29,0.4)]">
        <p className="text-sm text-muted">
          {isNewcomer ? welcomeLine(settings.name) : greeting(settings.name)}
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
            <div className="mt-4 min-w-0">
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
                    {planUnreachable ? (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                        {planAiNote ||
                          "Conseil de secours — Élan n'a pas répondu à temps."}
                      </p>
                    ) : null}
                  </div>
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
                {away ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-muted">
                    Si rien d&apos;ici ne colle, tu peux quand même passer :
                    déposer, glisser une info, ou ajouter un truc.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Rien d&apos;ici aujourd&apos;hui — et c&apos;est ok. Tu peux
                quand même passer : déposer ce qui te trotte, glisser une info,
                ou ajouter un truc pour plus tard.
              </p>
            )}

            <button
              onClick={() =>
                context === "deposer" ? startDeposer() : startFresh()
              }
              className="mt-5 w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink"
            >
              {context === "deposer"
                ? "Déposer"
                : planLoading
                  ? "Commencer quand même"
                  : "Commencer la séance"}
            </button>
          </>
        )}
      </section>

      {resume && view === "home" ? (
        <section className="animate-rise mt-4 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3">
          <p className="text-[14px] text-ink">
            Séance en cours — tu peux reprendre là où tu t&apos;étais arrêté.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("session")}
              className="rounded-xl bg-teal px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-teal-ink"
            >
              Reprendre ({resume.durationMin} min)
            </button>
            <button
              type="button"
              onClick={() => {
                if (resume) {
                  saveSessionRecord(
                    resume.messages.filter((m) => m.content.trim()),
                    {
                      sessionId: resume.sessionId,
                      startedAt: resume.startedAt,
                      durationMin: resume.durationMin,
                      sessionContext: resume.context,
                    },
                  );
                }
                clearActiveSession();
                setResume(null);
              }}
              className="rounded-xl border border-line px-4 py-2 text-[14px] text-muted transition hover:text-ink"
            >
              Abandonner
            </button>
          </div>
        </section>
      ) : null}

      {showChat ? (
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
      ) : null}

      {!isNewcomer && <UsageWeek week={usageWeek} />}

      {/* État, sans liste anxiogène */}
      <section className="mt-8">
        <BacklogPeek
          open={open}
          actions={openActions}
          suivis={openSuivis}
          ready={ready}
        />
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-faint">
        Élan — pense à la séance, pas à la liste.
      </footer>
    </main>

    <HelpButton lift={showChat || !isNewcomer} />

    {engagementPrompt ? (
      <EngagementPrompt
        kind={engagementPrompt}
        threads={threads}
        planStats={planStats}
        onClose={() => setEngagementPrompt(null)}
      />
    ) : null}

    {showAcquisition ? (
      <AcquisitionPrompt
        onSubmit={submitAcquisition}
        onDismiss={dismissAcquisition}
      />
    ) : null}

    {showWtpSurvey && !showAcquisition && !engagementPrompt ? (
      <ProductSurveyPrompt onClose={() => setShowWtpSurvey(false)} />
    ) : null}
    </>
  );
}
