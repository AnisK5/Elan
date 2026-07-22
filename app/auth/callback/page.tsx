"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    // Supabase detectSessionInUrl handles the hash/code automatically.
    // We just wait for the session to be established then redirect home.
    const sb = getSupabase();
    if (!sb) {
      window.location.replace("/");
      return;
    }

    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        sub.subscription.unsubscribe();
        window.location.replace("/");
      }
    });

    // Fallback: if already signed in, redirect immediately
    sb.auth.getSession().then(({ data }) => {
      if (data.session) {
        sub.subscription.unsubscribe();
        window.location.replace("/");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center">
      <span className="h-4 w-4 animate-breathe rounded-full bg-teal" />
    </main>
  );
}
