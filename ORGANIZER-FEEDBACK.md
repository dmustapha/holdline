# Organizer Feedback: Holdline on Solana + xStocks + Kamino KLend

_Built during the Stocklana hackathon. Field notes from actually shipping on your stack, sent in the spirit of making it better. Holdline is an on-chain repay-only protective vault plus an unattended keeper for Kamino xStock borrow positions. Everything below was hit during the real build and reproduced live on a mainnet fork of KLend, xStocks, and the oracle set._

## What Worked Well

- `KaminoMarket.load()` against the xStocks market cloned onto a local fork returned all 13 real reserves (SPYx, TSLAx, AAPLx, NVDAx, USDC and more) first try. The read side of `klend-sdk` was solid: `readLtvBps` returned a clean in-range integer (8028) off a cloned real obligation with no sentinel handling needed. Evidence: WIRE-REPORT.md Connection Graph, LT-BASE-01.
- The mainnet-fork path worked end to end for $0: clone the KLend upgradeable program, the xStocks market, every reserve/oracle/mint/vault it references, and a real borrower obligation, then run the whole hero flow locally. This let us prove an autonomous protective repay on real forked state without spending on a paid RPC or mainnet gas. Evidence: scripts/localnet-fork.sh, LIVETEST-REPORT.md Cold-Stranger Hero Gate.
- `KaminoAction.buildRepayTxns` emits the exact real repay instruction we could machine-check our on-chain enforcement against. That let us build a parity oracle proving our vault recognizes the SDK's own `repay_obligation_liquidity_v2` and rejects spoofs. A stable, honest builder output. Evidence: scripts/parity-oracle.ts, WIRE-REPORT.md FIX-2.
- `repay-on-behalf` (permissionless repay) is exactly the primitive this kind of protective product needs: anyone can repay an obligation's debt from their own USDC. The whole keeper design leans on it and it behaved as documented. Evidence: DOMAIN-GUIDE.md, RESOLVED-DECISION D-1.

## Friction & Suggestions

_Ordered by cost-to-discover: the items that ate the most build time come first, so a 30-second read surfaces what actually hurt._

### Kamino / KLend SDK

