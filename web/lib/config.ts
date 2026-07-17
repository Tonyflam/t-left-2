/** Shared constants for the QED Markets web app. */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const QED_PROGRAM_ID = "hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C";
export const TXORACLE_PROGRAM_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";
export const TXLINE_ORIGIN = "https://txline-dev.txodds.com";
export const TXLINE_API = `${TXLINE_ORIGIN}/api`;
export const TXLINE_JWT_URL = `${TXLINE_ORIGIN}/auth/guest/start`;
export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const EXPLORER_ADDR = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
