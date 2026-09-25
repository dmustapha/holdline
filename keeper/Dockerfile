# Holdline keeper — deployed, continuously-running autonomy service (E-1).
# Runs the poll loop as a real worker (not a hand-run script). Emits the public append-only
# autonomy log (evidence/keeper-log.jsonl) + liveness heartbeat (keeper/status.json).
FROM node:20-slim

WORKDIR /app

# Install deps from the workspace root (keeper is a workspace; adapters/core are siblings).
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY core ./core
COPY adapters ./adapters
COPY keeper ./keeper
COPY target/idl ./target/idl

RUN npm ci --omit=dev || npm install --omit=dev
RUN npm install ts-node typescript @types/node

# Persist evidence across restarts by mounting a volume at /app/evidence + /app/keeper.
VOLUME ["/app/evidence"]

# Credentials are injected as env (RPC_URL, KEEPER_SECRET, HOLDLINE_VAULT_PROGRAM_ID, XSTOCKS_MARKET,
# POLL_MS). The process exits non-zero with a clear "credentials required" message if any are missing.
CMD ["npx", "ts-node", "keeper/src/index.ts"]
