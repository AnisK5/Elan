import AdminAiHealth from "@/components/admin/AdminAiHealth";

export default function AdminSettingsPage() {
  return (
    <>
      <h2 className="font-display text-lg font-semibold text-ink">
        Réglages IA
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        État de la clé Anthropic. Les plafonds se gèrent dans{" "}
        <a href="/admin/analytics?tab=pilotage" className="text-teal hover:underline">
          Monitoring → Pilotage
        </a>
        .
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <AdminAiHealth />
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
          Plafonds tokens / jour et plan / heure (global + par personne) :{" "}
          <a
            href="/admin/analytics?tab=pilotage"
            className="font-medium text-teal hover:underline"
          >
            ouvrir le Pilotage →
          </a>
        </p>
      </div>
    </>
  );
}
