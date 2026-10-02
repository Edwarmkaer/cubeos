export type AuthConfig = { mode: "local" | "public" | "invalid"; publishableKey: string };

// Runtime server values are passed explicitly; NEXT_PUBLIC_* values are frozen
// at build time and must not silently turn a public deployment into local.
export function authConfig(mode: string | undefined, key: string | undefined): AuthConfig {
  if (!mode || mode === "local") return { mode: "local", publishableKey: "" };
  if (mode !== "public" || !key || !/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key)) return { mode: "invalid", publishableKey: "" };
  return { mode: "public", publishableKey: key };
}
