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
          Tu déposes tout ce que tu as à faire. Ensuite, au lieu d&apos;une
          liste à trier, tu prends un rendez-vous — et c&apos;est Élan qui
          décide ce qu&apos;on y met, et qui reste avec toi pendant que tu
          avances.
        </p>
      </section>

      <figure className="animate-rise mt-7 rounded-2xl border border-teal-soft bg-teal-soft/40 px-5 py-4">
        <figcaption className="text-xs font-medium tracking-wide text-teal">
          CE QU&apos;ÉLAN TE PROPOSE, PAR EXEMPLE
        </figcaption>
        <blockquote className="mt-2 text-[15px] leading-relaxed text-teal-ink">
          « Tu as deux relances qui traînent, dont une avec une échéance
          vendredi — je propose 30 minutes plutôt que 15. Elles se font bien
          ensemble : même énergie, tout depuis ton bureau. On commence par
          l&apos;assurance, c&apos;est elle qui a la date : je t&apos;écris le
          mail, tu relis et tu envoies. Ensuite le dentiste — je te donne quoi
          dire, tu n&apos;as qu&apos;à lire. »
        </blockquote>
      </figure>

      <section className="mt-7">
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

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="mb-5 text-xs font-medium tracking-wide text-faint">
          SI TU VEUX LE DÉTAIL
        </h2>
        <ExplainerBody />
      </section>

      <footer className="mt-auto pt-12 text-center text-xs leading-relaxed text-faint">
        Pensé pour les cerveaux TDAH — et pour toute tête un peu trop pleine.
      </footer>
    </main>
  );
}
