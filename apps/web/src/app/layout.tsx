import type { Metadata } from "next";
import { Barlow, Big_Shoulders, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
});

const sans = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CubeOS — CHASQUI-II",
  description:
    "Estación terrena educativa para visualizar la telemetría de un CubeSat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col bg-background font-sans text-foreground">
        <SiteHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
