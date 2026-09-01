"use client";

import { useEffect, useState } from "react";
import { ExplainerBody } from "./Explainer";
import FeedbackForm from "./FeedbackForm";
import { useAuth } from "./AuthProvider";

/** Bouton flottant discret : ramène l'explication d'Élan quand on l'a perdue. */
export default function HelpButton({
  lift = false,
}: {
  lift?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Comment marche Élan ?"
        title="Comment marche Élan ?"
        style={{
          bottom: lift
            ? "calc(4.75rem + env(safe-area-inset-bottom, 0px))"
            : "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
        }}
        className="fixed right-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-line bg-surface font-display text-xl font-semibold text-muted shadow-[0_4px_20px_-6px_rgba(38,35,29,0.35)] transition hover:border-teal hover:text-teal"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 px-4 py-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comment marche Élan ?"
            onClick={(e) => e.stopPropagation()}
            className="animate-rise max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_60px_-20px_rgba(38,35,29,0.45)]"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="font-display text-xl font-semibold leading-tight text-ink">
                Comment marche Élan
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-lg text-faint transition hover:text-ink"
              >
                ×
              </button>
            </div>

            <ExplainerBody />

            {user ? (
              <div className="mt-8 border-t border-line pt-6">
                <FeedbackForm source="home" compact />
              </div>
            ) : null}

            <button
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-xl border border-line py-3 text-center text-[15px] text-muted transition hover:text-ink"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
