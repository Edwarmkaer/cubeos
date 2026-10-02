"use client";
import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { setPublicTokenGetter } from "@/lib/telemetry-source";

export type PublicSession = { state: "unavailable" | "loading" | "signed-out" | "signed-in"; signIn?: () => Promise<void>; signOut?: () => Promise<void> };
export const PublicSessionContext = createContext<PublicSession>({ state: "unavailable" });
export const usePublicSession = () => useContext(PublicSessionContext);

// Auth provider identity includes session ID: signing into the same subject
// again still invalidates the preceding session's operations.
export function usePublicIdentity(identity: string | null, getToken: () => Promise<string | null>) {
  const currentToken = useRef(getToken);
  useLayoutEffect(() => { currentToken.current = getToken; });
  useLayoutEffect(() => {
    if (!identity) { setPublicTokenGetter(null); return; }
    setPublicTokenGetter(async () => {
      const token = await currentToken.current();
      return token; // sourceToken rejects late completions by identity generation.
    });
    return () => setPublicTokenGetter(null);
  }, [identity]);
}
