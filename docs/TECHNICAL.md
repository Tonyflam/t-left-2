# QED Markets — Technical Documentation

Program (devnet): **`hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C`**
Oracle (devnet): txoracle **`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`**

---

## 1. Architecture

```
┌────────────┐   stat-validation bundle    ┌───────────────┐
│  TxLINE    │ ──────────────────────────► │  keeper /     │
│  REST+SSE  │   (Merkle proof + leaves)   │  web verifier │
└────────────┘                             └──────┬────────┘
                                                  │ settle_yes / settle_no
                                                  ▼        (or buffered)
┌─────────────────────────────────────────────────────────────────┐
│  qed_markets (Anchor)                                           │
│  gates: ①stat-slot contract ②finality(period=100)               │
│         ③timestamp window ④strategy = deterministic recompile   │
│                     │ CPI validate_stat_v2(NDimensionalStrategy)│
│                     ▼                                           │
│  txoracle ── Merkle path → daily_scores_roots PDA → bool        │
└─────────────────────────────────────────────────────────────────┘
```

A market is a set of **legs**. Each leg is a predicate over TxLINE stat keys:

```
leg := (keyA [op keyB]) cmp threshold
op  ∈ {add, subtract}      cmp ∈ {greaterThan, lessThan, equalTo}
```

Examples: `goals(1) − goals(2) > 0` (home win), `goals(1)+goals(2) > 2`
(over 2.5), `corners(7) > 4`. YES = conjunction of all legs.

Settlement is **permissionless**: anyone who can fetch a proof bundle from
`GET /api/scores/stat-validation` can settle any market and earn the settler fee.
There is no admin key, no pause switch, no dispute window.

## 2. The four on-chain gates

Every settlement instruction enforces, before the CPI:

1. **Stat-slot contract** — the market stores the exact ordered list of stat
   keys its strategy indexes (`expected_stat_keys`). The submitted proof's
   leaves must match key-for-key, position-for-position
   (`StatSlotMismatch` otherwise). This kills "prove a different stat" attacks.
2. **Provable finality** — every proven leaf must carry `period == 100`
   (TxLINE's game-finalised period). Finality is *inside the Merkle leaf*, so a
   transient 1–0 at minute 43 can never settle a market (`StatsNotFinal`).
3. **Timestamp window** — the bundle's `min/maxTimestamp` must be ≥ the
   market's `settle_after_ts_ms` (`ProofTooEarly`). Prevents settling on a
   pre-match or in-play snapshot of a rescheduled fixture.
4. **Deterministic strategy recompile** — the program does **not** trust a
   caller-supplied strategy. It recompiles the `NDimensionalStrategy` from the
   market's stored legs on-chain and compares byte-for-byte with what is sent
   to the oracle. The caller chooses only *which* outcome to prove, never *what*
   the predicate is.

Only if all four gates pass does the program CPI into
`txoracle::validate_stat_v2`, which walks stat leaves → event stat root →
fixture subtree → daily root pinned in the `daily_scores_roots` PDA, evaluates
the strategy, and returns a boolean in return-data. `false` ⇒
`OracleReturnedFalse`, no state change.

## 3. Provable NO — the De Morgan negation engine

Most "trustless" designs can only prove YES; NO settles by timeout or a trusted
resolver. QED makes NO a first-class theorem:

$$\neg(L_1 \land L_2 \land \dots \land L_n) = \neg L_1 \lor \neg L_2 \lor \dots \lor \neg L_n$$

`settle_no(failed_leg_index, eq_branch)` — the settler names **one** failed leg;
the program *derives the negation itself*:

- `> t`  →  `< t+1` (integer stats)
- `< t`  →  `> t−1`
- `= t`  →  settler picks the branch: `> t` or `< t` (`eq_branch`)

The negated single-leg strategy is compiled on-chain and proven through the
same CPI. One proven counterexample refutes the conjunction — exactly like a
proof by counterexample.

## 4. Chunked proof buffer — beating the 1232-byte tx cap

A 3-leg parlay needs 4–5 stat leaves; the full `StatValidationInput`
(leaves + per-stat Merkle paths + subtree + main-tree proof) serializes to
**~1.1–1.3 KB**, over Solana's 1232-byte transaction limit.

Solution: a per-(market, settler) **`ProofBuffer` PDA**
(`seeds = ["proof", market, settler]`, max 4096 bytes):

1. `write_proof_chunk(offset, chunk)` — staged in ≤800-byte chunks;
   `offset == 0` clears the buffer (idempotent restart).
2. `settle_yes_buffered` / `settle_no_buffered` — deserializes the payload from
   the buffer, runs the identical `settle_core` path (all four gates + CPI),
   then **closes the buffer back to the settler** — the flow is rent-neutral.

The buffer is settler-owned and market-bound (`ProofBufferMismatch` guards), so
concurrent settlers can't clobber each other. The keeper auto-routes: payloads
≤850 bytes go single-tx, larger ones go buffered.

## 5. Market lifecycle

```
create_market ─► stake (YES/NO, test-USDC) ─► [kickoff] ─►
    settle_yes / settle_no / *_buffered  ─► claim (pro-rata from losing pool)
    └─ void (deadline passed, unsettleable) ─► refund
```

Payouts: winners split the losing pool pro-rata to their stake, minus a
protocol fee to the treasury and a settler fee to whoever proved the outcome.
All math is checked (`MathOverflow`), pools live in a program-owned vault ATA.

## 6. Hermetic test suite (14/14)

`keeper/tests/e2e.test.ts` runs under **LiteSVM** with:

- the **real txoracle bytecode dumped from devnet** (`tests/golden/txoracle.so`),
- the **real `daily_scores_roots` account** contents,
- **real captured proof bundles** from fixture 18213979 (finished 1–2).

Coverage includes: full lifecycle YES and NO, De Morgan settlement, fraud
rejection (wrong slot order, non-final leaves, early timestamps, tampered
strategy, oracle-false), void/refund, and the chunked-buffer parlay flow
(asserts the buffer account is closed after settlement). No network, no wallet,
no SOL needed: `cd keeper && npm install && npm test`.

## 7. Web app

Next.js 14 (`web/`): market board, market detail with an animated **Proof
Receipt** (stat leaves → event stat root → fixture subtree → daily root → CPI
verdict → settlement tx), a **/verify** page that fetches a *fresh* proof from
TxLINE and `simulateTransaction`s `validate_stat_v2` against the real devnet
oracle per leg (verdict read from on-chain return data), and a **Replay
Theater** that re-streams a finished fixture's full TxLINE score history
ending at the `game_finalised` record that becomes the settlement source.

## 8. Reproducing everything

```bash
# hermetic settlement replay
cd keeper && npm install && npm test

# build + deploy program (Anchor 0.31.1, Agave 2.1)
cd program && anchor build
solana program deploy target/deploy/qed_markets.so \
  --program-id target/deploy/qed_markets-keypair.json -u devnet -k <keypair>

# subscribe + activate a TxLINE token, seed markets, watch & settle
cd keeper
npx tsx src/subscribe.ts
npx tsx src/seed-markets.ts
npm run watch          # polls fixtures; settles (buffered when needed) on finalise

# web app
cd web && npm install && npm run dev
```

All devnet transaction signatures: [DEPLOY-LOG.md](DEPLOY-LOG.md).
