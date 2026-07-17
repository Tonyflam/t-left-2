//! Byte-exact CPI bindings for TxLINE's `txoracle` program.
//!
//! The types below mirror the on-chain IDL of
//! `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (devnet) /
//! `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` (mainnet), version 1.5.6.
//!
//! We deliberately hand-roll the CPI instead of using `declare_program!` so the
//! serialized layout is explicit, auditable, and immune to IDL-codegen drift.
//! The instruction discriminator, account list, argument order, and return-data
//! contract (`bool` via `sol_set_return_data`) are asserted in tests against a
//! bytecode dump of the real deployed program.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{get_return_data, invoke};

use crate::errors::QedError;

/// Anchor global-instruction discriminator for `validate_stat_v2`
/// (`sha256("global:validate_stat_v2")[..8]`, taken verbatim from the IDL).
pub const VALIDATE_STAT_V2_DISCRIMINATOR: [u8; 8] = [208, 215, 194, 214, 241, 71, 246, 178];

/// Seed prefix of the daily scores Merkle-root PDA:
/// `["daily_scores_roots", epoch_day_u16_le]`.
pub const DAILY_SCORES_ROOTS_SEED: &[u8] = b"daily_scores_roots";

/// One node of a Merkle inclusion proof.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

/// The innermost Merkle leaf: a single provable key/value statistic.
///
/// `key` is the period-prefixed soccer stat key (e.g. `1` = participant-1 total
/// goals, `3001` = participant-1 second-half goals). `period` is the game phase
/// of the score record the stat was extracted from — `100` for
/// `game_finalised` records, which is what QED's provable-finality gate keys on.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

/// A stat leaf plus its inclusion proof up to `event_stat_root`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatLeaf {
    pub stat: ScoreStat,
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

/// Summary of one fixture's score events within a five-minute oracle batch.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

/// Full `validate_stat_v2` payload: proves `stats` belong to
/// `event_stat_root` → fixture sub-tree → batch main tree → the on-chain
/// `daily_scores_roots` PDA for `ts`'s epoch day.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatValidationInput {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub event_stat_root: [u8; 32],
    pub stats: Vec<StatLeaf>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GeometricTarget {
    pub stat_index: u8,
    pub prediction: i32,
}

/// A discrete predicate over one (`Single`) or two (`Binary`) stat slots.
/// Indexes are positions into `StatValidationInput.stats`; the oracle enforces
/// that every slot is covered exactly once (`IncompleteStatCoverage` /
/// `DuplicateStatCoverage` otherwise).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum StatPredicate {
    Single {
        index: u8,
        predicate: TraderPredicate,
    },
    Binary {
        index_a: u8,
        index_b: u8,
        op: BinaryExpression,
        predicate: TraderPredicate,
    },
}

/// The V2 strategy: QED uses `discrete_predicates` (conjunction semantics —
/// the oracle returns `true` iff every predicate holds).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct NDimensionalStrategy {
    pub geometric_targets: Vec<GeometricTarget>,
    pub distance_predicate: Option<TraderPredicate>,
    pub discrete_predicates: Vec<StatPredicate>,
}

/// Derive the `daily_scores_roots` PDA for a millisecond timestamp.
pub fn daily_scores_roots_pda(ts_ms: i64, txoracle_program_id: &Pubkey) -> Result<(Pubkey, u8)> {
    let epoch_day: u16 = (ts_ms / 86_400_000)
        .try_into()
        .map_err(|_| error!(QedError::InvalidTimestamp))?;
    Ok(Pubkey::find_program_address(
        &[DAILY_SCORES_ROOTS_SEED, &epoch_day.to_le_bytes()],
        txoracle_program_id,
    ))
}

/// CPI into `txoracle::validate_stat_v2` and read its `bool` verdict from
/// return data.
///
/// * A forged / mismatched proof **reverts inside the oracle**, aborting the
///   whole transaction — settlement can never proceed on bad data.
/// * A structurally valid proof whose predicates don't hold returns `false`.
pub fn cpi_validate_stat_v2<'info>(
    txoracle_program: &AccountInfo<'info>,
    daily_scores_roots: &AccountInfo<'info>,
    payload: &StatValidationInput,
    strategy: &NDimensionalStrategy,
) -> Result<bool> {
    let mut data = Vec::with_capacity(4096);
    data.extend_from_slice(&VALIDATE_STAT_V2_DISCRIMINATOR);
    payload
        .serialize(&mut data)
        .map_err(|_| error!(QedError::SerializationFailed))?;
    strategy
        .serialize(&mut data)
        .map_err(|_| error!(QedError::SerializationFailed))?;

    let ix = Instruction {
        program_id: *txoracle_program.key,
        accounts: vec![AccountMeta::new_readonly(*daily_scores_roots.key, false)],
        data,
    };

    invoke(
        &ix,
        &[daily_scores_roots.clone(), txoracle_program.clone()],
    )?;

    let (returning_program, return_data) =
        get_return_data().ok_or(error!(QedError::OracleNoReturnData))?;
    require_keys_eq!(
        returning_program,
        *txoracle_program.key,
        QedError::OracleNoReturnData
    );
    Ok(return_data.first().copied() == Some(1))
}
