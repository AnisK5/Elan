import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Élan — ta séance du jour",
    short_name: "Élan",
    description:
      "Au lieu de gérer tes listes, présente-toi à une séance guidée par l'IA. Pensé pour les cerveaux qui débordent.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    orientation: "portrait",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
