# QED Markets — 5-Minute Demo Video Kit

Target length: **4:15–4:40** (limit 5:00). Record at 1920×1080, browser 100% zoom.
Everything on screen uses the public site: **https://qed-markets.vercel.app**

---

## 1. ElevenLabs — voice & settings

| Setting | Value |
|---|---|
| Voice | **Adam** (pre-made) — deep, confident, tech-launch energy. Fallback: **Brian** (smoother narration) or **Daniel** (British broadcast gravitas) |
| Model | **Eleven Multilingual v2** (use v3 alpha if your account has it) |
| Stability | **40%** (expressive but controlled) |
| Similarity | **80%** |
| Style exaggeration | **15%** |
| Speaker boost | **ON** |
| Speed | **1.0** |

Generate **each numbered section below as its own clip** (8 clips). Short clips
sync to footage far more easily than one long take.
Pronunciations: “QED” = three letters, *cue-ee-dee*. “TxODDS” = *tex-odds*.
“TxLINE” = *tex-line*. “∎” is never read aloud.

---

## 2. Voiceover script (read exactly, one clip per block)

**VO-1 — Cold open (over title card image, 0:00–0:22)**
> Every prediction market has the same dirty secret. When the game ends, a
> human decides who gets paid. A multisig. A committee. A dispute window.
> QED Markets removes them all. Here, a payout is a mathematical theorem —
> proven on-chain, or it doesn't happen.

**VO-2 — The board (0:22–0:50)**
> This is QED, live on Solana devnet, built on TxODDS's TxLINE oracle.
> Real World Cup fixtures. Real markets — match winners, goal totals, and
> multi-leg parlays. Look at the last number: zero humans trusted for
> settlement. That's the whole product.

**VO-3 — Market detail + proof receipt (0:50–1:55)**
> Here's the flagship: a three-leg parlay. Away win, over two and a half
> goals, and five-plus home corners. YES pays only if all three hold.
> And this — is the proof receipt. The actual Merkle proof that settled this
> market, walked step by step. The final-whistle stats are hashed into
> leaves — see “period one hundred”? That's finality, notarised inside the
> proof itself. A transient one-nil at minute forty-three can never settle
> this market. The leaves hash into the fixture's stat root, into the day's
> tree, up to a daily root that TxODDS pins on-chain. Our program checks four
> gates — exact stat order, finality, timestamps, and it recompiles the bet's
> logic on-chain, so nobody can swap the question. Then: one cross-program
> call into TxLINE's verifier. The oracle returns true — and only then does
> money move.
>
> And when a bet loses? Most so-called trustless markets can't prove a NO.
> QED can. By De Morgan's law, proving one failed leg's exact negation
> refutes the entire parlay. On QED, NO is a theorem too.

**VO-4 — Verify page (1:55–2:35)**
> But don't take the site's word for any of this. The verify page fetches a
> fresh Merkle proof from TxLINE — right now, live — and simulates the real
> oracle program on devnet, leg by leg. True. True. True. That verdict is
> read from the oracle's on-chain return data. Not computed by us. Anyone
> can run this, any time, against any market on the board.

**VO-5 — Replay theater (2:35–3:05)**
> Matches end before judging — so QED ships a replay theater. This is the
> fixture's real TxLINE feed, all eleven hundred records, replayed to the
> final whistle. And this last record — game finalised — is the exact record
> the settlement proof is built from. What you just watched is what the
> program proved.

**VO-6 — The hard engineering (3:05–3:50)**
> Now the part that made this hard. A parlay's Merkle proof is bigger than an
> entire Solana transaction — roughly eleven hundred bytes against a
> twelve-thirty-two byte cap. QED stages the proof on-chain in chunks,
> settles from the buffer through the same four gates, then closes it —
> rent-neutral. This is a real devnet transaction doing exactly that.
> And the whole pipeline is tested hermetically: fourteen of fourteen tests
> replay settlement against the actual oracle bytecode dumped from devnet —
> including fraud attempts. Wrong stat order. Non-final stats. Tampered
> strategies. Every one of them reverts.

