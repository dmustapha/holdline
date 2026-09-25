# Builder Feedback, Kamino KLend SDK & Protocol

Real integration friction captured while building **Holdline** (an on-chain repay-only protective
vault + unattended keeper for Kamino xStock borrow positions) on the Stocklana hackathon. Every item
below cost real build/debug time and was resolved on a mainnet fork of KLend. Offered constructively
to the Kamino / `klend-sdk` maintainers.

## 1. `klend-sdk` migrated to `@solana/kit`, but public snippets are still `web3.js`
`@kamino-finance/klend-sdk@7.3.22` is `@solana/kit`-native (`createSolanaRpc`, `address`,
`createKeyPairSignerFromBytes`), yet most docs/examples still show `@solana/web3.js`
(`Connection`, `PublicKey`, `Keypair`). Mixing the two throws opaque type/runtime errors. We had to
quarantine all SDK calls behind a kit adapter and convert `web3.js` ⇄ kit at the boundary
(`KaminoAction` returns kit ixs; we re-hydrate to `TransactionInstruction` for signing).
**Ask:** pin the SDK version → runtime mapping in the README, and ship a kit-first quickstart.

## 2. Repay instruction discriminator is absent from the shipped IDL
`repay_obligation_liquidity` has no discriminator in the bundled `dist/idl/klend.json`, so on-chain
introspection code can't look it up. We reproduced it from
`sha256("global:repay_obligation_liquidity")[..8]` = `[145,178,13,225,76,240,147,72]` (V1) and
`[116,174,213,76,180,53,210,144]` (V2). Verified byte-for-byte against the SDK's real
`KaminoAction.buildRepayTxns` output (see `scripts/parity-oracle.ts`).
**Ask:** expose instruction discriminators (both V1 and V2) as SDK constants.

## 3. Repay via CPI is hard-blocked (`CpiDisabled`, err `0x17c0`), undocumented
Our first design had a vault program CPI-call `repay_obligation_liquidity`. KLend's
`check_refresh` / `is_forbidden_cpi_call` rejects it with `CpiDisabled` (`0x17c0`). This is not called
out in the docs and only surfaced at runtime on the fork. It forced a full redesign: the repay must be
a **top-level** keeper-signed ix, and we restored structural custody by having our vault introspect the
Instructions sysvar (mirroring KLend's own `check_refresh` pattern) to require an atomic bound-obligation
repay in the same transaction.
**Ask:** document the CPI restriction and the recommended top-level-repay pattern prominently.

## 4. V2 refresh/repay silently require the Farms program to be executable
`useV2Ixs` (the SDK default) builds `refresh`/`repay` ixs that touch Kamino Farms state and require
`FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr` to be present and executable. On a fork that omits it,
the repay fails deep in simulation with a non-obvious error. We had to explicitly clone the Farms
program into the fork.
**Ask:** note the Farms-program dependency for V2 ixs, and fail early with a clear message when it's
missing.

## 5. `farms-sdk` program-id rename required a postinstall shim
A transitive `programId` rename in `farms-sdk` broke resolution until we added a postinstall shim.
**Ask:** keep exported program-id constants stable across minor versions, or document the rename.

---
*All findings reproduced live on a KLend mainnet fork (`scripts/localnet-fork.sh`). Parity of our
enforcement against the real SDK repay ix is machine-checked in `scripts/parity-oracle.ts`
(PARITY: PASS, 3 positive controls rejected).*
