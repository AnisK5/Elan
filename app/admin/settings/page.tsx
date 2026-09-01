import AdminAiHealth from "@/components/admin/AdminAiHealth";
import AdminTokenLimitSettings from "@/components/admin/AdminTokenLimitSettings";

export default function AdminSettingsPage() {
  return (
    <>
      <h2 className="font-display text-lg font-semibold text-ink">
        Réglages IA
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        État de la clé Anthropic et plafond journalier par personne.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <AdminAiHealth />
        <AdminTokenLimitSettings />
      </div>
    </>
  );
}
