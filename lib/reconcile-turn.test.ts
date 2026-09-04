import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  expectsListWrite,
  extractCallFollowUpOps,
  extractRelanceTurnOps,
  isCarryForwardTurn,
  looksLikeDoneClaim,
  looksLikeStatusReport,
  mergeTurnWrites,
  messagesForReconcile,
  scopeGreffierUpdates,
  stampWhenOnAdds,
  threadMentionedInTurn,
  tourUserBlob,
} from "./reconcile-turn";

const at = new Date("2026-08-28T10:00:00.000Z"); // vendredi

function thread(partial: Partial<Thread> & Pick<Thread, "id" | "text">): Thread {
  return {
    kind: "action",
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("threadMentionedInTurn", () => {
  it("matche Laura Kici dans le libellé", () => {
    const t = thread({
      id: "l",
      text: "Relancer Laura Kici (Thiga)",
    });
    expect(
      threadMentionedInTurn(t, "laura kici je prefere la relancer lundi"),
    ).toBe(true);
  });

  it("ignore France Travail si non nommé", () => {
    const t = thread({ id: "f", text: "France Travail — dossier" });
    expect(
      threadMentionedInTurn(t, "laura kici je prefere la relancer lundi"),
    ).toBe(false);
  });
});

describe("looksLikeDoneClaim", () => {
  it("entend un achat / une résa nommée", () => {
    expect(looksLikeDoneClaim("j'ai pris mes billets et réservé")).toBe(true);
    expect(looksLikeDoneClaim("j'ai acheté le billet Bangkok")).toBe(true);
    expect(looksLikeDoneClaim("billets pris")).toBe(true);
  });

  it("n'entend pas un « je réserve » au futur", () => {
    expect(looksLikeDoneClaim("je réserve ça pour plus tard")).toBe(false);
    expect(looksLikeDoneClaim("j'ai réservé")).toBe(false);
  });
});

describe("scopeGreffierUpdates", () => {
  const threads = [
    thread({ id: "l", text: "Relancer Laura Kici (Thiga)" }),
    thread({ id: "f", text: "France Travail — actualisation" }),
    thread({
      id: "r",
      text: "Réguliers",
      note: "linge de lit · ~2sem · 2026-08-01",
    }),
  ];

  it("écarte done sur trucs non mentionnés", () => {
    const updates = [
      { op: "done", id: "f" },
      { op: "note", id: "r", note: "linge de lit · ~2sem · 2026-08-28" },
      { op: "set", id: "l", plannedFor: "2026-09-01" },
    ];
    expect(
      scopeGreffierUpdates(threads, [
        {
          role: "user",
          content: "laura kici je prefere la relancer lundi",
        },
      ], updates),
    ).toEqual([{ op: "set", id: "l", plannedFor: "2026-09-01" }]);
  });

  it("accepte un « oui » seulement si Élan demandait si c'était fait", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "Laura Kici — c'est envoyé ?",
          },
          { role: "user", content: "oui" },
        ],
        [{ op: "done", id: "l" }, { op: "done", id: "f" }],
      ),
    ).toEqual([{ op: "done", id: "l" }]);
  });

  it("n'ancre pas un « ok on y va » sur un done", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "On s'y met ?",
          },
          { role: "user", content: "ok" },
        ],
        [{ op: "done", id: "l" }],
      ),
    ).toEqual([]);
  });

  it("accepte « c'est fait » ancré sur le truc proposé", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "On coche France Travail ?",
          },
          { role: "user", content: "c'est fait" },
        ],
        [{ op: "done", id: "f" }],
      ),
    ).toEqual([{ op: "done", id: "f" }]);
  });

  it("laisse écrire Réguliers quand le tour pose une cadence de vie", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "user",
            content:
              "tous les 4 mois, c'est super important que je fasse un bilan sanguin",
          },
        ],
        [
          {
            op: "note",
            id: "r",
            note: "bilan sanguin · ~4mois · 2026-04-20",
          },
        ],
      ),
    ).toEqual([
      {
        op: "note",
        id: "r",
        note: "bilan sanguin · ~4mois · 2026-04-20",
      },
    ]);
  });
});

