"use client";

import { useEffect, useState } from "react";
import SignIn from "./SignIn";
import { ExplainerBody } from "./Explainer";
import { Logo } from "@/components/home/Branding";
import { captureAcquisitionFromUrl } from "@/lib/acquisition";

/**
 * Premier écran pour qui débarque sans rien savoir.
 * L'explication passe AVANT le mur de connexion : on donne une raison
 * de vouloir un compte avant de le demander.
 */
export default function Welcome() {
  const [view, setView] = useState<"pitch" | "signin">("pitch");

  useEffect(() => {
    captureAcquisitionFromUrl();
  }, []);

  if (view === "signin") return <SignIn onBack={() => setView("pitch")} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-12">
      <header className="flex items-center gap-2 py-6">
        <Logo />
        <span className="font-display text-lg font-semibold text-ink">Élan</span>
      </header>

      <section className="animate-rise pt-6">
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] text-ink sm:text-[34px]">
          Chaque jour, un créneau. Élan s&apos;occupe de ce qu&apos;on y met.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          Tu déposes tout ce que tu as à faire. Ensuite tu prends
          l&apos;habitude d&apos;ouvrir un créneau avec Élan, régulièrement.
          C&apos;est lui qui propose le temps à y consacrer et ce qu&apos;on y
          met — pour que rien ne se perde, et que ton énergie aille à ce qui
          compte.
        </p>
      </section>

      <figure className="animate-rise mt-7 rounded-2xl border border-teal-soft bg-teal-soft/40 px-5 py-4">
        <figcaption className="text-xs font-medium tracking-wide text-teal">
          CE QU&apos;ÉLAN TE PROPOSE, PAR EXEMPLE
        </figcaption>
        <blockquote className="mt-2 text-[15px] leading-relaxed text-teal-ink">
          « Deux relances traînent, dont une pour vendredi. Je te propose 30
          minutes ce matin plutôt que 15 : elles vont bien ensemble, tout
          depuis ton bureau. On commencerait par l&apos;assurance, c&apos;est
          elle qui a la date — je te prépare un brouillon. Pour le dentiste, je
          te note les points à ne pas oublier. »
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
