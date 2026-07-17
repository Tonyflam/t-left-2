# TxLINE API & Oracle Feedback

Genuine notes from building a full settlement pipeline (REST + SSE +
`validate_stat_v2` CPI) against TxLINE devnet. Ordered by impact.

## 1. Proof size vs Solana's 1232-byte transaction cap ⚠️ biggest integration hurdle

A `StatValidationInput` for 4–5 stat leaves (typical parlay) serializes to
~1.1–1.3 KB — larger than an entire Solana transaction. Any program that wants
to CPI `validate_stat_v2` with a multi-stat proof **cannot** receive the proof
as instruction data.

We solved it with a chunked staging buffer PDA (write chunks → settle from
buffer → close buffer, rent-neutral). Suggestions:

- Document this limit prominently; it will bite every integrator who goes past
  2–3 statKeys.
- Consider shipping a reference "proof buffer" pattern (or a helper program /
  Anchor CPI crate) alongside the oracle.
- Alternatively, an oracle-side instruction that accepts a proof from an
  account instead of ix data would remove the problem for everyone.

## 2. `statKeys` cap of 5 returns a bare 400

`GET /api/scores/stat-validation` rejects >5 statKeys with an empty 400 body.
We only discovered the limit empirically (a 6-key market we'd already created
on-chain became unsettleable). A JSON error like
`{"error":"statKeys limited to 5"}` — and the limit in the docs — would have
saved a market. Also worth stating whether the cap is per-request (so callers
can batch multiple requests) or per-proof.

## 3. Compute-unit exhaustion surfaces as an empty error

`validate_stat_v2` needs ~1.4M CU for multi-stat proofs. With the default
200k budget the simulation/transaction fails with an empty, generic error —
nothing hints at CU. A note in the docs ("request ≥1.4M CU for multi-stat
validations") plus a `msg!` before heavy hashing would make this a 5-minute
fix instead of an evening of bisection.

## 4. `/scores/historical/{id}` responds with SSE framing

The historical endpoint returns `data:`-prefixed SSE lines even though it's a
finite, non-streaming resource. Plain JSON (array of records) would be easier
to consume; if SSE is intentional, documenting it would help — every JSON
client fails on it in a non-obvious way.

## 5. Casing is inconsistent across surfaces

Feed records are PascalCase (`FixtureId`, `Ts`, `StatusId`), stat-validation
bundles are camelCase (`statsToProve`, `eventStatRoot`), and record `Stats` is
an object while bundle stats are arrays. Normalizing (or documenting the
mapping) would reduce integration friction.

## 6. Praise: finality inside the Merkle leaf 👏

Putting `period` (100 = game finalised) *inside the proven stat leaf* is the
single best design decision in the oracle. It let us make finality a
cryptographic property of the settlement proof rather than an off-chain
assumption — the classic "settle on a transient scoreline" oracle attack is
structurally impossible. More of this, please (e.g. a proven `StatusId` leaf).

## 7. Praise: `NDimensionalStrategy` is genuinely expressive

add/subtract over stat pairs with gt/lt/eq comparisons was enough to express
winners, totals, handicaps, corners/cards props, and — via De Morgan on our
side — provable negations. A `>=`/`<=` comparator and multiply (for ratios)
would extend the reachable market space further.

## 8. Small items

- Duplicate statKeys (e.g. `1,2,1`) are accepted by the API and verify
  on-chain — useful for strategies that reuse a stat in multiple dimensions;
  worth documenting as supported behaviour.
- The IDL-published TxL mint constant did not match the actual devnet
  Token-2022 mint we had to use — cost us a debugging cycle during subscribe.
- Guest JWTs expire silently; a documented TTL (or a 401 body that says
  "token expired") would let clients renew proactively. We renew on 401/403.
- `stat-validation` bundle field `summary.updateStats.maxTimestamp` proved
  ideal as a "proof is post-match" watermark — worth calling out in docs as
  the recommended freshness check.
