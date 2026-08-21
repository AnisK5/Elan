export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Nuit calme.";
  if (h < 12) return "Bonjour.";
  if (h < 18) return "Bel après-midi.";
  return "Bonsoir.";
}

export function Dot() {
  return (
    <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-teal/50" />
  );
}

/** Teal + point blanc en hex : le système ne les inverse pas la nuit. */
export function Logo({
  className = "h-7 w-7 rounded-lg",
}: {
  className?: string;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center ${className}`}
      style={{ backgroundColor: "#2e6f63" }}
      aria-hidden
    >
      <span
        className="h-[36%] w-[36%] animate-breathe rounded-full"
        style={{ backgroundColor: "#ffffff" }}
      />
    </span>
  );
}
