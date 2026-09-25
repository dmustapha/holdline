# SECURITY — Holdline

The custody guarantee is structural: the Holdline Vault program exposes exactly one spend
path (`release_repay`), a capped Kamino repay CPI hard-bound to the vault's obligation. No
generic `withdraw`/`transfer` instruction exists. That absence IS the guarantee.

## Threat matrix

| Threat | Enforcement | File |
|---|---|---|
| Keeper drains the reserve | No non-repay spend path exists (only a capped Kamino repay CPI) | programs/holdline-vault/src/instructions/release_repay.rs |
| Keeper sends funds to an attacker | Obligation address-constraint (`address = vault.obligation`) | programs/holdline-vault/src/instructions/release_repay.rs |
| Keeper over-repays | Cap check (`repay_amount <= cap_per_fire`) | programs/holdline-vault/src/instructions/release_repay.rs |
| Reclaim redirected to an attacker | Owner-only destination (`has_one = owner`) | programs/holdline-vault/src/instructions/reclaim.rs |
| Token-2022 transfer-hook abuse | Repay in legacy SPL USDC only | adapters/kamino/src/txns.ts, programs/holdline-vault |
| Unauthorized keeper invokes fire | Keeper signer constraint (`address = vault.keeper`) | programs/holdline-vault/src/instructions/release_repay.rs |

## Not defended against

- **Keeper liveness.** A down keeper simply cannot fire; funds stay safe but a save can be
  missed. Disclosed — Solana has no native scheduler.
- **Market-open crashes.** Protect is a closed-hours guard by design; it does not defend
  intra-session volatility while markets are open.
- **Reserve smaller than the gap.** If the funded reserve is less than the required repay,
  the save is PARTIAL. Disclosed.
- **Kamino protocol risk.** Inherited from the underlying KLend protocol; out of scope for
  the vault program.
