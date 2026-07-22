import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Motif d'init au montage (lecture de localStorage/Intl côté client pour
      // éviter les décalages d'hydratation) : légitime ici, on garde le signal
      // sans bloquer le build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
