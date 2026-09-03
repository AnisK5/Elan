"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/home/Branding";

const TABS = [
  { href: "/admin", label: "Utilisateurs" },
  { href: "/admin/product", label: "Produit" },
  { href: "/admin/analytics", label: "Monitoring" },
  { href: "/admin/feedbacks", label: "Retours" },
  { href: "/admin/settings", label: "Réglages IA" },
] as const;

function tabActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/users");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </Link>
        <Link href="/" className="text-sm text-muted transition hover:text-ink">
          Accueil
        </Link>
      </header>

      <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
        Admin
      </h1>

      <nav
        className="mt-4 -mb-px flex gap-1 overflow-x-auto"
        aria-label="Sections admin"
      >
        {TABS.map((tab) => {
          const active = tabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 rounded-t-xl border px-3 py-2 text-[13px] font-medium transition ${
                active
                  ? "border-line border-b-paper bg-paper text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line pt-6">{children}</div>
    </main>
  );
}