describe("extractRelanceTurnOps", () => {
  it("reporte une relance au lundi suivant", () => {
    const threads = [
      thread({ id: "l", text: "Relancer Laura Kici (Thiga)", kind: "action" }),
    ];
    const ops = extractRelanceTurnOps(
      threads,
      "laura kici je prefere la relancer lundi",
      at,
    );
    expect(ops).toContainEqual({
      op: "set",
      id: "l",
      kind: "suivi",
    });
    expect(ops).toContainEqual({
      op: "set",
      id: "l",
      plannedFor: "2026-08-31T12:00:00.000Z",
    });
    expect(ops.some((o) => o.op === "note" && o.note.includes("Relance prévue"))).toBe(
      true,
    );
  });
});

describe("mergeTurnWrites", () => {
  it("priorise le report code sur un done greffier erroné", () => {
    const threads = [
      thread({ id: "l", text: "Relancer Laura Kici (Thiga)" }),
      thread({ id: "f", text: "France Travail" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [{ role: "user", content: "laura kici je prefere la relancer lundi" }],
      [
        { op: "done", id: "f" },
        { op: "done", id: "l" },
      ],
      at,
    );
    expect(merged.some((o) => typeof o === "object" && o !== null && (o as { op?: string; id?: string }).op === "done" && (o as { id?: string }).id === "f")).toBe(
      false,
    );
    expect(merged.some((o) => typeof o === "object" && o !== null && (o as { op?: string; id?: string }).op === "done" && (o as { id?: string }).id === "l")).toBe(
      false,
    );
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { op?: string; plannedFor?: string }).op === "set" &&
          (o as { plannedFor?: string }).plannedFor?.startsWith("2026-08-31"),
      ),
    ).toBe(true);
  });

  it("coche le truc proposé même si le greffier n'écrit rien — « c'est déjà fait »", () => {
    const threads = [
      thread({ id: "ps", text: "Message à PS pour RDV médecin" }),
      thread({ id: "psy", text: "Message psychiatre RDV TDA + attestation" }),
      thread({ id: "papa", text: "Message à papa (Omar)" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Le message à PS d'abord — tu lui demandes un RDV médecin pour le médicament.",
        },
        { role: "user", content: "c'est déjà fait" },
        {
          role: "assistant",
          content:
            "Nickel ! Et le message à la psychiatre, tu veux qu'on l'envoie maintenant ?",
        },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "done", id: "ps" }]);
  });

  it("coche sur « mets que c'est fait » le truc de la question d'avant, pas la réplique suivante", () => {
    const threads = [
      thread({ id: "ps", text: "Message à PS pour RDV médecin" }),
      thread({ id: "psy", text: "Message psychiatre RDV TDA + attestation" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Et le message à la psychiatre pour le RDV TDA + l'attestation, tu veux qu'on l'envoie maintenant ?",
        },
        {
          role: "user",
          content:
            "j'ai dit que j'allais le faire pendant le rdv donc mets que c'est fait",
        },
        { role: "assistant", content: "Noté. Et les draps, ils sont faits ?" },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "done", id: "psy" }]);
  });

  it("retire le truc de la question d'avant sur « tu peux supprimer cette tâche »", () => {
    const threads = [
      thread({ id: "papa", text: "Message à papa (Omar)" }),
      thread({ id: "darty", text: "Darty Max — lave-vaisselle" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Message à papa maintenant — lui rappeler de contacter le père d'Omar à Casablanca.",
        },
        { role: "user", content: "tu peux supprimer cette tache" },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "delete", id: "papa" }]);
  });
});

