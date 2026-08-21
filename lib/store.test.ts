import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "./types";

// store.ts parle au localStorage du navigateur ; les tests tournent en node.
// Un stub mémoire suffit : rien ici ne touche au réseau (pushToSupabase sort
// immédiatement tant qu'aucun utilisateur n'est connecté).
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const storage = new MemoryStorage();
vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });

const { applyThreadOps, snapshotThreads, restoreThreads, wakeSnoozed } = await import(
  "./store"
);
const { parseThreadOps } = await import("./ops");

const THREADS_KEY = "elan.threads.v1";

function dayISO(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

function thread(over: Partial<Thread> & { id: string }): Thread {
  return {
    text: "un truc",
    kind: "action",
    status: "open",
    createdAt: dayISO(-10),
    ...over,
  };
}

function seed(list: Thread[]) {
  storage.setItem(THREADS_KEY, JSON.stringify(list));
}

function byId(id: string): Thread | undefined {
  return snapshotThreads().find((t) => t.id === id);
}

beforeEach(() => storage.clear());

describe("applyThreadOps — ce que le greffier a le droit de faire à tes trucs", () => {
  it("ne ressuscite jamais un truc terminé", () => {
    seed([thread({ id: "a" })]);
    applyThreadOps([{ op: "done", id: "a" }]);
    // Un réglage qui arrive après ne doit pas le rouvrir par effet de bord.
    applyThreadOps([{ op: "set", id: "a", plannedFor: dayISO(2) }]);
    expect(byId("a")?.status).toBe("done");
  });

  it("ne recrée pas un truc ouvert que la personne a déjà", () => {
    seed([thread({ id: "a", text: "Poster le colis" })]);
    applyThreadOps([{ op: "add", text: "  poster LE colis  ", kind: "action" }]);
    expect(snapshotThreads()).toHaveLength(1);
  });

  it("ne touche pas aux champs qu'un set ne mentionne pas", () => {
    seed([thread({ id: "a", due: dayISO(3), effort: "M", note: "papa attend" })]);
    applyThreadOps([{ op: "set", id: "a", plannedFor: dayISO(1) }]);
    const t = byId("a");
    expect(t?.effort).toBe("M");
    expect(t?.note).toBe("papa attend");
    expect(t?.due).toBeTruthy();
  });

  it("pose puis annule une intention de jour", () => {
    seed([thread({ id: "a" })]);
    applyThreadOps([{ op: "set", id: "a", plannedFor: dayISO(2) }]);
    expect(byId("a")?.plannedFor).toBeTruthy();
    applyThreadOps([{ op: "set", id: "a", plannedFor: null }]);
    expect(byId("a")?.plannedFor).toBeUndefined();
  });

  it("retombe sur demain quand une pause n'a pas de date", () => {
    seed([thread({ id: "a" })]);
    applyThreadOps([{ op: "snooze", id: "a" }]);
    const t = byId("a");
    expect(t?.status).toBe("snoozed");
    expect(new Date(t?.snoozedUntil as string).getTime()).toBeGreaterThan(Date.now());
  });

});

// applyThreadOps FAIT CONFIANCE à parseThreadOps : ses deux appelants réels
// (app/page.tsx et components/Session.tsx) ne lui passent jamais autre chose.
// C'est donc la chaîne complète qu'il faut tester, pas la seconde moitié
// isolée — prise seule, elle effacerait une échéance sur une date illisible.
describe("la chaîne réelle : ce que le modèle renvoie → ce que tes trucs deviennent", () => {
  function reconcile(updates: unknown) {
    const before = snapshotThreads();
    applyThreadOps(
      parseThreadOps(updates, new Set(before.map((t) => t.id)), before),
    );
  }

  it("ne change RIEN quand le modèle écrit une date en relatif", () => {
    seed([thread({ id: "a", due: dayISO(5), plannedFor: dayISO(2) })]);
    const avant = storage.getItem(THREADS_KEY);
    reconcile([{ op: "set", id: "a", due: "jeudi prochain" }]);
    reconcile([{ op: "set", id: "a", plannedFor: "la semaine prochaine" }]);
    expect(storage.getItem(THREADS_KEY)).toBe(avant);
  });

  it("ne touche à rien quand le modèle invente un id", () => {
    seed([thread({ id: "a" })]);
    const avant = storage.getItem(THREADS_KEY);
    reconcile([{ op: "done", id: "b" }]);
    expect(storage.getItem(THREADS_KEY)).toBe(avant);
  });

  it("raye quand le modèle envoie le libellé au lieu de l'id", () => {
    seed([
      thread({ id: "a", text: "Rendre l'argent au coffre" }),
      thread({ id: "b", text: "Appeler Sonia" }),
    ]);
    reconcile([{ op: "done", id: "coffre" }]);
    expect(byId("a")?.status).toBe("done");
    expect(byId("b")?.status).toBe("open");
  });

  it("pose un jour de sortie sur tout le lot d'un coup", () => {
    seed([thread({ id: "a" }), thread({ id: "b" }), thread({ id: "c" })]);
    const jour = dayISO(3);
    reconcile([
      { op: "set", id: "a", plannedFor: jour },
      { op: "set", id: "b", plannedFor: jour },
      { op: "set", id: "c", plannedFor: jour },
      { op: "note", id: "a", note: "sortie 17h, enveloppe près de la porte" },
    ]);
    expect(snapshotThreads().filter((t) => t.plannedFor)).toHaveLength(3);
    expect(byId("a")?.note).toContain("17h");
  });
});

describe("wakeSnoozed — la promesse « le truc, lui, reviendra »", () => {
  it("réveille ce dont la date est passée", () => {
    seed([thread({ id: "a", status: "snoozed", snoozedUntil: dayISO(-1) })]);
    expect(wakeSnoozed()).toBe(1);
    expect(byId("a")?.status).toBe("open");
  });

  it("réveille dès le jour dit, pas le lendemain", () => {
    seed([thread({ id: "a", status: "snoozed", snoozedUntil: dayISO(0) })]);
    expect(wakeSnoozed()).toBe(1);
  });

  it("laisse dormir ce qui est prévu pour demain", () => {
    seed([thread({ id: "a", status: "snoozed", snoozedUntil: dayISO(1) })]);
    expect(wakeSnoozed()).toBe(0);
    expect(byId("a")?.status).toBe("snoozed");
  });

  it("efface la date en réveillant, pour ne pas re-dormir au prochain passage", () => {
    seed([thread({ id: "a", status: "snoozed", snoozedUntil: dayISO(-1) })]);
    wakeSnoozed();
    expect(byId("a")?.snoozedUntil).toBeUndefined();
    expect(wakeSnoozed()).toBe(0);
  });

  it("n'écrit rien quand il n'y a personne à réveiller", () => {
    seed([thread({ id: "a" })]);
    const avant = storage.getItem(THREADS_KEY);
    expect(wakeSnoozed()).toBe(0);
    expect(storage.getItem(THREADS_KEY)).toBe(avant);
  });
});

// Ces deux comportements sont ceux d'aujourd'hui, et ils sont discutables.
// Les figer ici sert à ce qu'ils soient CHOISIS, pas subis : le jour où on en
// change un, ce test tombera et forcera la décision.
describe("comportements actuels à trancher (figés, pas approuvés)", () => {
  it("une note du greffier ÉCRASE le contexte accumulé", () => {
    seed([thread({ id: "a", note: "papa attend ça depuis mars, il relance" })]);
    applyThreadOps([{ op: "note", id: "a", note: "relancé le 03/08" }]);
    // La fusion est demandée au modèle dans le prompt de /api/reconcile, mais
    // rien ne la garantit ici : s'il renvoie une note courte, l'historique part.
    expect(byId("a")?.note).toBe("relancé le 03/08");
  });

  it("un truc terminé peut être recréé à l'identique", () => {
    seed([thread({ id: "a", text: "Poster le colis", status: "done" })]);
    applyThreadOps([{ op: "add", text: "Poster le colis", kind: "action" }]);
    // Le dédoublonnage ne regarde que les trucs OUVERTS. C'est ce qu'il faut
    // pour une course qui revient, et c'est une source de doublons pour le
    // reste — /api/reconcile ne voit que les trucs ouverts, donc il ne peut
    // pas savoir que celui-ci a déjà été fait.
    expect(snapshotThreads()).toHaveLength(2);
  });
});

describe("snapshot / restore — le filet de l'annulation", () => {
  it("rend exactement ce qu'on lui a confié", () => {
    const list = [thread({ id: "a", note: "avec accents : éàü" }), thread({ id: "b" })];
    seed(list);
    const snap = snapshotThreads();
    applyThreadOps([{ op: "done", id: "a" }, { op: "done", id: "b" }]);
    restoreThreads(snap);
    expect(snapshotThreads().every((t) => t.status === "open")).toBe(true);
    expect(byId("a")?.note).toBe("avec accents : éàü");
  });
});
