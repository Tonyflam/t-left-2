use anchor_lang::prelude::*;

/// Maximum number of legs per market. Each Binary leg consumes two proof
/// slots, so a 4-leg market requests at most 8 Merkle-proven stats — well
/// inside `validate_stat_v2`'s compute envelope.
pub const MAX_LEGS: usize = 4;

/// Hard cap of the TxLINE proof API: `GET /api/scores/stat-validation`
/// accepts at most 5 `statKeys` per request (verified empirically on devnet).
/// A market needing more proof slots than this could never be settled.
pub const MAX_PROOF_SLOTS: usize = 5;
pub const MAX_LABEL_LEN: usize = 96;

/// The game phase recorded on `game_finalised` score records. Stat leaves
/// extracted from those records carry this value in `ScoreStat.period`,
/// making match finality itself Merkle-provable.
pub const FINALISED_PERIOD: i32 = 100;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum LegKind {
    /// predicate over a single stat: `stat(key_a) CMP threshold`
    Single,
    /// predicate over two stats: `(stat(key_a) OP stat(key_b)) CMP threshold`
    Binary,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum LegOp {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum LegCmp {
    GreaterThan,
    LessThan,
    EqualTo,
}

/// One conjunct of the market's YES-outcome theorem.
///
/// Examples (soccer stat keys: 1/2 = P1/P2 goals, 7/8 = corners, 3/4 = yellows):
/// * Home win:        `Binary { key_a: 1, key_b: 2, op: Subtract, cmp: GreaterThan, threshold: 0 }`
/// * Draw:            `Binary { key_a: 1, key_b: 2, op: Subtract, cmp: EqualTo,     threshold: 0 }`
/// * Over 2.5 goals:  `Binary { key_a: 1, key_b: 2, op: Add,      cmp: GreaterThan, threshold: 2 }`
/// * Corners > 9.5:   `Binary { key_a: 7, key_b: 8, op: Add,      cmp: GreaterThan, threshold: 9 }`
/// * Home clean sheet:`Single { key_a: 2,           cmp: EqualTo,     threshold: 0 }`
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct Leg {
    pub kind: LegKind,
    pub key_a: u32,
    /// only meaningful for `Binary` legs; must be 0 for `Single`
    pub key_b: u32,
    /// only meaningful for `Binary` legs
    pub op: LegOp,
    pub cmp: LegCmp,
    pub threshold: i32,
}

impl Leg {
    /// Number of proof slots this leg consumes in the settlement payload.
    pub fn slot_count(&self) -> usize {
        match self.kind {
            LegKind::Single => 1,
            LegKind::Binary => 2,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    SettledYes,
    SettledNo,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Side {
    Yes,
    No,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// market creator (no settlement privileges — settlement is permissionless)
    pub creator: Pubkey,
    /// caller-chosen id; part of the PDA seeds
    pub market_id: u64,
    /// TxLINE fixture id this market settles against
    pub fixture_id: i64,
    /// SPL mint staked in this market (test-USDC on devnet)
    pub mint: Pubkey,
    /// unix seconds — staking closes (kickoff)
    pub deadline_ts: i64,
    /// unix milliseconds — settlement proofs must carry batch data at/after
    /// this time (expected full-time). TxLINE timestamps are ms.
    pub settle_after_ts_ms: i64,
    /// unix seconds — if still Open after this, anyone may void → full refunds
    pub void_after_ts: i64,
    /// conjunction of legs = the YES theorem
    #[max_len(MAX_LEGS)]
    pub legs: Vec<Leg>,
    /// Merkle-proven game phase required on every settlement stat leaf
    /// (100 = game_finalised)
    pub required_period: i32,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub status: MarketStatus,
    /// protocol fee on the losing pool, paid to `fee_treasury`
    pub fee_bps: u16,
    /// permissionless-settlement bounty on the losing pool, paid to whoever
    /// lands the winning settle transaction
    pub bounty_bps: u16,
    pub fee_treasury: Pubkey,
    /// set at settlement
    pub settled_at: i64,
    pub settler: Pubkey,
    /// losing-pool amount distributable to winners (post fee/bounty)
    pub distributable: u64,
    /// the TxLINE txoracle program this market settles against — pinned at
    /// creation, re-checked at settlement, used to re-derive the daily-root PDA
    pub oracle_program: Pubkey,
    pub bump: u8,
    #[max_len(MAX_LABEL_LEN)]
    pub label: String,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";
    pub const VAULT_SEED: &'static [u8] = b"vault";

    pub fn total_slots(&self) -> usize {
        self.legs.iter().map(|l| l.slot_count()).sum()
    }

    pub fn is_open(&self) -> bool {
        self.status == MarketStatus::Open
    }

    pub fn winning_side(&self) -> Option<Side> {
        match self.status {
            MarketStatus::SettledYes => Some(Side::Yes),
            MarketStatus::SettledNo => Some(Side::No),
            _ => None,
        }
    }

    pub fn pool(&self, side: Side) -> u64 {
        match side {
            Side::Yes => self.yes_pool,
            Side::No => self.no_pool,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: Side,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    pub const SEED: &'static [u8] = b"position";
}

/// Maximum serialized `StatValidationInput` size stageable in a proof buffer.
/// A 5-slot payload with ~20-level proofs is ≈ 2.6 KiB; 4 KiB leaves headroom.
pub const MAX_PROOF_BYTES: usize = 4_096;

/// Per-(market, settler) staging area for proof payloads that exceed the
/// 1232-byte transaction cap (multi-leg parlays). Chunks are appended with
/// `write_proof_chunk`; `settle_*_buffered` consumes the buffer and closes it
/// back to the settler, so staging is rent-neutral.
#[account]
pub struct ProofBuffer {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub data: Vec<u8>,
}

impl ProofBuffer {
    pub const SEED: &'static [u8] = b"proof";
    pub const SPACE: usize = 32 + 32 + 4 + MAX_PROOF_BYTES;
}
