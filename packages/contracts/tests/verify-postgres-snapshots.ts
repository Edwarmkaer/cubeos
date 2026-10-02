import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSnapshotV2 } from "../src/index.ts";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the owned PostgreSQL projection evidence directory");
const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
if (files.length === 0) throw new Error("PostgreSQL projection evidence is missing");
for (const file of files) {
  const projection = JSON.parse(readFileSync(join(directory, file), "utf8"));
  if (!validateSnapshotV2(projection.snapshot)) {
    throw new Error(`${file}: ${JSON.stringify(validateSnapshotV2.errors)}`);
  }
}
console.log(`${files.length} persisted/rebuilt PostgreSQL snapshots validate the shared SnapshotV2 schema`);
