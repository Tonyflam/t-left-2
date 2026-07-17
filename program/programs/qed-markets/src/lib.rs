//! # QED Markets — every payout is a proven theorem. ∎
//!
//! A trustless parimutuel prediction market for the 2026 World Cup, settled by
//! a single CPI into TxLINE's `txoracle::validate_stat_v2` Merkle-proof
//! verifier.
//!
//! ## Trust model
//! * **Creation** is permissionless. A market pins: a TxLINE fixture, a
//!   conjunction of stat legs (the "YES theorem"), the oracle program id, the
//!   staking mint, and its schedule. None of it can change afterwards.
//! * **Staking** is open until the deadline (kickoff).
//! * **Settlement** is permissionless and proof-gated. The settler supplies
//!   only the Merkle proof bundle; the program compiles the strategy from the
//!   immutable market legs, enforces the provable-finality gate
//!   (`ScoreStat.period == 100`, i.e. the stat comes from a `game_finalised`
//!   record), re-derives the oracle's daily-root PDA, and CPIs
//!   `validate_stat_v2`. A forged proof reverts inside the oracle; a true
//!   proof flips the market and pays the settler a bounty. NO outcomes are
//!   proven via the on-chain De Morgan negation engine (see `strategy.rs`).
//! * **Claiming** pays winners pro-rata from the losing pool. If the oracle
//!   never finalises (abandonment), the market voids after a grace window and
//!   everyone refunds in full. Funds can never strand.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod errors;
pub mod state;
pub mod strategy;
pub mod txoracle;

use errors::QedError;
use state::*;
use strategy::EqBranch;
use txoracle::{daily_scores_roots_pda, StatValidationInput};

declare_id!("hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C");

