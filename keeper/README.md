# Holdline Keeper

The unattended guardian. Polls every armed Holdline vault and, when a bound Kamino obligation
crosses its trigger LTV **while the equity market is closed**, fires a capped `release_repay` -
**signed by the keeper only, no user popup** (INVARIANT #1). The keeper cannot divert funds: the
only spend path is a capped Kamino repay CPI to the bound obligation, enforced by the on-chain
vault program.

## What it emits (autonomy evidence)

- `evidence/keeper-log.jsonl`, public, append-only, timestamped log. One line per poll tick
  (`{kind:"tick",ts,obligation,ltvBps,marketClosed,decision}`) and one per fire
  (`{kind:"fire",ts,sig,ltvBefore,ltvAfter}`). The fire's on-chain `blockTime` falls **between two
  logged polls** with no correlated human action, that gap is the autonomy proof.
- `keeper/status.json`, liveness heartbeat the frontend polls (fail-closed OFFLINE if stale).

Both are surfaced by the app: `/api/keeper/status` (liveness) and `/api/protect/keeper-status`
(autonomy evidence: `last_poll_ts` / `next_poll_ts` / `last_fire`).

## Run it as a real service (not a hand-run script)

The keeper is a **continuously-running worker**. Deploy it as a Railway/Fly worker or a cron job.

### Railway (Docker)

```bash
railway up            # uses keeper/railway.json -> keeper/Dockerfile
```

Set env vars in the Railway dashboard (never commit secrets):

| Var | Purpose |
|-----|---------|
| `RPC_URL` | Paid mainnet RPC (keeper reads + sends) |
| `KEEPER_SECRET` | base58 or JSON-array keypair, signs `release_repay` |
| `HOLDLINE_VAULT_PROGRAM_ID` | deployed vault program id |
| `XSTOCKS_MARKET` | `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua` |
| `POLL_MS` | poll cadence (default 60000) |
| `SAFE_BUFFER_BPS` | target LTV after repay (default 6000) |

Mount a volume at `/app/evidence` so the autonomy log persists across restarts.

### Fly.io (worker)

`fly launch --dockerfile keeper/Dockerfile`, set the same secrets with `fly secrets set`, and
attach a volume for `/app/evidence`.

### Cron alternative

A cron entry running `npx ts-node keeper/src/index.ts` on the poll cadence also works; the loop
fires once on boot then on its own interval, so a per-tick cron invocation is equivalent.

## Safety

- **No credentials => clean exit.** Missing/placeholder `RPC_URL`, `KEEPER_SECRET`,
  `HOLDLINE_VAULT_PROGRAM_ID`, or `XSTOCKS_MARKET` makes the process exit non-zero with a clear
  `credentials required: …` message. It never fabricates a fire, a signature, or log state.
- **Keeper liveness is a disclosed dependency**, a down keeper cannot fire. Not a trustless
  firing claim (INVARIANTS.md MUST-NOT-CLAIM).