**VO-7 — It's alive (3:50–4:10)**
> And this isn't a museum. Markets on today's matches are staked and waiting.
> When France–England goes final tonight, a keeper fetches the proof and
> settles — permissionlessly, for a bounty. No admin key exists.

**VO-8 — Close (over end card, 4:10–4:30)**
> QED Markets. Exotic parlays. Provable YES — and provable NO. Finality
> inside the proof. Tested against the real verifier. Live on devnet.
> Every payout, a proven theorem. Quod erat demonstrandum.

*(~620 words ≈ 4 min of narration at normal pace.)*

---

## 3. Nano Banana Pro image prompts (16:9, generate at 1920×1080)

**IMG-1 — Opening title card (shown during VO-1)**
```
Minimalist dark tech title card, 16:9. Solid near-black background hex #05070D
with a very faint blueprint grid and two soft radial glows: emerald #3EF2A0
upper right, cool blue #6EA8FF lower left. Centered massive geometric
sans-serif wordmark "QED∎ MARKETS" in white, with the tombstone square "∎"
glowing emerald #3EF2A0 like neon. Below it, smaller elegant line: "Every
payout is a proven theorem." Bottom edge, tiny monospace text: "Solana devnet ×
TxLINE oracle". Subtle floating Merkle-tree wireframe made of thin glowing
emerald lines and small hash-like hexadecimal fragments in the background,
extremely subtle. Premium fintech aesthetic, sharp typography, no people, no
watermark, cinematic lighting, ultra clean.
```

**IMG-2 — “Four gates” diagram card (optional insert during VO-3, 3–4 s)**
```
Dark technical infographic, 16:9, background #05070D with faint grid. A
horizontal pipeline of four glowing gate icons rendered as minimal outlined
shields in emerald #3EF2A0, labeled in clean white sans-serif: "1 EXACT STAT
ORDER", "2 FINALITY IN THE LEAF", "3 TIMESTAMP WINDOW", "4 STRATEGY RECOMPILED
ON-CHAIN". An arrow flows left to right through all four gates into a final
glowing emerald square stamp labeled "validate_stat_v2 → TRUE ∎". Thin blue
#6EA8FF connective circuitry lines. Minimal, precise, aerospace-HUD feel, no
people, no watermark.
```

**IMG-3 — Closing card (shown during VO-8)**
```
Minimalist dark closing card, 16:9, background #05070D, faint blueprint grid,
soft emerald #3EF2A0 radial glow center. Large white text "∎ QED" as a glowing
rubber-stamp seal, slightly rotated 3 degrees, with subtle emerald ink-stamp
texture. Beneath in clean sans-serif: "qed-markets.vercel.app" and on the next
line smaller: "github.com/Tonyflam/t-left-2". Bottom small monospace:
"TxODDS World Cup Hackathon — Prediction Markets & Settlement". Elegant,
premium, cinematic, no people, no watermark.
```

---

## 4. Step-by-step recording guide (do it in this exact order)

### A. Prepare (10 min)
1. On your **local computer** (not the Codespace), install **OBS Studio**
   (free, obsproject.com) — or use macOS `Cmd+Shift+5` / Windows `Win+Alt+R`.
2. In OBS: Settings → Video → set Base and Output resolution to **1920×1080**,
   30 fps. Add a **Display Capture** source.
3. Open **Chrome**, press `F11` (full screen), zoom 100% (`Ctrl+0`).
4. Open these **5 tabs in this order** (Ctrl+click each to preload):
   - Tab 1: `https://qed-markets.vercel.app/`
   - Tab 2: `https://qed-markets.vercel.app/market/B52Z5hu6Arq1MM5GF15q8RtwFpLUEyWhcbZxJCUSYiUu`
   - Tab 3: `https://qed-markets.vercel.app/verify?market=B52Z5hu6Arq1MM5GF15q8RtwFpLUEyWhcbZxJCUSYiUu`
   - Tab 4: `https://qed-markets.vercel.app/replay/18213979`
   - Tab 5: `https://explorer.solana.com/tx/5MuJfCkRJBeyzvaM5EtcpBXZxGGxYp6czWp82xc8v5XroQCAL5pEpY7cpx1VkUvBFAQeoC6ChzNto1GTvSZhPumP?cluster=devnet`
