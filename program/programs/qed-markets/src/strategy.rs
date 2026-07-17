//! The QED strategy compiler.
//!
//! A market's YES outcome is a conjunction of [`Leg`]s. At settlement time the
//! program — never the caller — compiles those legs into the exact
//! [`NDimensionalStrategy`] handed to `txoracle::validate_stat_v2`:
//!
//! * **YES**: every leg becomes one discrete predicate; slots are assigned
//!   left-to-right (`Single` = 1 slot, `Binary` = 2 slots). The oracle's
//!   exactly-once coverage rule guarantees no slot is smuggled in or ignored.
//! * **NO**: by De Morgan, ¬(L₁ ∧ … ∧ Lₙ) = ¬L₁ ∨ … ∨ ¬Lₙ — so proving *any
//!   single* failed leg proves NO. The settler names the failed leg; the
//!   program derives the negated predicate itself with checked integer
//!   arithmetic. Equality legs split into two branches (`< t` / `> t`) and the
//!   settler picks which branch reality took.
//!
//! Because both directions are compiled on-chain from the immutable market
//! account, a settler can *choose what to prove* but can never *change what
//! counts as proof*.

use anchor_lang::prelude::*;

use crate::errors::QedError;
use crate::state::{Leg, LegCmp, LegKind, LegOp};
use crate::txoracle::{
    BinaryExpression, Comparison, NDimensionalStrategy, StatPredicate, TraderPredicate,
};

/// Negation branch selector for `EqualTo` legs.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EqBranch {
    /// prove `stat < threshold`
    Below,
    /// prove `stat > threshold`
    Above,
}

fn cmp_to_oracle(cmp: LegCmp) -> Comparison {
    match cmp {
        LegCmp::GreaterThan => Comparison::GreaterThan,
        LegCmp::LessThan => Comparison::LessThan,
        LegCmp::EqualTo => Comparison::EqualTo,
    }
}

fn op_to_oracle(op: LegOp) -> BinaryExpression {
    match op {
        LegOp::Add => BinaryExpression::Add,
        LegOp::Subtract => BinaryExpression::Subtract,
    }
}

/// The ordered stat keys a settlement payload must prove, one per slot.
/// This is the positional contract shared with the `statKeys=` query of
/// `GET /api/scores/stat-validation`.
pub fn expected_slot_keys(legs: &[Leg]) -> Vec<u32> {
    let mut keys = Vec::with_capacity(legs.len() * 2);
    for leg in legs {
        keys.push(leg.key_a);
        if leg.kind == LegKind::Binary {
            keys.push(leg.key_b);
        }
    }
    keys
}

/// Compile the YES strategy: one discrete predicate per leg, slots assigned
/// sequentially. `validate_stat_v2` returns `true` iff **all** predicates hold
/// — exactly the market's conjunction semantics.
pub fn compile_yes_strategy(legs: &[Leg]) -> Result<NDimensionalStrategy> {
    let mut predicates = Vec::with_capacity(legs.len());
    let mut slot: u8 = 0;
    for leg in legs {
        let predicate = TraderPredicate {
            threshold: leg.threshold,
            comparison: cmp_to_oracle(leg.cmp),
        };
        match leg.kind {
            LegKind::Single => {
                predicates.push(StatPredicate::Single {
                    index: slot,
                    predicate,
                });
                slot = slot.checked_add(1).ok_or(QedError::MathOverflow)?;
            }
            LegKind::Binary => {
                predicates.push(StatPredicate::Binary {
                    index_a: slot,
                    index_b: slot.checked_add(1).ok_or(QedError::MathOverflow)?,
                    op: op_to_oracle(leg.op),
                    predicate,
                });
                slot = slot.checked_add(2).ok_or(QedError::MathOverflow)?;
            }
        }
    }
    Ok(NDimensionalStrategy {
        geometric_targets: vec![],
        distance_predicate: None,
        discrete_predicates: predicates,
    })
}

