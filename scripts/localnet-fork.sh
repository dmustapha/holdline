#!/usr/bin/env bash
# File: scripts/localnet-fork.sh
# [C3 HERO — fork bootstrap] Boots a solana-test-validator that is a MAINNET FORK of the real
# Kamino KLend program + the xStocks market + every reserve/oracle/mint/vault account those
# reserves reference, PLUS our Holdline vault program (bpf-loaded at its keypair id).
#
# It reads scripts/clone-accounts.json (produced by discover-clone-accounts.ts) for the clone list,
# clones the KLend program upgradeable, and starts fresh (--reset). After boot, prove-fork-loads.ts
# asserts KaminoMarket.load() succeeds against http://127.0.0.1:8899.
#
# Usage: bash scripts/localnet-fork.sh   (runs in the FOREGROUND; Ctrl-C to stop)
set -euo pipefail

export PATH="$HOME/.local/share/solana/install/releases/2.3.0/solana-release/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLONE_JSON="$REPO_ROOT/scripts/clone-accounts.json"
OBLIG_JSON="$REPO_ROOT/scripts/demo-obligation.json"
LEDGER="$REPO_ROOT/.localnet-ledger"
SRC_RPC="${CLONE_SRC_RPC:-https://api.mainnet-beta.solana.com}"
KLEND="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
# Kamino Farms program — klend's V2 ixs (refresh/repay) touch farm state and require it executable.
FARMS="FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr"
VAULT_SO="$REPO_ROOT/target/deploy/holdline_vault.so"
VAULT_ID="4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw"

if [[ ! -f "$CLONE_JSON" ]]; then
  echo "[fork] $CLONE_JSON missing — run: node_modules/.bin/ts-node scripts/discover-clone-accounts.ts" >&2
  exit 1
fi
if [[ ! -f "$VAULT_SO" ]]; then
  echo "[fork] vault .so missing at $VAULT_SO — run anchor build first" >&2
  exit 1
fi

# Build the --clone flag list (all non-KLend accounts) from clone-accounts.json.
# macOS bash 3.2 has no mapfile — read newline-delimited output into an array portably.
CLONE_ACCTS=()
while IFS= read -r a; do
  [[ -n "$a" ]] && CLONE_ACCTS+=("$a")
done < <(node -e '
  const j = require(process.argv[1]);
  const all = [j.market, ...j.reserves, ...j.oracles, ...j.mints, ...j.vaults, ...(j.farms||[])];
  console.log([...new Set(all)].join("\n"));
' "$CLONE_JSON")

# Also clone the selected real demo obligation (has real xStock collateral + USDC debt).
if [[ -f "$OBLIG_JSON" ]]; then
  OBLIG=$(node -e 'console.log(require(process.argv[1]).obligation)' "$OBLIG_JSON")
  [[ -n "$OBLIG" ]] && CLONE_ACCTS+=("$OBLIG")
  echo "[fork] cloning demo obligation $OBLIG"
fi

CLONE_FLAGS=()
for a in "${CLONE_ACCTS[@]}"; do
  CLONE_FLAGS+=(--clone "$a")
done

# Load DISCLOSED test-balance account overrides (real USDC mint, fork-only balances).
ACCOUNT_FLAGS=()
OVR_DIR="$REPO_ROOT/scripts/overrides"
if [[ -d "$OVR_DIR" ]]; then
  for f in "$OVR_DIR"/*.json; do
    [[ -e "$f" ]] || continue
    PK=$(node -e 'console.log(require(process.argv[1]).pubkey)' "$f")
    ACCOUNT_FLAGS+=(--account "$PK" "$f")
    echo "[fork] override account $PK <- $(basename "$f")"
  done
fi

echo "[fork] cloning KLend program (upgradeable) + ${#CLONE_ACCTS[@]} accounts from $SRC_RPC"
echo "[fork] loading Holdline vault $VAULT_ID from $VAULT_SO"

rm -rf "$LEDGER"

exec solana-test-validator \
  --reset \
  --ledger "$LEDGER" \
  --url "$SRC_RPC" \
  --clone-upgradeable-program "$KLEND" \
  --clone-upgradeable-program "$FARMS" \
  "${CLONE_FLAGS[@]}" \
  ${ACCOUNT_FLAGS[@]+"${ACCOUNT_FLAGS[@]}"} \
  --bpf-program "$VAULT_ID" "$VAULT_SO" \
  --rpc-port 8899 \
  --quiet
