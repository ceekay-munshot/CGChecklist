// Resolution hook: rewrite the project's "@/..." path alias to the real
// src/ directory AND append the ".ts" extension (ESM requires explicit
// extensions) so the dashboard's own TypeScript modules can be executed
// directly by Node (--experimental-strip-types). This lets the Excel export
// reuse the exact same buildGovernanceWorkbook() the web dash uses.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolvePath(here, "..", "src");

function withTsExtension(absPath) {
  if (existsSync(absPath)) return absPath;
  if (existsSync(`${absPath}.ts`)) return `${absPath}.ts`;
  if (existsSync(`${absPath}.tsx`)) return `${absPath}.tsx`;
  if (existsSync(resolvePath(absPath, "index.ts")))
    return resolvePath(absPath, "index.ts");
  return absPath;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const abs = withTsExtension(resolvePath(srcDir, specifier.slice(2)));
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
