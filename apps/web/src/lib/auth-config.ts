export type AuthConfig = { mode: "local" | "public" | "cloud" | "invalid"; publishableKey: string };

// Runtime server values are passed explicitly; NEXT_PUBLIC_* values are frozen
// at build time and must not silently turn a public deployment into local.
export function authConfig(mode: string | undefined, key: string | undefined, convexURL?:string): AuthConfig {
  if(mode==='cloud'){
   try{const u=new URL(convexURL??'');if(u.protocol==='https:'&&/^[a-z0-9-]+\.convex\.cloud$/.test(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/')return{mode:'cloud',publishableKey:''};}catch{}
   return{mode:'invalid',publishableKey:''};
  }
  if (!mode || mode === "local") return { mode: "local", publishableKey: "" };
  if (mode !== "public" || !key || !/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key)) return { mode: "invalid", publishableKey: "" };
  return { mode: "public", publishableKey: key };
}
