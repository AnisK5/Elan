"use client";

/**
 * Source unique de l'explication d'Élan.
 * Utilisée par l'accueil public (avant connexion) et par le panneau « ? ».
 * Si le pitch change, il change ici — pas à deux endroits.
 */

const STEPS = [
  {
    t: "Tu déposes tout",
    d: "Ce qui traîne dans ta tête, en vrac, une bonne fois. Sans classer, sans prioriser.",
  },
  {
    t: "Élan choisit le créneau",
    d: "Il regarde le volume, ce qui presse, ton envie du moment, l'endroit où tu es. Puis il propose la bonne taille : 15 minutes, 30, 50.",
  },
  {
    t: "Il propose quoi y faire — et il aide",
    d: "Des trucs précis, regroupés quand ils se font bien ensemble. Avec de la matière concrète : un brouillon de mail, les points à ne pas oublier dans un appel.",
  },
];

const CONTRAST = [
  ["Tu empiles, et tu gères une par une", "Tu prends un créneau, il gère le tri"],
  ["Le volume monte, tu t'y perds", "Il jauge le volume et l'urgence à ta place"],
  ["Tu es seul devant ta liste", "Il reste avec toi pendant que tu avances"],
];

export function ExplainerBody() {
  return (
    <>
      <div className="rounded-2xl border border-teal-soft bg-teal-soft/50 px-5 py-4">
        <p className="text-xs font-medium tracking-wide text-teal">L&apos;IDÉE</p>
        <p className="mt-1 font-display text-lg font-semibold leading-snug text-teal-ink">
          Tu poses un créneau. Élan s&apos;occupe de ce qu&apos;on y met.
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-teal-ink/80">
          Trier, choisir, ne rien laisser filer : c&apos;est son travail. Le
          tien, c&apos;est d&apos;avancer sur une chose à la fois.
        </p>
      </div>

      <ol className="mt-6 flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.t} className="flex gap-3.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sink font-display text-xs font-semibold text-muted">
              {i + 1}
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold text-ink">
                {s.t}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7 rounded-2xl border border-line bg-sink/40 px-4 py-4">
        <div className="grid grid-cols-2 gap-x-4 border-b border-line pb-2">
          <span className="text-xs font-medium tracking-wide text-faint">
            UNE TO-DO LIST
          </span>
          <span className="text-xs font-medium tracking-wide text-teal">
            ÉLAN
          </span>
        </div>
        {CONTRAST.map(([before, after]) => (
          <div
            key={before}
            className="grid grid-cols-2 gap-x-4 border-b border-line/60 py-2.5 last:border-0 last:pb-0"
          >
            <span className="text-[13px] leading-snug text-faint">{before}</span>
            <span className="text-[13px] leading-snug text-ink">{after}</span>
          </div>
        ))}
      </div>
    </>
  );
}
