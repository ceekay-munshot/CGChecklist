// Bootstrap: registers the "@/" alias resolution hook in the module loader
// so subsequently-imported TypeScript modules (the dashboard's own code) can
// resolve their "@/..." imports. Use via:  node --import ./scripts/register-alias.mjs
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
