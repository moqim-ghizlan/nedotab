// Runs the whole test suite for each target (V3.0): the extension, then the web app.
// The core must not depend on the target; the platform layer is resolved per target.
import { spawnSync } from "node:child_process";

let echec = false;
for (const cible of ["extension", "pwa"]) {
  console.log(`\n=== Tests, cible ${cible} ===`);
  const r = spawnSync("npx", ["vitest", "run"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CIBLE: cible },
  });
  if (r.status !== 0) echec = true;
}
process.exit(echec ? 1 : 0);
