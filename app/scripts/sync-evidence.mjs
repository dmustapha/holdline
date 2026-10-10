// sync-evidence.mjs — refresh the bundled Lie Detector evidence from the committed source.
// Reads repo-root evidence/control-hardening.jsonl (one level up from app/) and writes the parsed
// rows to app/src/app/api/demo/lie-detector/control-hardening.json so Next bundles it at build time.
//
// HONESTY: this ONLY mirrors the already-committed bytes the offline `npm run prove` produced; it
// never synthesizes a row. If the source is unreachable (e.g. Vercel deploys only app/), it NO-OPs
// and leaves the already-committed bundled copy in place — it never fails the build, never writes a
// fake PASS. The INVARIANT #6 503 path lives in the route: an empty bundled array still 503s.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // app/scripts
const source = path.join(here, "..", "..", "evidence", "control-hardening.jsonl");
const dest = path.join(here, "..", "src", "app", "api", "demo", "lie-detector", "control-hardening.json");

async function main() {
  let raw;
  try {
    raw = await readFile(source, "utf8");
  } catch {
    // Source not present in this deploy context — keep the committed bundled copy as-is.
    console.log("[sync-evidence] source not reachable; keeping committed bundled copy");
    return;
  }
  const rows = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  await writeFile(dest, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`[sync-evidence] wrote ${rows.length} row(s) -> ${path.relative(path.join(here, ".."), dest)}`);
}

main().catch((err) => {
  // A parse error on a present source is a real problem, but must not fabricate; surface and no-op.
  console.error("[sync-evidence] failed to sync; keeping committed bundled copy:", err?.message ?? err);
});
