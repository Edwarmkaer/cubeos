import { database, defineRailway, image, preserve, project, service } from "railway/iac";

// Evaluating this file is offline. Applying its graph creates resources and
// needs a separately authorized, explicitly linked Railway environment.
export default defineRailway(() => {
  const sha = process.env.CUBEOS_IMAGE_SHA;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("Set an immutable CUBEOS_IMAGE_SHA from trusted main/tag images");
  const db = database("postgres", "postgres", {
    image: "postgres:17.6-alpine", defaultMountPath: "/var/lib/postgresql/data",
  });
  const api = service("api", {
    source: image(`ghcr.io/edwarmkaer/cubeos-api:sha-${sha}`, { autoUpdates: { type: "disabled" } }),
    start: "server", preDeploy: "server migrate", healthcheck: "/readyz", healthcheckTimeout: 300,
    replicas: 1,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL, DEPLOYMENT_MODE: "public", AUTH_MODE: "clerk",
      LISTEN_HOST: "0.0.0.0", RAILWAY_HEALTHCHECK: "true", MEDIA_STORAGE: "s3",
      MEDIA_TEMP_ROOT: "/data/media-staging", MEDIA_MAX_BYTES: "67108864", MEDIA_MAX_PIXELS: "80000000",
      PUBLIC_API_HOST: preserve(), ALLOWED_ORIGIN: preserve(),
      CLERK_ISSUER: preserve(), CLERK_JWKS_URL: preserve(), CLERK_AUDIENCE: preserve(), CLERK_SECRET_KEY: preserve(),
      MEDIA_S3_ENDPOINT: preserve(), MEDIA_S3_REGION: preserve(), MEDIA_S3_BUCKET: preserve(),
      MEDIA_S3_ACCESS_KEY: preserve(), MEDIA_S3_SECRET_KEY: preserve(),
    },
  });
  const web = service("web", {
    source: image(`ghcr.io/edwarmkaer/cubeos-web:sha-${sha}`, { autoUpdates: { type: "disabled" } }),
    start: "node apps/web/server.js", healthcheck: "/healthz", healthcheckTimeout: 300, replicas: 1,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    env: { DEPLOYMENT_MODE: "public", HOSTNAME: "0.0.0.0", CLERK_PUBLISHABLE_KEY: preserve() },
  });
  return project("CubeOS", { resources: [db, api, web] });
});
