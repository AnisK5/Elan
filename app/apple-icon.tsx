import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS n'accepte pas les SVG pour l'écran d'accueil : on génère un PNG.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2e6f63",
        }}
      >
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: 9999,
            background: "#ffffff",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
