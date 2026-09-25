// DEV-005 postinstall patch. klend-sdk 7.3.22 require()s
//   @kamino-finance/farms-sdk/dist/@codegen/farms/programId  (exports PROGRAM_ID)
// but the resolved farms-sdk (3.2.26) renamed that module to programs/farms exporting
// FARMS_PROGRAM_ADDRESS. This writes a tiny compatibility shim so klend resolves at runtime.
// Idempotent; safe to run on every install (Vercel/Render deploy).
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const shim = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
try {
  const f = require("./programs/farms");
  exports.PROGRAM_ID = f.FARMS_PROGRAM_ADDRESS;
} catch (e) {
  exports.PROGRAM_ID = "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr";
}
`;

const targets = [
  "node_modules/@kamino-finance/farms-sdk/dist/@codegen/farms",
  "../node_modules/@kamino-finance/farms-sdk/dist/@codegen/farms",
];

for (const rel of targets) {
  const dir = path.resolve(process.cwd(), rel);
  if (existsSync(dir)) {
    writeFileSync(path.join(dir, "programId.js"), shim);
    console.log("[patch-farms-sdk] wrote", path.join(dir, "programId.js"));
  }
}