**What we hit:** Our first vault design called `repay_obligation_liquidity` via CPI. KLend hard-blocks repay via CPI: `check_refresh` / `is_forbidden_cpi_call` detects "Instruction was called via CPI!" and reverts with `CpiDisabled` (error 6080, `0x17c0`). This is not called out in the docs and only surfaced at runtime deep in simulation on the fork.
**Cost to discover:** high, this was the do-or-die item and forced a full architecture redesign of the fire path (spanned DEV-015 through DEV-016, roughly the C2 to C3 build window).
**Delta:** docs describe `repay_obligation_liquidity` as a normal instruction with no mention that a CPI caller is rejected. Actual: any CPI caller reverts with `CpiDisabled` `0x17c0`. The repay must be a top-level instruction (`refresh_reserve` + `refresh_obligation` + `repay`).
**Impact:** we could not sign the repay with a program PDA. We redesigned to a top-level keeper-signed repay and restored structural custody by having the vault introspect the Instructions sysvar (mirroring KLend's own `check_refresh` pattern) to require an atomic bound-obligation repay in the same transaction.
**Evidence:** BUILD-REPORT.md DEV-015, DEV-016; FEEDBACK.md item 3; WIRE-REPORT.md DH-4.
**Suggestion:** document the CPI restriction prominently on the repay/borrow instructions, and publish the recommended top-level composition (`refresh_reserve` + `refresh_obligation` + `repay`) so integrators do not design a CPI path first and discover this at runtime.
_Severity: BLOCKER_

**What we hit:** `klend-sdk@7.3.22` is `@solana/kit`-native (`createSolanaRpc`, `address`, `createKeyPairSignerFromBytes`), but most public snippets and examples still show `@solana/web3.js` (`Connection`, `PublicKey`, `Keypair`). Mixing the two throws opaque type and runtime errors.
**Cost to discover:** high, it invalidated the web3.js-shaped keeper and app-route code we had planned and pushed a rewrite of the whole adapter layer.
**Delta:** the SDK signatures assume kit types. `KaminoMarket.load` uses a `withReserves` flag (no `loadReserves()`), `getObligationByAddress` takes a kit `Address` and returns `| null`, and `buildBorrowTxns` / `buildRepayTxns` require `useV2Ixs` + `scopeRefreshConfig` (repay also `currentSlot`) with a `TransactionSigner` owner. The documented web3.js shapes do not match.
**Impact:** we quarantined all SDK calls behind a kit adapter and convert web3.js and kit at the boundary (re-hydrating `KaminoAction`'s kit instructions to `TransactionInstruction` for signing). The architecture's original keeper and app snippets had to be discarded, not copied.
**Evidence:** BUILD-REPORT.md DEV-004; FEEDBACK.md item 1; WIRE-REPORT.md DH-4.
**Suggestion:** pin an SDK-version to runtime-mapping table in the README and ship a kit-first quickstart, so integrators know 7.x is kit-native before they write web3.js against it.
_Severity: FRICTION_

**What we hit:** the repay instruction discriminator is absent from the shipped IDL. `repay_obligation_liquidity` carries `discriminator: none` in the bundled `dist/idl/klend.json`, so on-chain introspection code cannot look it up.
**Cost to discover:** medium, we had to reconstruct and then independently verify the bytes before trusting them.
**Delta:** IDL field `discriminator` is null for the repay instruction. We reproduced it as `sha256("global:repay_obligation_liquidity")[..8]` = `[145,178,13,225,76,240,147,72]` (V1) and `[116,174,213,76,180,53,210,144]` (V2), then verified byte-for-byte against the SDK's real `buildRepayTxns` output.
**Impact:** without it, our Instructions-sysvar enforcement (which must recognize the real repay in-tx) had no reliable constant to match on. We had to derive and cross-check it ourselves.
**Evidence:** BUILD-REPORT.md DEV-006; FEEDBACK.md item 2; scripts/parity-oracle.ts.
**Suggestion:** expose instruction discriminators (both V1 and V2) as exported SDK constants, or populate them in the shipped IDL.
_Severity: FRICTION_

**What we hit:** the V2 instructions (`useV2Ixs`, the SDK default) silently require the Kamino Farms program (`FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr`) to be present and executable. On a fork that omits it, the `refresh` / `repay` fail deep in simulation with a non-obvious error.
**Cost to discover:** medium, the failure surfaced far from its cause and took a simulation trace to attribute to a missing program.
**Delta:** the V2 refresh/repay path touches Kamino Farms state, but this dependency is not documented at the instruction-builder level. Absent Farms program → obscure late simulation failure rather than an early clear error.
**Impact:** we had to explicitly clone the Farms program into the fork as an upgradeable program. Any integrator building a fork or a custom test environment against V2 ixs will hit this.
**Evidence:** FEEDBACK.md item 4; WIRE-REPORT.md DH-4 (DEV-010 row); scripts/localnet-fork.sh (FARMS clone).
**Suggestion:** document that V2 ixs depend on the Farms program, and fail early with a clear message ("Farms program not found / not executable") instead of a deep simulation error.
_Severity: FRICTION_

**What we hit:** a transitive `programId` rename inside `@kamino-finance/farms-sdk` broke module resolution. `klend-sdk` `require()`s `@kamino-finance/farms-sdk/.../@codegen/farms/programId` (`PROGRAM_ID`), but farms-sdk 3.2.26 renamed it to `programs/farms` (`FARMS_PROGRAM_ADDRESS`).
**Cost to discover:** low to medium, a clear resolution error but it reproduces on every install including deploy, so it needed a durable fix.
**Delta:** `klend-sdk` expects `farms-sdk`'s old export path/name; farms-sdk 3.2.26 ships the renamed one. The two versions that npm resolves together do not agree.
**Impact:** the app would not build until we added a webpack alias plus a `postinstall` shim (`app/src/lib/server/farms-programId-shim.js`), which must run on every install including at deploy.
**Evidence:** BUILD-REPORT.md DEV-010; FEEDBACK.md item 5.
**Suggestion:** keep exported program-id constants stable across minor versions, or pin `klend-sdk`'s `farms-sdk` dependency to a compatible range so a fresh install resolves cleanly without a shim.
_Severity: FRICTION_

### xStocks / Token Tooling

**What we hit:** xStock collateral is Backed Finance Token-2022 with a transfer hook, so we could not simply mint or deposit synthetic xStock collateral into a test obligation. Every naive "create a borrow position for the demo" path runs into the Token-2022 deposit hook.
**Cost to discover:** medium, it shaped the entire seeding strategy rather than being a single blocker.
**Delta:** xStocks are Token-2022 with a transfer hook, unlike the legacy-SPL assets most Solana test tooling assumes. Standard mint-to / ATA-fund helpers do not cleanly produce a usable xStock collateral position.
**Impact:** we could not fabricate collateral. We had to discover and clone a real mainnet obligation that already carried genuine xStock collateral and USDC debt, then bind our vault to it, and we deliberately kept the repay currency in legacy USDC to avoid touching the hook on fire.
**Evidence:** scripts/find-live-obligation.ts (header comment on avoiding the Token-2022 xStock deposit hook); scripts/seed-fork.ts (header); DOMAIN-GUIDE.md (xStock / Token-2022 term, D-3).
**Suggestion:** a short "testing with xStock collateral" guide would help a lot: how to stand up a Token-2022 xStock position in a fork or test market, or a pointer to sample obligations builders can clone. This is the single biggest onboarding gap for anyone building on xStocks specifically rather than on KLend generally.
_Severity: FRICTION_

### RPC / Fork Infrastructure

**What we hit:** the whole clone-and-fork flow depends on discovering, from the market state, the full transitive set of accounts a `KaminoMarket.load()` needs: each reserve, its oracle accounts across four different providers (Pyth, Switchboard price, Switchboard TWAP, Scope), mints, supply vaults, and the global config. Miss one and the fork load fails.
**Cost to discover:** medium, spread across writing and hardening the discovery script until the fork loaded cleanly.
**Delta:** there is no published "accounts required to fork this market" manifest, so we had to write `discover-clone-accounts.ts` to walk the market and reserve state and emit the clone list ourselves, including four separate oracle-provider fields per reserve.
**Impact:** real build time on tooling that is arguably infrastructure the ecosystem could provide once. It works now and is reusable, but every team forking a Kamino market will re-derive this.
**Evidence:** scripts/discover-clone-accounts.ts (oracle set: pyth / switchboard-price / switchboard-twap / scope); scripts/localnet-fork.sh.
**Suggestion:** publish a helper (or document the exact account set) that, given a market address, emits the full clone list for `solana-test-validator`, including all oracle providers and the Farms program. This would turn a multi-hour tooling task into a one-liner and make forked testing the default for Kamino integrators.
_Severity: FRICTION_

**What we hit:** all account discovery and cloning ran against the public `https://api.mainnet-beta.solana.com` endpoint (the default in our discovery scripts). It works for a one-time clone but is the fragile part of the setup for anyone reproducing it.
**Cost to discover:** low, more an observation than a blocker for us.
**Delta:** the reproducible path defaults to the public RPC for the initial clone. That endpoint is heavily rate-limited and not a dependable base for repeated cloning of a large account set.
**Impact:** minor for us since the clone is one-time and then cached in the local ledger, but it is the most likely failure point when a judge or teammate reproduces the fork boot.
**Evidence:** scripts/discover-clone-accounts.ts and scripts/find-live-obligation.ts (`CLONE_SRC_RPC ?? "https://api.mainnet-beta.solana.com"`).
**Suggestion:** if a hackathon RPC endpoint or a Kamino-hosted archival snapshot were provided for the clone step, the fork-based testing story would be far more reliable for participants who do not already have a paid RPC.
_Severity: POLISH_

### Documentation / Developer Experience

**What we hit:** the Solana SBF build toolchain around Anchor 0.32.1 was the roughest non-Kamino part of setup. The installed `solana 2.2.14` `cargo-build-sbf` has a broken `--force-tools-install` that fails the SDK-path check before it can download platform-tools, and the advertised 1.18.20 was not actually present. Separately, several newer transitive crates require `edition2024` / rustc 1.85, which the SBF rustc (1.84.1) rejects.
**Cost to discover:** medium to high on first setup, and it recurs: any `cargo update` or unpinned `anchor build` re-resolves to the broken crates.
**Delta:** the documented toolchain (1.18.20) was not the one that actually built. We had to build with the `solana 2.3.0` SBF toolchain (platform-tools v1.48) and pin six transitive crates down in `Cargo.lock` to escape the edition2024 requirement.
**Impact:** every build session must prepend the 2.3.0 toolchain to PATH and keep the pinned `Cargo.lock` committed, or the build breaks. This is a standing footgun for the whole project.
**Evidence:** BUILD-REPORT.md DEV-003; DEBUG-REPORT.md Known Risks Disposition (Toolchain PATH).
**Suggestion:** this is upstream of Kamino (Solana/Anchor toolchain), but a hackathon starter note pinning a known-good `solana` / `anchor` / platform-tools combination for xStocks+KLend builds would save every Rust team the same afternoon. The generic `cargo-build-sbf --force-tools-install` failure is worth flagging to the Solana toolchain maintainers.
_Severity: FRICTION_

## At a Glance

| Category | BLOCKER | FRICTION | POLISH |
|---|---|---|---|
| Kamino / KLend SDK | 1 | 4 | 0 |
| xStocks / Token Tooling | 0 | 1 | 0 |
| RPC / Fork Infrastructure | 0 | 1 | 1 |
| Documentation / Developer Experience | 0 | 1 | 0 |

## Shareable Summary

Building Holdline on Kamino KLend and xStocks, the read side was genuinely pleasant: `KaminoMarket.load()` returned all 13 real reserves first try and `buildRepayTxns` gave us a stable real instruction to verify our enforcement against. The one thing that cost us the most was the undocumented CPI block on repay: our vault's repay-via-CPI reverted with `CpiDisabled` (`0x17c0`) only at runtime, which forced a full redesign to a top-level keeper-signed repay. Two smaller but real items: `klend-sdk` 7.x is `@solana/kit`-native while most public snippets still show `web3.js`, and the V2 instructions silently depend on the Farms program being executable (a fork without it fails deep in simulation). For anyone building specifically on xStocks, the Token-2022 transfer hook on collateral makes fabricating test positions hard, so a short "testing with xStock collateral" guide plus a "here are the accounts to clone to fork this market" helper would remove the biggest onboarding hurdle. Happy to share our fork-clone and parity-oracle scripts if useful.
