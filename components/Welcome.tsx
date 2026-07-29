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
          Chaque jour, un créneau. Élan te dit quoi y faire.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          Élan est une app de tâches qui marche par rendez-vous. Tu déposes tout
          ce que tu as à faire. Ensuite, plutôt qu&apos;une liste à trier, tu
          prends un créneau de 15 ou 30 minutes — et c&apos;est Élan qui décide
          ce qu&apos;on y met.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Il regarde le volume, ce qui presse, ton envie du moment,
          l&apos;endroit où tu es. Il en déduit la bonne taille de créneau, et
          il te dit précisément par quoi commencer. Pendant que tu avances, il
          reste là.
        </p>
      </section>

      <figure className="animate-rise mt-8 rounded-2xl border border-teal-soft bg-teal-soft/40 px-5 py-4">
        <figcaption className="text-xs font-medium tracking-wide text-teal">
          UN CRÉNEAU PROPOSÉ, POUR DONNER UNE IDÉE
        </figcaption>
        <blockquote className="mt-2 text-[15px] leading-relaxed text-teal-ink">
          « Tu as un peu de temps et tu es chez toi — on prend 30 minutes.
          J&apos;ai trois trucs qui se font bien ensemble : le rendez-vous chez
          le dentiste, la relance à l&apos;assurance, et la lettre à poster.
          Deux appels et une enveloppe, tout depuis le canapé. On commence par
          le dentiste, c&apos;est le plus court — je reste avec toi. »
        </blockquote>
      </figure>

      <section className="mt-8">
        <p className="text-[16px] leading-relaxed text-muted">
          Les autres applis te laissent empiler les tâches et les gérer une par
          une. Le volume monte, et on ne sait plus où donner de la tête. Ici,
          c&apos;est Élan qui porte le volume — toi, tu fais le pas suivant, et
          tu n&apos;es pas seul devant.
        </p>
      </section>

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
