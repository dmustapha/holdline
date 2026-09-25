// Shared wire types between Holdline API routes and the client.
// The API returns serialized instructions the client re-hydrates + signs (self-custody:
// the server never holds keys, never fakes success — INVARIANT #3).

// A serialized @solana/kit instruction (borrow/repay path goes through the kit-native adapter).
// Kit instructions are { programAddress, accounts:[{address, role}], data:Uint8Array }.
export interface SerializedKitIx {
  programAddress: string;
  accounts: { address: string; role: number }[];
  data: string; // base64
}

// A serialized @solana/web3.js instruction (Anchor vault path — init_vault / fund_reserve).
export interface SerializedWeb3Ix {
  programId: string;
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
}

export interface TxBuildResponse<T> {
  instructions: T[];
}

export interface ApiError {
  error: string;
}

// Kamino market snapshot the borrow/health surfaces read.
export interface MarketSnapshot {
  market: string;
  usdcMint: string;
  usdcReserve: string;
  // Per-reserve borrow context for the connected obligation (present only when obligation given).
  obligation?: {
    address: string;
    ltvBps: number;
    liquidationLtvBps: number;
    debtUsdc: number;
    collateralUsdc: number;
    availableToBorrowUsdc: number;
  } | null;
}

// Protect vault status read from the on-chain PDA + keeper liveness.
export type ProtectSaveState = "none" | "full" | "partial";

export interface ProtectStatus {
  armed: boolean;
  vault: string | null;
  triggerLtvBps: number | null;
  capPerFireUsdc: number | null;
  reserveBalanceUsdc: number | null;
  totalRepaidUsdc: number | null;
  lastFireTs: number | null; // unix seconds, null = never fired
  keeper: string | null;
  // E-3 explicit failure surfaces:
  save: {
    state: ProtectSaveState;
    // when partial: how much still short of fully covering the gap
    shortfallUsdc: number | null;
  };
  // E-3 keeper liveness (fail-closed): offline => never render green.
  keeperLiveness: {
    online: boolean;
    lastSeenTs: number | null; // unix seconds
    stalenessSec: number | null;
  };
  // E-6 liveness line inputs:
  liveness: {
    marketClosed: boolean;
    marketClosesInMin: number | null; // minutes until close (null if already closed)
    reserveCoversGapPct: number | null; // ~% of the gap the reserve can cover (0..100)
  };
}

export interface HeartbeatTick {
  ts: number;
  obligation: string | null; // added (MF-1/MF-2) so partial/fire attributes to a specific vault
  ltvBps: number | null;
  fired: boolean;
  partial: boolean;
  shortfallUsdc: number | null;
}

export interface KeeperStatus {
  online: boolean;
  lastSeenTs: number | null;
  stalenessSec: number | null;
  lastTick: HeartbeatTick | null;
  // Every armed vault's outcome from the last tick; absent on older/single-vault heartbeats.
  ticks?: HeartbeatTick[];
}
