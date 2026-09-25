# SECURITY — Holdline

The custody guarantee is structural and ATOMIC. Kamino KLend hard-blocks
`repay_obligation_liquidity` via CPI (`CpiDisabled` / 0x17c0), so the vault cannot CPI-repay;
the repay must be a top-level, keeper-signed instruction. Rather than trust the keeper to repay
after receiving funds, `release_to_keeper` reads the Instructions sysvar and **requires** a klend
repay of the bound obligation — funded from exactly the released USDC, for ≥ the released amount —
to appear later in the SAME transaction. If it is absent, the whole transaction reverts
(`RepayNotEnforced`). The keeper therefore can never hold spendable released funds: the release and
the repay of the bound obligation succeed or fail together, atomically. No generic
`withdraw`/`transfer` instruction exists. The only effective spend paths are this
atomic-release-requiring-repay and `reclaim` (owner-only). That is the guarantee.

## Threat matrix

| Threat | Enforcement | File |
|---|---|---|
| Keeper drains the reserve | Atomic enforcement: `release_to_keeper` reverts (`RepayNotEnforced`) unless a bound-obligation klend repay funded from the released USDC (≥ amount) executes later in the SAME tx — release + repay are all-or-nothing | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper keeps the released funds instead of repaying | Same-tx repay requirement (Instructions-sysvar introspection); release and repay share one atomic transaction | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper repays the wrong obligation | Introspected repay must reference `vault.obligation` (account index 1) and `keeper_usdc` (index 6) | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Keeper over-releases | Cap check (`amount <= cap_per_fire`) | programs/holdline-vault/src/instructions/release_to_keeper.rs |
| Reclaim redirected to an attacker | Owner-only destination (`has_one = owner`) | programs/holdline-vault/src/instructions/reclaim.rs |
| Token-2022 transfer-hook abuse | Repay in legacy SPL USDC only | adapters/kamino/src/txns.ts, programs/holdline-vault |
| Unauthorized keeper invokes fire | Keeper signer constraint (`address = vault.keeper`) | programs/holdline-vault/src/instructions/release_to_keeper.rs |

## Not defended against

- **Keeper liveness.** A down keeper simply cannot fire; funds stay safe but a save can be
  missed. Disclosed — Solana has no native scheduler.
- **Market-open crashes.** Protect is a closed-hours guard by design; it does not defend
  intra-session volatility while markets are open.
- **Reserve smaller than the gap.** If the funded reserve is less than the required repay,
  the save is PARTIAL. Disclosed.
- **Kamino protocol risk.** Inherited from the underlying KLend protocol; out of scope for
  the vault program.