/// Negate a leg's comparison over the integers:
///
/// * ¬(x > t)  ⇔  x ≤ t  ⇔  x < t+1
/// * ¬(x < t)  ⇔  x ≥ t  ⇔  x > t−1
/// * ¬(x = t)  ⇔  x < t  ∨  x > t   (settler picks the true branch)
///
/// Thresholds move with checked arithmetic; a market whose threshold sits at
/// `i32::MIN`/`i32::MAX` simply cannot be negated past the boundary (and is
/// rejected at creation anyway — real soccer stats live in tiny ranges).
pub fn negate_predicate(
    cmp: LegCmp,
    threshold: i32,
    eq_branch: Option<EqBranch>,
) -> Result<TraderPredicate> {
    Ok(match cmp {
        LegCmp::GreaterThan => TraderPredicate {
            threshold: threshold
                .checked_add(1)
                .ok_or(QedError::ThresholdOverflow)?,
            comparison: Comparison::LessThan,
        },
        LegCmp::LessThan => TraderPredicate {
            threshold: threshold
                .checked_sub(1)
                .ok_or(QedError::ThresholdOverflow)?,
            comparison: Comparison::GreaterThan,
        },
        LegCmp::EqualTo => {
            let branch = eq_branch.ok_or(QedError::MissingEqBranch)?;
            TraderPredicate {
                threshold,
                comparison: match branch {
                    EqBranch::Below => Comparison::LessThan,
                    EqBranch::Above => Comparison::GreaterThan,
                },
            }
        }
    })
}

/// Compile the NO strategy for one failed leg. The payload for a NO settlement
/// carries **only that leg's slots**, so the oracle's exactly-once coverage
/// rule is satisfied with a one-predicate strategy.
///
/// Returns the strategy plus the slot keys the payload must prove.
pub fn compile_no_strategy(
    legs: &[Leg],
    failed_leg_index: usize,
    eq_branch: Option<EqBranch>,
) -> Result<(NDimensionalStrategy, Vec<u32>)> {
    let leg = legs
        .get(failed_leg_index)
        .ok_or(QedError::LegIndexOutOfRange)?;
    let negated = negate_predicate(leg.cmp, leg.threshold, eq_branch)?;

    let (predicate, keys) = match leg.kind {
        LegKind::Single => (
            StatPredicate::Single {
                index: 0,
                predicate: negated,
            },
            vec![leg.key_a],
        ),
        LegKind::Binary => (
            StatPredicate::Binary {
                index_a: 0,
                index_b: 1,
                op: op_to_oracle(leg.op),
                predicate: negated,
            },
            vec![leg.key_a, leg.key_b],
        ),
    };

    Ok((
        NDimensionalStrategy {
            geometric_targets: vec![],
            distance_predicate: None,
            discrete_predicates: vec![predicate],
        },
        keys,
    ))
}