const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod qed_markets {
    use super::*;

    /// Create a market: pin fixture, legs, oracle, mint and schedule forever.
    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        fixture_id: i64,
        legs: Vec<Leg>,
        deadline_ts: i64,
        settle_after_ts_ms: i64,
        void_after_ts: i64,
        required_period: i32,
        fee_bps: u16,
        bounty_bps: u16,
        label: String,
    ) -> Result<()> {
        strategy::validate_legs(&legs)?;
        require!(label.len() <= MAX_LABEL_LEN, QedError::LabelTooLong);
        require!(
            (fee_bps as u64) + (bounty_bps as u64) < BPS_DENOMINATOR,
            QedError::InvalidFees
        );
        // deadline (s) must precede the settlement window (ms) and the void
        // grace window must come after both.
        require!(
            deadline_ts > 0
                && settle_after_ts_ms > deadline_ts * 1_000
                && void_after_ts * 1_000 > settle_after_ts_ms,
            QedError::InvalidSchedule
        );

        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.market_id = market_id;
        market.fixture_id = fixture_id;
        market.mint = ctx.accounts.mint.key();
        market.deadline_ts = deadline_ts;
        market.settle_after_ts_ms = settle_after_ts_ms;
        market.void_after_ts = void_after_ts;
        market.legs = legs;
        market.required_period = required_period;
        market.yes_pool = 0;
        market.no_pool = 0;
        market.status = MarketStatus::Open;
        market.fee_bps = fee_bps;
        market.bounty_bps = bounty_bps;
        market.fee_treasury = ctx.accounts.fee_treasury.key();
        market.settled_at = 0;
        market.settler = Pubkey::default();
        market.distributable = 0;
        market.oracle_program = ctx.accounts.oracle_program.key();
        market.bump = ctx.bumps.market;
        market.label = label;

        emit!(MarketCreated {
            market: market.key(),
            market_id,
            fixture_id,
            deadline_ts,
        });
        Ok(())
    }

    /// Stake on YES or NO before the deadline.
    pub fn stake(ctx: Context<Stake>, side: Side, amount: u64) -> Result<()> {
        require!(amount > 0, QedError::ZeroStake);
        let market = &mut ctx.accounts.market;
        require!(market.is_open(), QedError::MarketNotOpen);
        require!(
            Clock::get()?.unix_timestamp < market.deadline_ts,
            QedError::BettingClosed
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staker_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            ),
            amount,
        )?;

        match side {
            Side::Yes => {
                market.yes_pool = market
                    .yes_pool
                    .checked_add(amount)
                    .ok_or(QedError::MathOverflow)?
            }
            Side::No => {
                market.no_pool = market
                    .no_pool
                    .checked_add(amount)
                    .ok_or(QedError::MathOverflow)?
            }
        }

        let position = &mut ctx.accounts.position;
        position.market = market.key();
        position.owner = ctx.accounts.staker.key();
        position.side = side;
        position.amount = position
            .amount
            .checked_add(amount)
            .ok_or(QedError::MathOverflow)?;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        emit!(Staked {
            market: market.key(),
            staker: ctx.accounts.staker.key(),
            side,
            amount,
        });
        Ok(())
    }

    /// Prove the YES theorem: the payload must Merkle-prove every leg's stat
    /// slots from a `game_finalised` record; the strategy is compiled on-chain
    /// and verified by `validate_stat_v2` in one CPI.
    pub fn settle_yes(ctx: Context<Settle>, payload: StatValidationInput) -> Result<()> {
        let expected_keys = strategy::expected_slot_keys(&ctx.accounts.market.legs);
        let compiled = strategy::compile_yes_strategy(&ctx.accounts.market.legs)?;
        verify_and_settle(ctx, payload, expected_keys, compiled, MarketStatus::SettledYes)
    }

    /// Prove NO by De Morgan: name the failed leg (and, for equality legs,
    /// which side reality landed on); the program derives the negated
    /// predicate itself and demands a Merkle proof of it.
    pub fn settle_no(
        ctx: Context<Settle>,
        payload: StatValidationInput,
        failed_leg_index: u8,
        eq_branch: Option<EqBranch>,
    ) -> Result<()> {
        let (compiled, expected_keys) = strategy::compile_no_strategy(
            &ctx.accounts.market.legs,
            failed_leg_index as usize,
            eq_branch,
        )?;
        verify_and_settle(ctx, payload, expected_keys, compiled, MarketStatus::SettledNo)
    }

    /// Stage a slice of a serialized `StatValidationInput` into the settler's
    /// proof buffer. Multi-leg parlay proofs exceed the 1232-byte transaction
    /// cap, so they are uploaded in chunks and settled with
    /// `settle_yes_buffered` / `settle_no_buffered`.
    pub fn write_proof_chunk(
        ctx: Context<WriteProofChunk>,
        offset: u32,
        chunk: Vec<u8>,
    ) -> Result<()> {
        let buf = &mut ctx.accounts.proof_buffer;
        buf.owner = ctx.accounts.settler.key();
        buf.market = ctx.accounts.market.key();
        if offset == 0 {
            buf.data.clear(); // restart any previous staging
        }
        let end = (offset as usize)
            .checked_add(chunk.len())
            .ok_or(QedError::MathOverflow)?;
        require!(end <= MAX_PROOF_BYTES, QedError::ProofTooLarge);
        if buf.data.len() < end {
            buf.data.resize(end, 0);
        }
        buf.data[offset as usize..end].copy_from_slice(&chunk);
        Ok(())
    }

    /// Settle YES from a previously staged proof buffer (parlay-sized proofs).
    pub fn settle_yes_buffered(ctx: Context<SettleBuffered>) -> Result<()> {
        let payload = deserialize_buffered_payload(&ctx.accounts.proof_buffer)?;
        let expected_keys = strategy::expected_slot_keys(&ctx.accounts.market.legs);
        let compiled = strategy::compile_yes_strategy(&ctx.accounts.market.legs)?;
        verify_and_settle_buffered(ctx, payload, expected_keys, compiled, MarketStatus::SettledYes)
    }

    /// Settle NO from a previously staged proof buffer.
    pub fn settle_no_buffered(
        ctx: Context<SettleBuffered>,
        failed_leg_index: u8,
        eq_branch: Option<EqBranch>,
    ) -> Result<()> {
        let payload = deserialize_buffered_payload(&ctx.accounts.proof_buffer)?;
        let (compiled, expected_keys) = strategy::compile_no_strategy(
            &ctx.accounts.market.legs,
            failed_leg_index as usize,
            eq_branch,
        )?;
        verify_and_settle_buffered(ctx, payload, expected_keys, compiled, MarketStatus::SettledNo)
    }

    /// Winners claim stake + pro-rata share of the losing pool.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        let winning = market.winning_side().ok_or(QedError::MarketNotSettled)?;
        require!(position.side == winning, QedError::NotAWinner);
        require!(!position.claimed, QedError::AlreadyClaimed);

        let winning_pool = market.pool(winning);
        require!(winning_pool > 0, QedError::NothingToClaim);

        // payout = stake + stake * distributable / winning_pool  (u128-safe)
        let share = (position.amount as u128)
            .checked_mul(market.distributable as u128)
            .ok_or(QedError::MathOverflow)?
            .checked_div(winning_pool as u128)
            .ok_or(QedError::MathOverflow)? as u64;
        let payout = position
            .amount
            .checked_add(share)
            .ok_or(QedError::MathOverflow)?;

        position.claimed = true;
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.claimer_token,
            &ctx.accounts.market,
            payout,
        )?;

        emit!(Claimed {
            market: market.key(),
            claimer: ctx.accounts.claimer.key(),
            payout,
        });
        Ok(())
    }

    /// If the market is still open after its grace window (abandoned fixture,
    /// oracle outage), anyone can void it. All stakes become refundable.
    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.is_open(), QedError::MarketNotOpen);
        require!(
            Clock::get()?.unix_timestamp >= market.void_after_ts,
            QedError::VoidTooEarly
        );
        market.status = MarketStatus::Voided;
        emit!(MarketVoided {
            market: market.key()
        });
        Ok(())
    }

    /// Refund paths that make stranding impossible:
    /// * voided market → every position refunds in full;
    /// * settled market whose winning pool is empty → losing positions refund
    ///   in full (there is nobody to pay the losing pool to).
    pub fn claim_refund(ctx: Context<Claim>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        require!(!position.claimed, QedError::AlreadyClaimed);

        let refundable = match market.status {
            MarketStatus::Voided => true,
            MarketStatus::SettledYes | MarketStatus::SettledNo => {
                let winning = market.winning_side().unwrap();
                market.pool(winning) == 0 && position.side != winning
            }
            MarketStatus::Open => false,
        };
        require!(refundable, QedError::RefundUnavailable);

        position.claimed = true;
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.claimer_token,
            &ctx.accounts.market,
            position.amount,
        )?;

        emit!(Refunded {
            market: market.key(),
            claimer: ctx.accounts.claimer.key(),
            amount: position.amount,
        });
        Ok(())
    }
}

