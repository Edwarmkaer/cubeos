import { authConfig } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const config = authConfig(process.env.DEPLOYMENT_MODE, process.env.CLERK_PUBLISHABLE_KEY);
  return Response.json({ status: config.mode === "invalid" ? "not_ready" : "ready" }, {
    status: config.mode === "invalid" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
