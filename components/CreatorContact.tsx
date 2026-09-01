import { CREATOR_EMAIL } from "@/lib/contact";

/** Lien mailto vers le créateur — sous le formulaire de retour. */
export default function CreatorContact({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <p
      className={
        compact
          ? "mt-2 text-[12px] leading-relaxed text-muted"
          : "mt-3 text-[13px] leading-relaxed text-muted"
      }
    >
      Ou écris-moi directement :{" "}
      <a
        href={`mailto:${CREATOR_EMAIL}`}
        className="font-medium text-teal transition hover:text-teal-ink hover:underline"
      >
        {CREATOR_EMAIL}
      </a>
    </p>
  );
}
