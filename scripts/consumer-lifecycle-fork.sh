#!/usr/bin/env bash
# scripts/consumer-lifecycle-fork.sh — close the Layer-5 gap: the full custody lifecycle,
# SIGNED + submitted on the network-free fork, with NO human wallet and NO real funds.
#   arm (init_vault + fund_reserve, owner-signed) -> keeper fire (release+repay, keeper-signed)
#   -> RECLAIM residual (owner-signed) -> assert owner USDC increased.
# Mirrors prove-offline.sh's boot (Kamino genesis inserts only), adds the reclaim leg before teardown.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/share/solana/install/releases/2.3.0/solana-release/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER="$ROOT/.localnet-ledger"
VAULT_ID="4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw"
if [[ -f "$ROOT/target/deploy/holdline_vault.so" ]]; then VAULT_SO="$ROOT/target/deploy/holdline_vault.so"; else VAULT_SO="$ROOT/programs/holdline_vault.so"; fi
rm -rf "$LEDGER"
if lsof -ti:8899 >/dev/null 2>&1; then echo "[lifecycle] port 8899 busy — aborting"; exit 1; fi

solana-test-validator --reset --ledger "$LEDGER" --rpc-port 8899 --quiet \
  --account-dir "$ROOT/accounts" \
  --upgradeable-program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD "$ROOT/programs/klend.so" none \
  --upgradeable-program FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr "$ROOT/programs/farms.so" none \
  --bpf-program "$VAULT_ID" "$VAULT_SO" &
VALIDATOR_PID=$!
trap 'kill "$VALIDATOR_PID" 2>/dev/null || true; rm -rf "$LEDGER"' EXIT

for i in $(seq 1 60); do
  curl -s http://127.0.0.1:8899 -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"result":"ok"' && break
  sleep 1; [[ $i -eq 60 ]] && { echo "[lifecycle] validator never healthy"; exit 1; }
done
echo "[lifecycle] validator healthy (network-free)"

export PROVE_RPC=http://127.0.0.1:8899 PROVE_MARKET=kamino RPC_URL=http://127.0.0.1:8899 LOCAL_RPC=http://127.0.0.1:8899 PROVE_SOURCE=fork
export HOLDLINE_VAULT_PROGRAM_ID="$VAULT_ID" XSTOCKS_MARKET=5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua
export KEEPER_SECRET="$(cat "${KEEPER_KEYPAIR:-$HOME/.config/solana/holdline-keeper.json}")"
# DEMO_WALLET (the vault owner keypair) is read from the project .env for the signed reclaim leg.
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a
export RPC_URL=http://127.0.0.1:8899  # re-assert after sourcing .env (which pins the mainnet RPC)
TS="$ROOT/node_modules/.bin/ts-node"

echo "=== ARM: fund wallets + seed (init_vault + fund_reserve, owner-signed) ==="
"$TS" "$ROOT/scripts/prove-fund-wallets.ts"
"$TS" "$ROOT/scripts/seed-fork.ts"
echo "=== FIRE: keeper release+repay (keeper-signed, unattended) ==="
"$TS" "$ROOT/scripts/fire-atomic.ts"
echo "=== RECLAIM: owner reclaims residual reserve (owner-signed) ==="
"$TS" "$ROOT/scripts/reclaim-fork.ts"
echo "[lifecycle] FULL CUSTODY LIFECYCLE SIGNED+EXECUTED ON THE FORK — arm -> fire -> reclaim"
