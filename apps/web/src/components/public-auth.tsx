"use client";
import { ClerkProvider, useAuth, useClerk } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { PublicSessionContext, usePublicIdentity } from "./public-session";
import { setPublicTokenGetter } from "@/lib/telemetry-source";

function SessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const clerk = useClerk();
  usePublicIdentity(isLoaded && isSignedIn ? `${userId}:${sessionId}` : null, () => getToken({ skipCache: true }));
  const session = {
    state: !isLoaded ? "loading" as const : isSignedIn ? "signed-in" as const : "signed-out" as const,
    signIn: async () => { setPublicTokenGetter(null); await clerk.redirectToSignIn({ signInFallbackRedirectUrl: "/configuracion" }); },
    signOut: async () => { setPublicTokenGetter(null); await clerk.signOut(); },
  };
  return <PublicSessionContext.Provider value={session}>{children}</PublicSessionContext.Provider>;
}

export default function PublicAuth({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return <ClerkProvider publishableKey={publishableKey}><SessionBridge>{children}</SessionBridge></ClerkProvider>;
}
