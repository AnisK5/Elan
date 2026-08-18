"use client";

export default function AiRetryBanner({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-ink">
      <p className="leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "…" : "Réessayer"}
      </button>
    </div>
  );
}
