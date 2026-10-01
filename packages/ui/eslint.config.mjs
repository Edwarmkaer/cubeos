import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // This package supplies components; routing belongs to its Next.js consumer.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
]);
