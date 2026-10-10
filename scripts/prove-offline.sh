#!/usr/bin/env bash
# File: scripts/prove-offline.sh
# [VERIFIED] NETWORK-FREE reproducible mainnet-fork proof. Boot uses ONLY genesis inserts; it never
# resolves any account against a live RPC. The INVARIANT #5 grep gate must find ZERO network flags here.
set -euo pipefail
# Prefer the validated Agave release (active_release => 2.2.14 on this machine), fall back to 2.3.0.
# DEV-002: arch §3.3 hardcodes the 2.3.0 path; the active/validated toolchain here is 2.2.14 and all
# required genesis-insert flags (--account-dir / --upgradeable-program <id> <so> none / --bpf-program /
# --reset) are present on both. We use active_release so the boot never silently falls back to a stale PATH.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/share/solana/install/releases/2.3.0/solana-release/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER="$ROOT/.localnet-ledger"
VAULT_ID="4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw"
MARKET="${1:-kamino}"   # kamino | save
# Vault program binary: prefer a fresh local build (target/deploy), else the COMMITTED fixture
# (programs/holdline_vault.so) so a cold judge who clones can run prove without anchor-building.
if [[ -f "$ROOT/target/deploy/holdline_vault.so" ]]; then VAULT_SO="$ROOT/target/deploy/holdline_vault.so";
else VAULT_SO="$ROOT/programs/holdline_vault.so"; fi
rm -rf "$LEDGER"

# Fail fast if the proof would silently fake-pass (no fixtures) or port is taken.
[[ -d "$ROOT/accounts" ]] || { echo "[prove] accounts/ fixtures missing — run npm run prove:capture first"; exit 1; }
[[ -f "$VAULT_SO" ]] || { echo "[prove] vault .so missing (no target/deploy build and no committed programs/holdline_vault.so fixture)"; exit 1; }
if lsof -ti:8899 >/dev/null 2>&1; then echo "[prove] port 8899 busy — aborting (no silent reuse)"; exit 1; fi

# Save (Solend) RefreshReserve computes interest over (current_slot - reserve.last_update.slot). The
# cloned reserve carries a mainnet slot (~4.5e8); a fork booting at slot 0 underflows that subtraction
# -> "Math operation overflow" (0xe). Warp the fork to the captured reserve's last_update slot so the
# elapsed-slot math is small and valid. Kamino uses its own SDK scope refresh and needs no warp.
WARP_FLAG=()
if [[ "$MARKET" == save && -f "$ROOT/scripts/save-obligation.json" ]]; then
  WARP_SLOT="$("$ROOT/node_modules/.bin/ts-node" -e '
    const fs=require("fs");const r=require("@solendprotocol/solend-sdk/state/reserve");
    const so=JSON.parse(fs.readFileSync("scripts/save-obligation.json","utf8"));
    const j=JSON.parse(fs.readFileSync("accounts/"+so.repayReserve+".json","utf8"));
    const p=r.parseReserve({toBase58:()=>"x"},{data:Buffer.from(j.account.data[0],"base64")});
    process.stdout.write(p.info.lastUpdate.slot.toString());
  ')"
  echo "[prove] Save path — warping fork to reserve last_update slot $WARP_SLOT"
  WARP_FLAG=(--warp-slot "$WARP_SLOT")
fi

solana-test-validator --reset --ledger "$LEDGER" --rpc-port 8899 --quiet "${WARP_FLAG[@]+"${WARP_FLAG[@]}"}" \
  --account-dir "$ROOT/accounts" \
  --upgradeable-program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD "$ROOT/programs/klend.so" none \
  --upgradeable-program FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr "$ROOT/programs/farms.so" none \
  --upgradeable-program So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo "$ROOT/programs/save.so" none \
  --bpf-program "$VAULT_ID" "$VAULT_SO" &
VALIDATOR_PID=$!
trap 'kill "$VALIDATOR_PID" 2>/dev/null || true; rm -rf "$LEDGER"' EXIT

for i in $(seq 1 60); do
  if curl -s http://127.0.0.1:8899 -X POST -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"result":"ok"'; then break; fi
  sleep 1; [[ $i -eq 60 ]] && { echo "[prove] validator never healthy"; exit 1; }
done
echo "[prove] validator healthy (network-free) — market=$MARKET"

# PROVE_RPC/PROVE_MARKET per arch §3.3; RPC_URL/LOCAL_RPC are what the as-built downstream scripts read
# (DEV-003), so export all so the fork RPC flows through unchanged. PROVE_SOURCE tags ledger rows "fork".
export PROVE_RPC=http://127.0.0.1:8899 PROVE_MARKET="$MARKET"
export RPC_URL=http://127.0.0.1:8899 LOCAL_RPC=http://127.0.0.1:8899 PROVE_SOURCE=fork
# Keeper config for loadArmedVaults (pinned SOURCE LOCK ids). KEEPER_SECRET points the config guard at
# the same keeper keypair used to sign the fire; no placeholder values (requireEnv would reject those).
export HOLDLINE_VAULT_PROGRAM_ID="$VAULT_ID"
export XSTOCKS_MARKET=5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua
export KEEPER_SECRET="$(cat "${KEEPER_KEYPAIR:-$HOME/.config/solana/holdline-keeper.json}")"
TS="$ROOT/node_modules/.bin/ts-node"

# Fund the demo (vault owner) + keeper wallets from the LOCAL validator faucet so seed/fire can pay
# fees. This is the test-validator's own loopback faucet (127.0.0.1) — NOT a network dependency
# (the INVARIANT #5 gate bans only the boot genesis network flags). DEV-004: the as-built flow funded
# these wallets out-of-band; the network-free prove must self-fund them to run from a clean --reset.
"$TS" "$ROOT/scripts/prove-fund-wallets.ts"
"$TS" "$ROOT/scripts/prove-fork-loads.ts"                       # cloned state loads
if [[ "$MARKET" == save ]]; then "$TS" "$ROOT/scripts/save-seed-fork.ts"; else "$TS" "$ROOT/scripts/seed-fork.ts"; fi
"$TS" "$ROOT/scripts/fire-atomic.ts"                            # the atomic save (appends evidence/saves.jsonl)
"$TS" "$ROOT/scripts/control-hardening.ts"                      # 6 adversarial diverts all revert
echo "[prove] PASS — saves ledger:"; tail -n 3 "$ROOT/evidence/saves.jsonl"
