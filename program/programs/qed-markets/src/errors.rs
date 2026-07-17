use anchor_lang::prelude::*;

#[error_code]
pub enum QedError {
    #[msg("Market label too long")]
    LabelTooLong,
    #[msg("A market needs between 1 and 4 legs")]
    InvalidLegCount,
    #[msg("Legs need more proof slots than the TxLINE API can serve (max 5 statKeys)")]
    TooManyProofSlots,
    #[msg("Leg definition is malformed")]
    InvalidLeg,
    #[msg("Betting deadline must be before settle-after time")]
    InvalidSchedule,
    #[msg("Fee + bounty must be below 100%")]
    InvalidFees,
    #[msg("Betting is closed for this market")]
    BettingClosed,
    #[msg("Stake amount must be greater than zero")]
    ZeroStake,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market is not settled")]
    MarketNotSettled,
    #[msg("Too early to settle this market")]
    SettlementTooEarly,
    #[msg("Too early to void this market")]
    VoidTooEarly,
    #[msg("Proof payload is for a different fixture")]
    FixtureMismatch,
    #[msg("Proof timestamp does not match the batch summary")]
    TimestampMismatch,
    #[msg("Proof batch predates the settlement window")]
    ProofTooOld,
    #[msg("Stat leaf is not from a finalised (period=100) score record")]
    NotFinalised,
    #[msg("Proof stat slots do not match the market's legs")]
    StatSlotMismatch,
    #[msg("Leg index out of range")]
    LegIndexOutOfRange,
    #[msg("Equality legs need an explicit negation branch (0 = below, 1 = above)")]
    MissingEqBranch,
    #[msg("Threshold negation overflowed")]
    ThresholdOverflow,
    #[msg("Oracle rejected the outcome predicate")]
    OracleSaysNo,
    #[msg("Oracle returned no verdict data")]
    OracleNoReturnData,
    #[msg("Wrong txoracle program account supplied")]
    WrongOracleProgram,
    #[msg("Wrong daily scores root account supplied")]
    WrongDailyRootAccount,
    #[msg("Failed to serialize CPI payload")]
    SerializationFailed,
    #[msg("Invalid timestamp")]
    InvalidTimestamp,
    #[msg("Position is on the losing side")]
    NotAWinner,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Refunds are only available for voided or dead markets")]
    RefundUnavailable,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
