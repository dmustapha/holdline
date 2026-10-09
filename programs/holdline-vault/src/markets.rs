// File: programs/holdline-vault/src/markets.rs  [NEW — D2 §4.3]
// Per-market descriptor keyed on vault.market. The single-release / exact-amount / ≤live-debt
// guarantees in release_to_keeper are UNCHANGED and market-agnostic (INVARIANT #2 must not weaken);
// this module only moves the three coordinates that genuinely differ between markets:
//   (1) the obligation-owner program id (Rust account constraint),
//   (2) the repay-identity match (discriminator/tag + declared-amount offset + account indices),
//   (3) the live-debt read layout (stride / amount-offset / scale / region base).
// Kamino constants are VERIFIED-as-built; Save constants are [UNVERIFIED-build-gate] until the D2.3a
// sanity gate asserts the Rust-read debt == solend-sdk parseObligation debt on a live obligation.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use crate::errors::VaultError;

pub const KLEND_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
pub const SAVE_PROGRAM_ID: Pubkey = pubkey!("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");

// ── Kamino KLend obligation zero-copy layout (VERIFIED-as-built, cross-checked on fork) ──
const KAMINO_BORROWS_OFFSET: usize = 1208;
const KAMINO_BORROW_STRIDE: usize = 200;
const KAMINO_AMOUNT_OFFSET: usize = 88; // borrowedAmountSf u128, 2^60 Fraction
const KAMINO_NUM_BORROWS: usize = 5;
const KAMINO_FRACTION_SHIFT: u32 = 60;

// Kamino repay discriminators (anchor global:<name>): repay_obligation_liquidity V1 / V2.
const KAMINO_REPAY_V1: [u8; 8] = [145, 178, 13, 225, 76, 240, 147, 72];
const KAMINO_REPAY_V2: [u8; 8] = [116, 174, 213, 76, 180, 53, 210, 144];

// ── Save (Solend) obligation layout (UNVERIFIED-build-gate; SOURCE LOCK INVARIANTS.md L47) ──
// LEN=1300; dataFlat (deposits++borrows) begins at byte 204; deposits_len u8 @ 202; borrows region
// base = 204 + deposits_len*88; ObligationLiquidity stride 112; borrowReserve @ +0;
// borrowed_amount_wads u128 WAD @ +48, scaled /1e18.
const SAVE_LEN: usize = 1300;
const SAVE_DATAFLAT_OFFSET: usize = 204;
const SAVE_DEPOSITS_LEN_OFFSET: usize = 202;
const SAVE_DEPOSIT_STRIDE: usize = 88;
const SAVE_BORROW_STRIDE: usize = 112;
const SAVE_AMOUNT_OFFSET: usize = 48; // borrowed_amount_wads u128 WAD
const SAVE_BORROWS_LEN_OFFSET: usize = 203;
const SAVE_WAD: u128 = 1_000_000_000_000_000_000; // 1e18

#[derive(Clone, Copy, PartialEq)]
pub enum Market {
    Kamino,
    Save,
}

impl Market {
    pub fn from_u8(x: u8) -> Option<Self> {
        match x {
            0 => Some(Market::Kamino),
            1 => Some(Market::Save),
            _ => None,
        }
    }

    pub fn program_id(&self) -> Pubkey {
        match self {
            Market::Kamino => KLEND_PROGRAM_ID,
            Market::Save => SAVE_PROGRAM_ID,
        }
    }

    // Account index of the bound obligation WITHIN the market's repay ix.
    pub fn obligation_ix_index(&self) -> usize {
        match self {
            Market::Kamino => 1,
            Market::Save => 3,
        }
    }

    // Account index of the keeper source-token (released USDC) account WITHIN the repay ix.
    pub fn source_ix_index(&self) -> usize {
        match self {
            Market::Kamino => 6,
            Market::Save => 0,
        }
    }

    // Account index of the repay reserve WITHIN the repay ix — the reserve whose live debt caps the
    // release. Kamino repay layout: repay_reserve @ 3. Solend RepayObligationLiquidity layout:
    // [source_liquidity 0, dest_reserve_liquidity 1, repay_reserve 2, obligation 3, market 4, authority 5].
    pub fn repay_reserve_ix_index(&self) -> usize {
        match self {
            Market::Kamino => 3,
            Market::Save => 2,
        }
    }