/// Structural validation performed at market creation.
pub fn validate_legs(legs: &[Leg]) -> Result<()> {
    require!(
        !legs.is_empty() && legs.len() <= crate::state::MAX_LEGS,
        QedError::InvalidLegCount
    );
    // The TxLINE proof API caps `statKeys` at 5 per request, so a market whose
    // YES payload needs more slots could never be settled. Reject at creation.
    require!(
        expected_slot_keys(legs).len() <= crate::state::MAX_PROOF_SLOTS,
        QedError::TooManyProofSlots
    );
    for leg in legs {
        // Soccer stat keys are period-prefixed and small (< 8000 + 8).
        require!(
            leg.key_a > 0 && leg.key_a <= 8_008,
            QedError::InvalidLeg
        );
        match leg.kind {
            LegKind::Single => require!(leg.key_b == 0, QedError::InvalidLeg),
            LegKind::Binary => require!(
                leg.key_b > 0 && leg.key_b <= 8_008,
                QedError::InvalidLeg
            ),
        }
        // Keep thresholds far away from negation overflow boundaries.
        require!(
            leg.threshold > i32::MIN / 2 && leg.threshold < i32::MAX / 2,
            QedError::InvalidLeg
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eval(cmp: Comparison, lhs: i32, threshold: i32) -> bool {
        match cmp {
            Comparison::GreaterThan => lhs > threshold,
            Comparison::LessThan => lhs < threshold,
            Comparison::EqualTo => lhs == threshold,
        }
    }

    fn leg_holds(cmp: LegCmp, value: i32, threshold: i32) -> bool {
        match cmp {
            LegCmp::GreaterThan => value > threshold,
            LegCmp::LessThan => value < threshold,
            LegCmp::EqualTo => value == threshold,
        }
    }

    /// Exhaustive truth-table check: for every value/threshold pair in a
    /// realistic stat range, the negated predicate must hold **iff** the
    /// original leg fails. For EqualTo, exactly one branch must prove it.
    #[test]
    fn negation_is_exact_complement() {
        for threshold in -20..=20 {
            for value in -20..=20 {
                for cmp in [LegCmp::GreaterThan, LegCmp::LessThan] {
                    let neg = negate_predicate(cmp, threshold, None).unwrap();
                    assert_eq!(
                        eval(neg.comparison, value, neg.threshold),
                        !leg_holds(cmp, value, threshold),
                        "cmp={cmp:?} value={value} threshold={threshold}"
                    );
                }
                let below = negate_predicate(LegCmp::EqualTo, threshold, Some(EqBranch::Below))
                    .unwrap();
                let above = negate_predicate(LegCmp::EqualTo, threshold, Some(EqBranch::Above))
                    .unwrap();
                let some_branch_proves = eval(below.comparison, value, below.threshold)
                    || eval(above.comparison, value, above.threshold);
                assert_eq!(
                    some_branch_proves,
                    !leg_holds(LegCmp::EqualTo, value, threshold),
                    "eq value={value} threshold={threshold}"
                );
            }
        }
    }

    #[test]
    fn negation_rejects_missing_eq_branch() {
        assert!(negate_predicate(LegCmp::EqualTo, 0, None).is_err());
    }

    #[test]
    fn negation_guards_overflow() {
        assert!(negate_predicate(LegCmp::GreaterThan, i32::MAX, None).is_err());
        assert!(negate_predicate(LegCmp::LessThan, i32::MIN, None).is_err());
    }

    fn sample_legs() -> Vec<Leg> {
        vec![
            // home win: goals(P1) - goals(P2) > 0
            Leg {
                kind: LegKind::Binary,
                key_a: 1,
                key_b: 2,
                op: LegOp::Subtract,
                cmp: LegCmp::GreaterThan,
                threshold: 0,
            },
            // over 2.5: goals(P1) + goals(P2) > 2
            Leg {
                kind: LegKind::Binary,
                key_a: 1,
                key_b: 2,
                op: LegOp::Add,
                cmp: LegCmp::GreaterThan,
                threshold: 2,
            },
            // away keeps under 2 yellows: yellows(P2) < 2
            Leg {
                kind: LegKind::Single,
                key_a: 4,
                key_b: 0,
                op: LegOp::Add,
                cmp: LegCmp::LessThan,
                threshold: 2,
            },
        ]
    }

    #[test]
    fn yes_strategy_slots_are_sequential_and_complete() {
        let legs = sample_legs();
        assert_eq!(expected_slot_keys(&legs), vec![1, 2, 1, 2, 4]);

        let strategy = compile_yes_strategy(&legs).unwrap();
        assert_eq!(strategy.discrete_predicates.len(), 3);
        assert!(strategy.geometric_targets.is_empty());
        assert!(strategy.distance_predicate.is_none());

        // slot coverage must be exactly 0..5, each used once
        let mut covered = [0u8; 5];
        for p in &strategy.discrete_predicates {
            match p {
                StatPredicate::Single { index, .. } => covered[*index as usize] += 1,
                StatPredicate::Binary {
                    index_a, index_b, ..
                } => {
                    covered[*index_a as usize] += 1;
                    covered[*index_b as usize] += 1;
                }
            }
        }
        assert_eq!(covered, [1, 1, 1, 1, 1]);
    }

    #[test]
    fn no_strategy_isolates_the_failed_leg() {
        let legs = sample_legs();
        // leg 1 failed (match was under 2.5): prove goals sum < 3 ⇒ GT negated to LT(3)
        let (strategy, keys) = compile_no_strategy(&legs, 1, None).unwrap();
        assert_eq!(keys, vec![1, 2]);
        assert_eq!(strategy.discrete_predicates.len(), 1);
        match &strategy.discrete_predicates[0] {
            StatPredicate::Binary {
                index_a,
                index_b,
                op,
                predicate,
            } => {
                assert_eq!((*index_a, *index_b), (0, 1));
                assert_eq!(*op, BinaryExpression::Add);
                assert_eq!(predicate.comparison, Comparison::LessThan);
                assert_eq!(predicate.threshold, 3);
            }
            other => panic!("unexpected predicate {other:?}"),
        }
    }

    #[test]
    fn leg_validation_rejects_garbage() {
        assert!(validate_legs(&[]).is_err());
        let mut bad = sample_legs();
        bad[0].key_a = 0;
        assert!(validate_legs(&bad).is_err());
        let mut bad2 = sample_legs();
        bad2[2].key_b = 7; // Single leg must have key_b == 0
        assert!(validate_legs(&bad2).is_err());
        assert!(validate_legs(&sample_legs()).is_ok());
    }
}
