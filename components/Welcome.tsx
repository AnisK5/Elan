"use client";

import { useState } from "react";
import SignIn from "./SignIn";
import { ExplainerBody } from "./Explainer";

/**
 * Premier écran pour qui débarque sans rien savoir.
 * L'explication passe AVANT le mur de connexion : on donne une raison
 * de vouloir un compte avant de le demander.
 */
export default function Welcome() {
  const [view, setView] = useState<"pitch" | "signin">("pitch");

  if (view === "signin") return <SignIn onBack={() => setView("pitch")} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-12">
      <header className="flex items-center gap-2 py-6">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal">
          <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-white" />
        </span>
        <span className="font-display text-lg font-semibold text-ink">Élan</span>
      </header>

      <section className="animate-rise pt-6">
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] text-ink sm:text-[34px]">
          Des créneaux, pas des listes.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Les autres applis te laissent empiler les tâches et les gérer une par
          une. Le volume monte, et on ne sait plus où donner de la tête.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          Élan prend l&apos;autre chemin : un rendez-vous régulier de 15 ou 30
          minutes. Il regarde ce que tu as sur les bras, ce qui presse, ton envie
          du moment, l&apos;endroit où tu es — et te propose un créneau à ta
          taille avec, dedans, exactement quoi faire. Précis, cohérent,
          motivant.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          Et pendant ce créneau, tu n&apos;es pas seul devant tes tâches : Élan
          reste là, et il aide pour de vrai.
        </p>
      </section>

      <figure className="animate-rise mt-8 rounded-2xl border-l-2 border-teal bg-surface px-5 py-4">
        <blockquote className="font-display text-[17px] leading-snug text-ink">
          « Ça m&apos;a débloqué des choses que je n&apos;aurais jamais touchées
          autrement. »
        </blockquote>
        <figcaption className="mt-2 text-xs text-faint">
          — l&apos;auteur d&apos;Élan, qui l&apos;a construite pour lui-même
        </figcaption>
      </figure>

      <section className="mt-9">
        <ExplainerBody />
      </section>

      <section className="mt-10">
        <button
          onClick={() => setView("signin")}
          className="w-full rounded-xl bg-teal py-4 text-center font-display text-lg font-semibold text-white transition hover:bg-teal-ink"
        >
          Commencer
        </button>
        <button
          onClick={() => setView("signin")}
          className="mt-3 w-full py-2 text-center text-sm text-muted underline-offset-2 transition hover:text-ink hover:underline"
        >
          J&apos;ai déjà un compte
        </button>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs leading-relaxed text-faint">
        Pensé pour les cerveaux TDAH — et pour toute tête un peu trop pleine.
      </footer>
    </main>
  );
}