/// Shared settlement wrapper for the single-transaction path.
fn verify_and_settle(
    ctx: Context<Settle>,
    payload: StatValidationInput,
    expected_keys: Vec<u32>,
    compiled: txoracle::NDimensionalStrategy,
    outcome: MarketStatus,
) -> Result<()> {
    settle_core(
        &ctx.accounts.settler,
        &mut ctx.accounts.market,
        &ctx.accounts.vault,
        &ctx.accounts.settler_token,
        &ctx.accounts.fee_treasury_token,
        &ctx.accounts.oracle_program,
        &ctx.accounts.daily_scores_roots,
        &ctx.accounts.token_program,
        payload,
        expected_keys,
        compiled,
        outcome,
    )
}

/// Shared settlement wrapper for the staged-buffer path (parlay-sized proofs).
/// The buffer account is closed back to the settler by Anchor on success.
fn verify_and_settle_buffered(
    ctx: Context<SettleBuffered>,
    payload: StatValidationInput,
    expected_keys: Vec<u32>,
    compiled: txoracle::NDimensionalStrategy,
    outcome: MarketStatus,
) -> Result<()> {
    settle_core(
        &ctx.accounts.settler,
        &mut ctx.accounts.market,
        &ctx.accounts.vault,
        &ctx.accounts.settler_token,
        &ctx.accounts.fee_treasury_token,
        &ctx.accounts.oracle_program,
        &ctx.accounts.daily_scores_roots,
        &ctx.accounts.token_program,
        payload,
        expected_keys,
        compiled,
        outcome,
    )
}

fn deserialize_buffered_payload(buf: &Account<ProofBuffer>) -> Result<StatValidationInput> {
    StatValidationInput::try_from_slice(&buf.data).map_err(|_| QedError::MalformedProof.into())
}

