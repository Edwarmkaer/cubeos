"use client";
import dynamic from "next/dynamic";
import { Component } from "react";
import type { ReactNode } from "react";
import type { AuthConfig } from "@/lib/auth-config";
import { setPublicTokenGetter } from "@/lib/telemetry-source";

const PublicAuth = dynamic(() => import("./public-auth"), { ssr: false });

class AuthErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { setPublicTokenGetter(null); }
  render() { return this.state.failed ? <p role="alert" className="p-4 text-muted-foreground">Autenticación pública no disponible. Revisa la configuración e intenta de nuevo.</p> : this.props.children; }
}

export function AuthBoundary({ config, children }: { config: AuthConfig; children: ReactNode }) {
  if (config.mode === "local") return children;
  if (config.mode === "invalid") return <p role="alert" className="p-4 text-muted-foreground">Configuración pública incompleta. El acceso está cerrado.</p>;
  return <AuthErrorBoundary><PublicAuth publishableKey={config.publishableKey}>{children}</PublicAuth></AuthErrorBoundary>;
}
