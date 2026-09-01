export function firstName(name?: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const part = trimmed.split(/\s+/)[0];
  return part || null;
}

export function greeting(name?: string | null): string {
  const h = new Date().getHours();
  let base: string;
  if (h < 6) base = "Nuit calme";
  else if (h < 12) base = "Bonjour";
  else if (h < 18) base = "Bel après-midi";
  else base = "Bonsoir";

  const first = firstName(name);
  if (!first) return `${base}.`;
  return `${base}, ${first}.`;
}

export function welcomeLine(name?: string | null): string {
  const first = firstName(name);
  if (!first) return "Bienvenue 👋";
  return `Bienvenue, ${first} 👋`;
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