describe("stampWhenOnAdds", () => {
  it("pose le jour sur l'add et ancre la note au lieu de laisser « demain »", () => {
    const stamped = stampWhenOnAdds(
      [
        {
          role: "user",
          content: "je dois poser 30€ en commission demain matin",
        },
      ],
      [
        {
          op: "add",
          text: "Poser 30€ en comm",
          kind: "action",
          note: "À faire demain matin — rappel pour demain.",
        },
      ],
      at,
    );
    expect(stamped[0]).toMatchObject({
      op: "add",
      text: "Poser 30€ en comm",
      plannedFor: "2026-08-29",
    });
    const note = (stamped[0] as { note: string }).note;
    expect(note).not.toMatch(/demain/i);
    expect(note).toMatch(/samedi 29\/08\/2026/);
  });

  it("n'invente pas une intention sur « pas avant demain »", () => {
    expect(
      stampWhenOnAdds(
        [{ role: "user", content: "pas avant demain pour le colis" }],
        [{ op: "add", text: "Poster le colis", kind: "action" }],
        at,
      ),
    ).toEqual([{ op: "add", text: "Poster le colis", kind: "action" }]);
  });
});

const SOGESSUR_DUMP =
  "c'est bon je viens d'appeler sg sur, ils m'ont dit qu'ils ont pas encore reçu le document qui qu'est notifie de dés avancer, mais que dès qu'il le reçoivent nous tiendrons au courant normalement dans la semaine prochaine par mail donc il va falloir que je vérifie que j'envoie un mail alors que je contacte mon père la semaine prochaine par exemple vendredi pour vérifier si il a reçu quelque chose de la part de la banque enfin de l'assurance et s'il a rien reçu, il faudra que je recontacte l'assurance pour prendre des nouvelles";

const sep4 = new Date("2026-09-04T12:00:00.000Z"); // vendredi 4 sept

function sogessurThread() {
  return thread({
    id: "sg",
    text: "Appeler Sogessur pour demander pourquoi le ponçage du parquet n'a pas été fait et prévoir la réparation",
  });
}