    // Does the ix data identify a repay of THIS market? Returns the byte offset of the declared u64 LE
    // liquidity amount on match, else None. Kamino: 8-byte anchor discriminator (V1/V2), amount @ 8.
    // Save: single u8 tag 11, amount @ 1.
    pub fn is_repay(&self, data: &[u8]) -> Option<usize> {
        match self {
            Market::Kamino => {
                if data.len() >= 16 && (data[..8] == KAMINO_REPAY_V1 || data[..8] == KAMINO_REPAY_V2) {
                    Some(8)
                } else {
                    None
                }
            }
            Market::Save => {
                if data.len() >= 9 && data[0] == 11 {
                    Some(1)
                } else {
                    None
                }
            }
        }
    }
}

// Read the obligation's LIVE token debt (lamports) for `reserve` from raw account data, per-market
// layout. Returns 0 if the reserve is not among the obligation's borrows (→ any nonzero release is
// rejected by the <= debt cap). Fails closed on a too-small/unreadable account (BadObligation).
// Structurally identical across markets — only (region base, stride, amount offset, scale) differ.
pub fn obligation_debt_for_reserve(m: Market, data: &[u8], reserve: &Pubkey) -> Result<u64> {
    match m {
        Market::Kamino => read_debt_kamino(data, reserve),
        Market::Save => read_debt_save(data, reserve),
    }
}

fn read_debt_kamino(data: &[u8], reserve: &Pubkey) -> Result<u64> {
    let min_len = KAMINO_BORROWS_OFFSET + KAMINO_NUM_BORROWS * KAMINO_BORROW_STRIDE;
    require!(data.len() >= min_len, VaultError::BadObligation);
    for slot in 0..KAMINO_NUM_BORROWS {
        let base = KAMINO_BORROWS_OFFSET + slot * KAMINO_BORROW_STRIDE;
        let rk = Pubkey::try_from(&data[base..base + 32]).map_err(|_| VaultError::BadObligation)?;
        if &rk != reserve {
            continue;
        }
        let amt_at = base + KAMINO_AMOUNT_OFFSET;
        let mut le = [0u8; 16];
        le.copy_from_slice(&data[amt_at..amt_at + 16]);
        let sf = u128::from_le_bytes(le);
        return Ok((sf >> KAMINO_FRACTION_SHIFT) as u64);
    }
    Ok(0)
}

fn read_debt_save(data: &[u8], reserve: &Pubkey) -> Result<u64> {
    // Solend packs deposits before borrows with a deposits_len/borrows_len prefix; the borrows region
    // base is DYNAMIC. Read the prefixes first, then walk only the real borrow entries. Fails closed
    // on any length shortfall (BadObligation) — the safe direction.
    require!(data.len() >= SAVE_LEN, VaultError::BadObligation);
    let deposits_len = data[SAVE_DEPOSITS_LEN_OFFSET] as usize;
    let borrows_len = data[SAVE_BORROWS_LEN_OFFSET] as usize;
    let borrows_base = SAVE_DATAFLAT_OFFSET + deposits_len * SAVE_DEPOSIT_STRIDE;
    let region_end = borrows_base + borrows_len * SAVE_BORROW_STRIDE;
    require!(data.len() >= region_end, VaultError::BadObligation);
    for i in 0..borrows_len {
        let base = borrows_base + i * SAVE_BORROW_STRIDE;
        let rk = Pubkey::try_from(&data[base..base + 32]).map_err(|_| VaultError::BadObligation)?;
        if &rk != reserve {
            continue;
        }
        let amt_at = base + SAVE_AMOUNT_OFFSET;
        let mut le = [0u8; 16];
        le.copy_from_slice(&data[amt_at..amt_at + 16]);
        let wads = u128::from_le_bytes(le);
        // WAD divide (NOT the Kamino >>60 shift — applying the shift here reads a too-large debt, the
        // dangerous direction the D2.3a sanity gate exists to catch).
        return Ok((wads / SAVE_WAD) as u64);
    }
    Ok(0)
}
