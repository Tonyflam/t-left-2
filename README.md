# QED Markets ∎

> **Every payout is a proven theorem.**

Trustless, multi-leg World Cup prediction markets on Solana — settled by a single
Cross-Program Invocation into TxLINE's `validate_stat_v2` Merkle-proof verifier.
No admin key. No oracle multisig. No dispute window. A payout happens if and only
if a cryptographic proof of the match outcome verifies on-chain. **∎ QED.**

Built for the **TxODDS World Cup Hackathon — Prediction Markets & Settlement track**.

---

## Why QED is different

Every prediction market in this track can settle *"Team A won"*. QED settles
**N-dimensional theorems**:

```
  GOALS(FRA) − GOALS(ENG) > 0        (France win)
∧ GOALS(FRA) + GOALS(ENG) > 2        (over 2.5 goals)
∧ CORNERS(FRA) + CORNERS(ENG) > 9    (corners over 9.5)
```

…in **one atomic CPI** into TxLINE's `validate_stat_v2`, using its
`NDimensionalStrategy` primitive — the newest, most expressive validation
instruction TxLINE ships, which (as far as we can tell) no other team touched.

### The four theorems of QED

| # | Claim | How |
|---|-------|-----|
| **1. Exotic props, one proof** | Multi-leg markets (winner ∧ totals ∧ corners ∧ cards) settle in a single `validate_stat_v2` CPI | On-chain strategy compiler: market legs → `NDimensionalStrategy`, positional stat-slot contract |
| **2. NO is provable too** | Most "trustless" markets can only *prove* YES; NO settles by timeout or trust | **De Morgan negation engine on-chain**: ¬(L₁∧…∧Lₙ) = ¬L₁∨…∨¬Lₙ — the settler proves any single failed leg; the program derives the negated predicate itself |
| **3. Finality is in the leaf** | Settling on a transient 1-0 at minute 43 is the classic oracle attack | TxLINE `game_finalised` records carry `period = 100` **inside the Merkle-proven stat leaf**. QED's program rejects any proof whose leaves aren't finalised — provable finality, not assumed finality |
| **4. Tested against the real verifier** | Mocked oracles prove nothing | Our hermetic test suite replays settlement against the **actual txoracle bytecode dumped from devnet** with **real daily Merkle-root accounts** and **real captured proof bundles** |
| **5. Proofs bigger than a transaction** | A parlay's Merkle proof (~1.1–1.3 KB) exceeds Solana's 1232-byte tx cap — most designs simply can't settle it | **Chunked ProofBuffer PDA**: proof staged in ≤800-byte chunks, settled via `settle_*_buffered` through the same four gates, buffer closed back to the settler (rent-neutral). Proven live on devnet |

---

## Live demo

- **App**: **[qed-markets.vercel.app](https://qed-markets.vercel.app)** — live against TxLINE devnet
- **Program (devnet)**: [`hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C`](https://explorer.solana.com/address/hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C?cluster=devnet)
- **Settlement txs (devnet)**: see [docs/DEPLOY-LOG.md](docs/DEPLOY-LOG.md) — incl. a 3-leg parlay settled through the **chunked proof buffer**
- **Demo video**: _link here_

Matches end before judging — so QED ships a **Replay Theater**: any finished
fixture's real TxLINE score history re-streams through the exact same SSE
pipeline, ending with the real `game_finalised` record triggering the real
settlement flow. What you see in replay is byte-for-byte what production saw live.

## Repository layout

```
program/          Anchor workspace — qed_markets program + txoracle CPI bindings
  programs/qed-markets/src/
    lib.rs        instructions: create_market, stake, settle_yes/no, write_proof_chunk,
                  settle_yes/no_buffered, claim, void, refund
    state.rs      Market / Position / ProofBuffer accounts, Leg model
    strategy.rs   on-chain strategy compiler + De Morgan negation engine
    txoracle.rs   CPI types + manual invoke of validate_stat_v2 (discriminator-exact)
keeper/           ops: subscribe+activate, market seeding, settlement watcher, golden capture
  tests/          hermetic LiteSVM e2e (14/14) vs real dumped txoracle bytecode
web/              Next.js 14 — board, proof-receipt market pages, live verifier, replay theater
docs/             TECHNICAL.md, FEEDBACK.md (TxLINE API notes), DEPLOY-LOG.md
```

## Quickstart (judges)

```bash
# 1. Hermetic settlement replay — no wallet, no network, no SOL needed
cd keeper && npm install && npm test    # LiteSVM 14/14: create → stake → settle(real oracle CPI) → claim
                                        # incl. fraud rejection + chunked-buffer parlay

# 2. Run the app against live TxLINE devnet
cd web && npm install && npm run dev    # http://localhost:3000
```

Full setup (deploy, subscribe, seed, settle) in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## TxLINE endpoints used

`POST /auth/guest/start` · `POST /api/token/activate` · `GET /api/fixtures/snapshot` ·
`GET /api/odds/snapshot/{fixtureId}` · `GET /api/scores/snapshot/{fixtureId}` ·
`GET /api/scores/historical/{fixtureId}` · `GET /api/scores/stream` (SSE) ·
`GET /api/odds/stream` (SSE) · `GET /api/scores/stat-validation?statKeys=…` (V2 bundles) ·
on-chain: `txoracle.validate_stat_v2` (CPI), `daily_scores_roots` PDA, `subscribe`

## License

MIT