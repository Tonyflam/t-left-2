/**
 * One-time TxLINE onboarding (devnet free World Cup tier):
 *
 *   1. on-chain `txoracle.subscribe(service_level_id=1, weeks=4)` — free tier,
 *      costs only SOL fees;
 *   2. sign `${txSig}::${jwt}` with the same wallet;
 *   3. `POST /api/token/activate` → long-lived API token.
 *
 * Writes `.txline-auth.json` (gitignored). Idempotent: re-running with an
 * active subscription reuses it and only re-activates.
 */
import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DEPLOYER_KEYPAIR,
  DURATION_WEEKS,
  RPC_URL,
  SERVICE_LEVEL_ID,
  TXL_MINT,
  TXORACLE_IDL,
  TXORACLE_PROGRAM_ID,
} from "./config.js";
import { TxLineClient, loadAuthState, loadKeypair } from "./txline.js";

async function main() {
  const payer = loadKeypair(DEPLOYER_KEYPAIR);
  console.log(`wallet: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`balance: ${balance / 1e9} SOL`);
  if (balance < 0.01e9) {
    throw new Error(
      "Wallet needs devnet SOL for the subscribe transaction. Fund it via `solana airdrop 2` or https://faucet.solana.com",
    );
  }

  const existing = loadAuthState();
  const client = new TxLineClient();
  await client.renewJwt();

  let txSig = existing.txSig;
  if (txSig && existing.wallet === payer.publicKey.toBase58() && existing.apiToken) {
    console.log(`re-using existing subscription tx ${txSig}`);
    // JWT was renewed above; verify the token still works.
    try {
      await client.fixturesSnapshot();
      console.log("existing API token is live — nothing to do ✅");
      return;
    } catch {
      console.log("existing token rejected; re-activating…");
    }
  }

  if (!txSig) {
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const idl = JSON.parse(fs.readFileSync(TXORACLE_IDL, "utf8"));
    const program = new anchor.Program(idl, provider);
    if (program.programId.toBase58() !== TXORACLE_PROGRAM_ID) {
      throw new Error(`IDL program id mismatch: ${program.programId.toBase58()}`);
    }

    const txlMint = new PublicKey(TXL_MINT);
    const programId = new PublicKey(TXORACLE_PROGRAM_ID);
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury_v2")],
      programId,
    );
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      txlMint,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_matrix")],
      programId,
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      txlMint,
      payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    console.log(`subscribing on-chain (service level ${SERVICE_LEVEL_ID}, ${DURATION_WEEKS} weeks)…`);
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      userTokenAccount,
      payer.publicKey,
      txlMint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    txSig = await program.methods
      .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
      .preInstructions([createAtaIx])
      .accounts({
        user: payer.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: txlMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`subscribe tx: ${txSig}`);
    await connection.confirmTransaction(txSig, "confirmed");
  }

  console.log("activating API token…");
  const apiToken = await client.activate(txSig, payer);
  console.log(`api token: ${apiToken.slice(0, 12)}… (saved to .txline-auth.json)`);

  const fixtures = await client.fixturesSnapshot();
  const count = Array.isArray(fixtures) ? fixtures.length : "?";
  console.log(`smoke test OK — fixtures snapshot returned ${count} fixtures ✅`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
