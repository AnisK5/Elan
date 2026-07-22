import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Élan — ta séance du jour",
  description:
    "Au lieu de gérer tes listes, tu te présentes à une séance guidée par l'IA. Elle prend le pouls de tout ce que tu as à faire, sans te noyer.",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "Élan",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