/// Settlement core shared by both paths.
#[allow(clippy::too_many_arguments)]
fn settle_core<'info>(
    settler: &Signer<'info>,
    market: &mut Account<'info, Market>,
    vault: &Account<'info, TokenAccount>,
    settler_token: &Account<'info, TokenAccount>,
    fee_treasury_token: &Account<'info, TokenAccount>,
    oracle_program: &UncheckedAccount<'info>,
    daily_scores_roots: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    payload: StatValidationInput,
    expected_keys: Vec<u32>,
    compiled: txoracle::NDimensionalStrategy,
    outcome: MarketStatus,
) -> Result<()> {
    let market_key = market.key();
    require!(market.is_open(), QedError::MarketNotOpen);
    require!(
        Clock::get()?.unix_timestamp >= market.deadline_ts,
        QedError::SettlementTooEarly
    );

    // ── Gate 1: the proof is about our fixture ─────────────────────────────
    require!(
        payload.fixture_summary.fixture_id == market.fixture_id,
        QedError::FixtureMismatch
    );

    // ── Gate 2: internal timestamp consistency + post-full-time batch ──────
    require!(
        payload.ts == payload.fixture_summary.update_stats.min_timestamp,
        QedError::TimestampMismatch
    );
    require!(
        payload.fixture_summary.update_stats.max_timestamp >= market.settle_after_ts_ms,
        QedError::ProofTooOld
    );

    // ── Gate 3: provable finality — every stat leaf must come from a
    //            game_finalised record (period == 100) ─────────────────────
    require!(
        payload.stats.len() == expected_keys.len(),
        QedError::StatSlotMismatch
    );
    for (leaf, expected_key) in payload.stats.iter().zip(expected_keys.iter()) {
        require!(leaf.stat.key == *expected_key, QedError::StatSlotMismatch);
        require!(
            leaf.stat.period == market.required_period,
            QedError::NotFinalised
        );
    }

    // ── Gate 4: the oracle program and its daily-root PDA are the real ones ─
    require_keys_eq!(
        oracle_program.key(),
        market.oracle_program,
        QedError::WrongOracleProgram
    );
    let (expected_root, _) = daily_scores_roots_pda(payload.ts, &market.oracle_program)?;
    require_keys_eq!(
        daily_scores_roots.key(),
        expected_root,
        QedError::WrongDailyRootAccount
    );

    // ── The proof itself: one CPI. Forged proofs revert inside the oracle. ──
    let verdict =
        txoracle::cpi_validate_stat_v2(oracle_program, daily_scores_roots, &payload, &compiled)?;
    require!(verdict, QedError::OracleSaysNo);

    // ── Payout bookkeeping ──────────────────────────────────────────────────
    market.status = outcome;
    market.settled_at = Clock::get()?.unix_timestamp;
    market.settler = settler.key();

    let winning = market.winning_side().unwrap();
    let losing_pool = match winning {
        Side::Yes => market.no_pool,
        Side::No => market.yes_pool,
    };
    let winning_pool = market.pool(winning);

    let (bounty, fee) = if winning_pool == 0 || losing_pool == 0 {
        // Nobody to pay or nobody to pay from — skip cuts so refunds stay whole.
        (0u64, 0u64)
    } else {
        (
            mul_bps(losing_pool, market.bounty_bps)?,
            mul_bps(losing_pool, market.fee_bps)?,
        )
    };
    market.distributable = losing_pool
        .checked_sub(bounty)
        .and_then(|v| v.checked_sub(fee))
        .ok_or(QedError::MathOverflow)?;

    let proven: Vec<i32> = payload.stats.iter().map(|s| s.stat.value).collect();

    if bounty > 0 {
        transfer_from_vault(token_program, vault, settler_token, market, bounty)?;
    }
    if fee > 0 {
        transfer_from_vault(token_program, vault, fee_treasury_token, market, fee)?;
    }

    emit!(MarketSettled {
        market: market_key,
        outcome,
        settler: settler.key(),
        bounty,
        fee,
        proof_ts_ms: payload.ts,
        event_stat_root: payload.event_stat_root,
        proven_values: proven,
    });
    Ok(())
}

fn mul_bps(amount: u64, bps: u16) -> Result<u64> {
    Ok(((amount as u128)
        .checked_mul(bps as u128)
        .ok_or(QedError::MathOverflow)?
        / BPS_DENOMINATOR as u128) as u64)
}