describe("suivi d'appel — Sogessur", () => {
  it("entend « sg sur » comme Sogessur", () => {
    expect(threadMentionedInTurn(sogessurThread(), SOGESSUR_DUMP)).toBe(true);
  });

  it("« maj » / suite courte après un dump — pas un inventaire de synonymes", () => {
    expect(isCarryForwardTurn("maj")).toBe(true);
    expect(isCarryForwardTurn("c'est pas a jour")).toBe(true);
    expect(
      isCarryForwardTurn(
        "sogessur pardon (le numero que je devais appeler aujourd'hui)",
        SOGESSUR_DUMP,
      ),
    ).toBe(true);
    expect(
      isCarryForwardTurn("la suite est pas ecrite en desc", SOGESSUR_DUMP),
    ).toBe(true);
    expect(isCarryForwardTurn("ok")).toBe(false);
    expect(isCarryForwardTurn("merci", SOGESSUR_DUMP)).toBe(false);
    expect(isCarryForwardTurn(SOGESSUR_DUMP)).toBe(false);
  });

  it("signale qu'un compte-rendu ancré doit laisser une trace", () => {
    expect(looksLikeStatusReport(SOGESSUR_DUMP)).toBe(true);
    expect(
      expectsListWrite(
        [sogessurThread()],
        [{ role: "user", content: SOGESSUR_DUMP }],
        sep4,
      ),
    ).toBe(true);
    expect(
      expectsListWrite(
        [sogessurThread()],
        [
          { role: "user", content: SOGESSUR_DUMP },
          { role: "assistant", content: "Reçu." },
          { role: "user", content: "maj" },
        ],
        sep4,
      ),
    ).toBe(true);
    expect(
      expectsListWrite(
        [sogessurThread()],
        [{ role: "user", content: "tu penses quoi de sortir marcher ?" }],
        sep4,
      ),
    ).toBe(false);
  });

  it("le blob du tour « maj » contient encore l'appel", () => {
    const blob = tourUserBlob([
      { role: "user", content: SOGESSUR_DUMP },
      { role: "assistant", content: "Reçu — on contacte ton père vendredi." },
      { role: "user", content: "sogessur pardon (le numero que je devais appeler aujourd'hui)" },
      { role: "assistant", content: "Ah oui, Sogessur — noté." },
      { role: "user", content: "maj" },
    ]);
    expect(blob).toMatch(/viens d'appeler sg sur/i);
    expect(blob).toMatch(/sogessur pardon/i);
    expect(blob).toMatch(/\bmaj\b/i);
  });

  it("garde le dump dans la fenêtre d'écriture après « maj »", () => {
    const messages = [
      { role: "user" as const, content: SOGESSUR_DUMP },
      { role: "assistant" as const, content: "Reçu." },
      { role: "user" as const, content: "sogessur pardon" },
      { role: "assistant" as const, content: "Noté." },
      { role: "user" as const, content: "maj" },
      { role: "assistant" as const, content: "Reçu !" },
      { role: "user" as const, content: "c'est pas a jour" },
      { role: "assistant" as const, content: "Tu peux me dire ce qui manque ?" },
      { role: "user" as const, content: "c'est ecrit Appeler Sogessur pour demander pourquoi le ponçage du parquet n'a pas été fait et prévoir la réparation" },
      { role: "assistant" as const, content: "Ah oui — tu as appelé." },
      { role: "user" as const, content: "la suite est pas ecrite en desc" },
    ];
    const recent = messagesForReconcile(messages);
    expect(recent.some((m) => m.content.includes("viens d'appeler sg sur"))).toBe(
      true,
    );
  });

  it("écrit le suivi même si le greffier ne renvoie rien", () => {
    const threads = [
      sogessurThread(),
      thread({ id: "dent", text: "Appeler le dentiste" }),
    ];
    const ops = extractCallFollowUpOps(threads, SOGESSUR_DUMP, sep4);
    expect(ops).toContainEqual({
      op: "rename",
      id: "sg",
      text: "Suivi Sogessur",
    });
    expect(ops).toContainEqual({
      op: "set",
      id: "sg",
      kind: "suivi",
      plannedFor: "2026-09-11T12:00:00.000Z",
    });
    const note = ops.find((o) => o.op === "note");
    expect(note && "note" in note ? note.note : "").toMatch(/Appelé le 04\/09/);
    expect(note && "note" in note ? note.note : "").toMatch(/papa/);
    expect(note && "note" in note ? note.note : "").toMatch(/11\/09/);
    expect(ops.some((o) => o.op === "done")).toBe(false);
  });

  it("après « maj », écrit quand même note + vendredi 11 + rename", () => {
    const threads = [
      sogessurThread(),
      thread({ id: "dent", text: "Appeler le dentiste" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        { role: "user", content: SOGESSUR_DUMP },
        { role: "assistant", content: "Reçu — on contacte ton père vendredi." },
        {
          role: "user",
          content: "sogessur pardon (le numero que je devais appeler aujourd'hui)",
        },
        { role: "assistant", content: "Ah oui, Sogessur." },
        { role: "user", content: "maj" },
      ],
      [],
      sep4,
    );
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { op?: string; id?: string; text?: string }).op === "rename" &&
          (o as { text?: string }).text === "Suivi Sogessur",
      ),
    ).toBe(true);
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { plannedFor?: string }).plannedFor?.startsWith("2026-09-11"),
      ),
    ).toBe(true);
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { op?: string; note?: string }).op === "note" &&
          /Prochaine étape/.test((o as { note?: string }).note ?? ""),
      ),
    ).toBe(true);
  });

  it("garde une note greffier sur Sogessur même si le dernier mot est « maj »", () => {
    expect(
      scopeGreffierUpdates(
        [sogessurThread()],
        [
          { role: "user", content: SOGESSUR_DUMP },
          { role: "assistant", content: "Reçu." },
          { role: "user", content: "maj" },
        ],
        [{ op: "note", id: "sg", note: "Appelé aujourd'hui, en attente du document." }],
      ),
    ).toEqual([
      { op: "note", id: "sg", note: "Appelé aujourd'hui, en attente du document." },
    ]);
  });

  it("ne transforme pas un appel déjà réglé en suivi", () => {
    expect(
      extractCallFollowUpOps(
        [thread({ id: "d", text: "Appeler le dentiste" })],
        "j'ai appelé le dentiste, c'est réglé",
        sep4,
      ),
    ).toEqual([]);
  });
});