5. In the **Codespace**: open a terminal, make the font big
   (Settings → Terminal font size → 18), then type `cd keeper` and have
   `npm test` **typed but NOT pressed** — you'll press Enter on camera.
6. Generate the 8 ElevenLabs clips (Section 2) and the 3 images (Section 3).
   Download everything into one folder.

### B. Record the screen (one pass, ~6 min of raw footage — no talking needed)
Just perform these actions slowly. You'll cut it to the voiceover later.

1. **Start recording.** Sit on Tab 1 (board). Slowly scroll from the hero down
   past the stat tiles, pause 2 s on the France vs England cards, keep
   scrolling to the “How a settlement becomes a theorem” strip. Pause 3 s.
   *(need ~30 s total)*
2. Go to **Tab 2** (market page). Do nothing for 3 s (let the entrance
   animations play). Slowly move the mouse down the three claim legs. Then
   **watch the Proof Receipt animate** — do not scroll while the green spine
   fills. When “∎ QED” stamps in, hover it for 2 s. Then hover the “settled”
   link in the on-chain trail. *(need ~70 s)*
3. Go to **Tab 3** (verify). It auto-runs: you'll see “asking the oracle…”
   then the big **TRUE ∎** stamp and three TRUE rows. After they land, click
   **“raw oracle simulation logs”** to expand, scroll the logs slowly for 4 s,
   collapse. *(need ~45 s)* — If it already ran before you started recording,
   press the **verify →** button to run it again on camera.
4. Go to **Tab 4** (replay). Click **32×**, click **▶ play**, let it run 8 s
   (score flashes 0:0 → 1:0…), then click **“skip to final whistle ⇥”**.
   Pause 3 s on FULL TIME 1:2 · notarised ∎ and the glowing final record.
   *(need ~35 s)*
5. Go to **Tab 5** (Solana Explorer). Scroll slowly to the instruction list so
   the settle transaction is visible. Pause 4 s. *(need ~15 s)*
6. Switch to the **Codespace terminal**, press **Enter** on `npm test`, wait
   for the green **14 passed** summary, pause 4 s on it. *(need ~40 s)*
7. Back to **Tab 1**, hover the two Vietnam–Myanmar / France–England OPEN
   sections for 5 s. **Stop recording.**

### C. Assemble (CapCut free, ~30 min)
1. New project → import: screen recording, 8 VO clips, 3 images.
2. Timeline order:
   - **IMG-1** for 0:00–0:22 with **VO-1** under it.
   - Screen footage of the board, cut to match **VO-2**.
   - Market-page footage under **VO-3**. (Optional: insert **IMG-2** for 4 s
     when the VO says “four gates”.)
   - Verify footage under **VO-4** — time the cut so the **TRUE ∎ stamp**
     lands exactly when the VO says the first “True”.
   - Replay footage under **VO-5** — end on FULL TIME.
   - Explorer + terminal footage under **VO-6** — cut to the terminal when the
     VO says “fourteen of fourteen”.
   - Board OPEN-markets footage under **VO-7**.
   - **IMG-3** for the final 15 s with **VO-8**.
3. Music (optional): CapCut library → search “minimal tech ambient” → volume
   **-28 dB** under the voice. No music during VO-1's first sentence.
4. Export: 1080p, 30 fps, highest bitrate. Watch it once fully. Check: under
   5:00, voice audible, no secrets on screen (never show `.txline-auth.json`,
   `.keys/`, or wallet files).

### D. Golden rules
- **Never show** terminal contents other than `npm test` output.
- Keep total length **under 5:00** — judges stop watching at the limit.
- If France–England settles before you record (tonight ~23:00 UTC), re-record
  step B-7 showing the freshly SETTLED card instead — a market that settled
  itself during the hackathon is the strongest possible ending.
