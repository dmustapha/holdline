// DEV-005 shim. klend-sdk 7.3.22 imports
//   @kamino-finance/farms-sdk/dist/@codegen/farms/programId  (exports PROGRAM_ID)
// but the resolved farms-sdk (3.2.26) renamed that module to .../programs/farms and the export to
// FARMS_PROGRAM_ADDRESS. This is a transitive version-resolution defect in the dependency tree,
// not our code. We alias the missing specifier (webpack + ts) to this shim, which re-exports the
// farms program address under the name klend expects. The value is the canonical Farms program id.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
try {
  // Prefer the real value from the installed farms-sdk when present.
  const farms = require("@kamino-finance/farms-sdk/dist/@codegen/farms/programs/farms");
  exports.PROGRAM_ID = farms.FARMS_PROGRAM_ADDRESS;
} catch (_e) {
  // Canonical Kamino Farms program address (mainnet), used only for PDA derivation.
  exports.PROGRAM_ID = "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr";
}
