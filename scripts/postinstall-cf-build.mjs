#!/usr/bin/env node
// Runs the OpenNext Cloudflare build right after `npm install` /
// `npm clean-install`.
//
// Why: the deploy command on Cloudflare's dashboard is `npx wrangler
// versions upload`, which expects `.open-next/worker.js` to already
// exist on disk. Cloudflare Workers Builds does not run a separate
// build step before the deploy command, and the wrangler.jsonc
// `build.command` hook is not reliably honored for `versions upload`
// in CI. Running the OpenNext build right after install guarantees
// the entry point exists by the time wrangler runs.
//
// Skip locally with: SKIP_POSTINSTALL_BUILD=1 npm install

import { spawnSync } from "node:child_process";

if (process.env.SKIP_POSTINSTALL_BUILD) {
  process.exit(0);
}

console.log("[postinstall] running opennextjs-cloudflare build");

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "opennextjs-cloudflare", "build"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("[postinstall] failed to spawn opennextjs-cloudflare:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
