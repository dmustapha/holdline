// Postinstall patch (root). klend-sdk 7.3.22 require()s
//   @kamino-finance/farms-sdk/dist/@codegen/farms/programId  (exports PROGRAM_ID)
// but farms-sdk 3.2.26 renamed that module to programs/farms (exports FARMS_PROGRAM_ADDRESS).
// Writes a tiny compat shim so `npm run prove` resolves klend at runtime from a COLD CLONE
// (a judge who clones + npm install must get this without the app's postinstall). Idempotent.
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const shim = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
try { const f = require("./programs/farms"); exports.PROGRAM_ID = f.FARMS_PROGRAM_ADDRESS; }
catch (e) { exports.PROGRAM_ID = "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr"; }
`;
const dir = path.resolve(process.cwd(), "node_modules/@kamino-finance/farms-sdk/dist/@codegen/farms");
try {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "programId.js"), shim);
  writeFileSync(path.join(dir, "programId.d.ts"), "export declare const PROGRAM_ID: string;\n");
  console.log("[patch-farms-sdk] shim written at " + dir);
} catch (e) { console.log("[patch-farms-sdk] skipped: " + e.message); }
