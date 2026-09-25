# SECURITY, Holdline

The custody guarantee is structural and ATOMIC. Kamino KLend hard-blocks
`repay_obligation_liquidity` via CPI (`CpiDisabled` / 0x17c0), so the vault cannot CPI-repay;
the repay must be a top-level, keeper-signed instruction. Rather than trust the keeper to repay
after receiving funds, `release_to_keeper` reads the Instructions sysvar and **requires** a klend
repay of the bound obligation, funded from exactly the released USDC, declaring **exactly** the
released amount, to appear later in the SAME transaction. Four binding checks make this tight:
(1) the repay's declared `liquidity_amount` must **equal** the released amount (`==`, not `>=`);
(2) the `u64::MAX` "repay-all" sentinel is **rejected**; (3) a transaction may contain **exactly one**
`release_to_keeper` (`MultipleReleases` otherwise) so two releases cannot piggyback one repay;
(4) the released amount must be **≤ the bound obligation's live debt** for the repay reserve, the
program reads the obligation's `borrowedAmountSf` on-chain (klend zero-copy layout, 2^60-scaled) and
reverts (`OverReleaseBeyondDebt`) if the release exceeds it, so a keeper cannot release more than is
owed and pocket the surplus klend leaves behind. If the bound repay is absent, the whole transaction
reverts (`RepayNotEnforced`). The keeper therefore can
never hold spendable released funds: the release and the repay of the bound obligation succeed or fail
together, atomically. No generic `withdraw`/`transfer` instruction exists. The only effective spend
paths are this atomic-release-requiring-repay and `reclaim` (owner-only). That is the guarantee.

All three checks are proven on the mainnet fork by positive controls (release-only → `RepayNotEnforced`;
two-releases-one-repay → `MultipleReleases`; `u64::MAX` sentinel and inexact amount → `RepayNotEnforced`;
over-release beyond live debt → `OverReleaseBeyondDebt`), alongside the passing hero (single atomic
release+repay reduces real debt). See `scripts/control-hardening.ts` and `submission/proof.md`.

## Threat matrix

| Threat | Enforcement | File |
|---|---|---|
| Keeper drains the reserve | Atomic enforcement: `release_to_keeper` reverts (`RepayNotEnforced`) unless a bound-obligation klend repay funded from the released USDC (declaring exactly `amount`) executes later in the SAME tx, release + repay are all-or-nothing | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper keeps the released funds instead of repaying | Same-tx repay requirement (Instructions-sysvar introspection); release and repay share one atomic transaction | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper double-releases (two releases satisfy one repay) | Exactly one `release_to_keeper` per tx enforced by self-scan → `MultipleReleases` | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper skims via `repay-all` sentinel / over-declared amount | Repay `liquidity_amount` must equal the released `amount` exactly; `u64::MAX` sentinel rejected | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper releases MORE than the obligation owes (surplus stays after klend caps the repay at real debt) | Live-debt cap: release must be ≤ `borrowedAmountSf` for the repay reserve, read on-chain from the obligation → `OverReleaseBeyondDebt` | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper repays the wrong obligation | Introspected repay must reference `vault.obligation` (account index 1) and `keeper_usdc` (index 6) | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper over-releases (beyond cap) | Cap check (`amount <= cap_per_fire`) | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Reclaim redirected to an attacker | Owner-only destination (`has_one = owner`) | programs/holdline-vault/src/instructions/reclaim.rs |
| Token-2022 transfer-hook abuse | Repay in legacy SPL USDC only | adapters/kamino/src/txns.ts, programs/holdline-vault |
| Unauthorized keeper invokes fire | Keeper signer constraint (`address = vault.keeper`) | programs/holdline-vault/src/instructions/release_to_keeper.rs |

## Not defended against

- **Keeper liveness.** A down keeper simply cannot fire; funds stay safe but a save can be
  missed. Disclosed, Solana has no native scheduler.
- **Market-open crashes.** Protect is a closed-hours guard by design; it does not defend
  intra-session volatility while markets are open.
- **Reserve smaller than the gap.** If the funded reserve is less than the required repay,
  the save is PARTIAL. Disclosed.
- **Kamino protocol risk.** Inherited from the underlying KLend protocol; out of scope for
  the vault program.
- **Keeper over-release beyond actual debt, CLOSED (was a bounded residual).** The vault now reads
  the bound obligation's live debt (`borrowedAmountSf` for the repay reserve, klend zero-copy layout,
  2^60-scaled) on-chain and reverts (`OverReleaseBeyondDebt`) if the release exceeds it. The read uses
  the stored pre-refresh debt (klend refreshes later in the same tx), so the cap is conservative, it
  can never over-allow. Offsets were cross-checked live on the fork against the klend SDK's own debt
  read (reserve pubkey exact match); positive control D (release > debt) reverts as required.