fn transfer_from_vault<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    market: &Account<'info, Market>,
    amount: u64,
) -> Result<()> {
    let market_id_bytes = market.market_id.to_le_bytes();
    let seeds: &[&[u8]] = &[Market::SEED, market_id_bytes.as_ref(), &[market.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault.to_account_info(),
                to: to.to_account_info(),
                authority: market.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

// ─────────────────────────── Accounts ───────────────────────────

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED, market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Token account (of `mint`) that receives protocol fees.
    #[account(constraint = fee_treasury.mint == mint.key() @ QedError::InvalidFees)]
    pub fee_treasury: Account<'info, TokenAccount>,
    /// CHECK: pinned into the market; settlement re-checks it and re-derives
    /// the daily-root PDA against it. The UI only surfaces markets pinned to
    /// the canonical TxLINE oracle.
    pub oracle_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: Side)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = staker_token.mint == market.mint @ QedError::StatSlotMismatch,
        constraint = staker_token.owner == staker.key() @ QedError::StatSlotMismatch
    )]
    pub staker_token: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = staker,
        space = 8 + Position::INIT_SPACE,
        seeds = [
            Position::SEED,
            market.key().as_ref(),
            staker.key().as_ref(),
            &[side as u8]
        ],
        bump
    )]
    pub position: Account<'info, Position>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Bounty destination — any token account of the market's mint.
    #[account(
        mut,
        constraint = settler_token.mint == market.mint @ QedError::InvalidFees
    )]
    pub settler_token: Account<'info, TokenAccount>,
    /// Must be the exact fee treasury pinned at creation.
    #[account(
        mut,
        constraint = fee_treasury_token.key() == market.fee_treasury @ QedError::InvalidFees
    )]
    pub fee_treasury_token: Account<'info, TokenAccount>,
    /// CHECK: address equality against `market.oracle_program` is enforced in
    /// the handler before the CPI.
    pub oracle_program: UncheckedAccount<'info>,
    /// CHECK: re-derived in the handler from the payload timestamp and the
    /// pinned oracle program id.
    pub daily_scores_roots: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [
            Position::SEED,
            market.key().as_ref(),
            claimer.key().as_ref(),
            &[position.side as u8]
        ],
        bump = position.bump,
        constraint = position.owner == claimer.key() @ QedError::NotAWinner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = claimer_token.mint == market.mint @ QedError::NothingToClaim,
        constraint = claimer_token.owner == claimer.key() @ QedError::NothingToClaim
    )]
    pub claimer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct WriteProofChunk<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed,
        payer = settler,
        space = 8 + ProofBuffer::SPACE,
        seeds = [ProofBuffer::SEED, market.key().as_ref(), settler.key().as_ref()],
        bump
    )]
    pub proof_buffer: Account<'info, ProofBuffer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBuffered<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Bounty destination — any token account of the market's mint.
    #[account(
        mut,
        constraint = settler_token.mint == market.mint @ QedError::InvalidFees
    )]
    pub settler_token: Account<'info, TokenAccount>,
    /// Must be the exact fee treasury pinned at creation.
    #[account(
        mut,
        constraint = fee_treasury_token.key() == market.fee_treasury @ QedError::InvalidFees
    )]
    pub fee_treasury_token: Account<'info, TokenAccount>,
    /// CHECK: address equality against `market.oracle_program` is enforced in
    /// the handler before the CPI.
    pub oracle_program: UncheckedAccount<'info>,
    /// CHECK: re-derived in the handler from the payload timestamp and the
    /// pinned oracle program id.
    pub daily_scores_roots: UncheckedAccount<'info>,
    /// Staged payload; closed back to the settler on success (rent-neutral).
    #[account(
        mut,
        close = settler,
        seeds = [ProofBuffer::SEED, market.key().as_ref(), settler.key().as_ref()],
        bump,
        constraint = proof_buffer.owner == settler.key()
            && proof_buffer.market == market.key() @ QedError::ProofBufferMismatch
    )]
    pub proof_buffer: Account<'info, ProofBuffer>,
    pub token_program: Program<'info, Token>,
}

// ─────────────────────────── Events ───────────────────────────

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub market_id: u64,
    pub fixture_id: i64,
    pub deadline_ts: i64,
}

#[event]
pub struct Staked {
    pub market: Pubkey,
    pub staker: Pubkey,
    pub side: Side,
    pub amount: u64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub outcome: MarketStatus,
    pub settler: Pubkey,
    pub bounty: u64,
    pub fee: u64,
    pub proof_ts_ms: i64,
    pub event_stat_root: [u8; 32],
    pub proven_values: Vec<i32>,
}

#[event]
pub struct Claimed {
    pub market: Pubkey,
    pub claimer: Pubkey,
    pub payout: u64,
}

#[event]
pub struct Refunded {
    pub market: Pubkey,
    pub claimer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MarketVoided {
    pub market: Pubkey,
}
