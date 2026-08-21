"use client";

import { useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { Logo } from "@/components/home/Branding";

export default function SignIn({ onBack }: { onBack?: () => void }) {
  const { signIn, verifyOtp, signInWithGoogle, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [view, setView] = useState<"main" | "magic" | "otp">("main");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);

  async function handleGoogle() {
    setStatus("busy");
    setError("");
    const { error } = await signInWithGoogle();
    if (error) { setError(error); setStatus("error"); }
    // on success: browser navigates away to Google
  }

  async function handleMagicLink() {
    const e = email.trim();
    if (!e || status === "busy") return;
    setStatus("busy");
    setError("");
    const { error } = await signIn(e);
    if (error) { setError(error); setStatus("error"); }
    else { setStatus("sent"); }
  }

  async function handleOtp() {
    const code = otp.trim();
    if (!code || status === "busy") return;
    setStatus("busy");
    setError("");
    const { error } = await verifyOtp(email, code);
    if (error) {
      setError("Code invalide ou expiré.");
      setStatus("error");
      setOtp("");
      setTimeout(() => otpRef.current?.focus(), 100);
    }
  }

  function reset() { setView("main"); setStatus("idle"); setError(""); setEmail(""); setOtp(""); }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-2">
        <Logo className="h-9 w-9 rounded-xl" />
        <span className="font-display text-xl font-semibold text-ink">Élan</span>
      </div>

      {view === "main" && (
        <div className="animate-rise">
          <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">
            Ouvre ton compte.
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            C&apos;est ce qui permet à Élan de se souvenir de ce que tu lui as
            confié — d&apos;une séance à l&apos;autre, et d&apos;un appareil à
            l&apos;autre.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleGoogle}
              disabled={status === "busy" || !configured}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface py-3 font-display text-base font-semibold text-ink transition hover:bg-sink disabled:opacity-40"
            >
              <GoogleIcon />
              {status === "busy" ? "Redirection…" : "Continuer avec Google"}
            </button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-faint">ou</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={() => { setView("magic"); setStatus("idle"); }}
              className="w-full rounded-xl border border-line py-3 text-center text-[15px] text-muted transition hover:text-ink"
            >
              Lien par email
            </button>
          </div>

          {status === "error" && (
            <p className="mt-3 text-sm text-amber">{error}</p>
          )}
          {!configured && (
            <p className="mt-3 text-sm text-amber">Configuration manquante.</p>
          )}

          {onBack && (
            <button
              onClick={onBack}
              className="mt-6 text-sm text-faint underline-offset-2 hover:underline"
            >
              ← C&apos;est quoi Élan, déjà ?
            </button>
          )}
        </div>
      )}

      {view === "magic" && status !== "sent" && (
        <div className="animate-rise">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Lien par email
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Entre ton adresse — tu recevras un lien de connexion.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleMagicLink(); } }}
              placeholder="ton@email.com"
              className="rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none focus:border-teal"
            />
            <button
              onClick={handleMagicLink}
              disabled={!email.trim() || status === "busy"}
              className="rounded-xl bg-teal py-3 text-center font-display text-base font-semibold text-white transition hover:bg-teal-ink disabled:opacity-40"
            >
              {status === "busy" ? "Envoi…" : "Recevoir mon lien"}
            </button>
          </div>
          {status === "error" && <p className="mt-3 text-sm text-amber">{error}</p>}
          <button onClick={reset} className="mt-4 text-sm text-faint underline-offset-2 hover:underline">
            ← Retour
          </button>
        </div>
      )}

      {view === "magic" && status === "sent" && (
        <div className="animate-rise">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Regarde tes mails 📬
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Lien envoyé à <b>{email}</b>. Clique dessus depuis ce navigateur.
          </p>
          <button
            onClick={() => { setView("otp"); setTimeout(() => otpRef.current?.focus(), 200); }}
            className="mt-5 text-sm text-teal underline-offset-2 hover:underline"
          >
            J&apos;ai un code à 8 chiffres →
          </button>
          <br />
          <button onClick={reset} className="mt-2 text-sm text-faint underline-offset-2 hover:underline">
            ← Retour
          </button>
        </div>
      )}

      {view === "otp" && (
        <div className="animate-rise">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Entre ton code
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Le code à 8 chiffres reçu par mail pour <b>{email}</b>.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setOtp(v);
                if (v.length === 8) setTimeout(() => handleOtp(), 0);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleOtp(); } }}
              placeholder="00000000"
              className="rounded-xl border border-line bg-surface px-4 py-3 text-center text-xl tracking-[0.3em] text-ink outline-none focus:border-teal"
            />
            <button
              onClick={handleOtp}
              disabled={otp.trim().length < 8 || status === "busy"}
              className="rounded-xl bg-teal py-3 text-center font-display text-base font-semibold text-white transition hover:bg-teal-ink disabled:opacity-40"
            >
              {status === "busy" ? "Vérification…" : "Me connecter"}
            </button>
          </div>
          {status === "error" && <p className="mt-3 text-sm text-amber">{error}</p>}
          <button onClick={() => { setView("magic"); setStatus("sent"); setOtp(""); setError(""); }}
            className="mt-4 text-sm text-faint underline-offset-2 hover:underline">
            ← Retour
          </button>
        </div>
      )}
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
