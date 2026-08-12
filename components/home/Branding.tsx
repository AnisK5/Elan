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

export function Logo() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal">
      <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-white" />
    </span>
  );
}
