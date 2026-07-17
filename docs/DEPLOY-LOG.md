# Devnet Deploy Log — every claim is a transaction

Cluster: **devnet**. All links open in Solana Explorer.

## Programs & accounts

| What | Address |
|---|---|
| qed_markets program | [`hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C`](https://explorer.solana.com/address/hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C?cluster=devnet) |
| txoracle (TxLINE) | [`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`](https://explorer.solana.com/address/6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J?cluster=devnet) |
| Deployer / settler wallet | [`7P7TYVUh6XaDyNe6D2TkgULio2oQ3cUgHZVZmDLGFokB`](https://explorer.solana.com/address/7P7TYVUh6XaDyNe6D2TkgULio2oQ3cUgHZVZmDLGFokB?cluster=devnet) |
| test-USDC mint (6 dec) | `4ifyqzx9pCiK8Pjyp5MtwJ9RaoNZrQHYJdDLSbrXhGee` |
| TxLINE subscribe tx | [`Ew1YEAwe…R63x`](https://explorer.solana.com/tx/Ew1YEAwepeHfrR2wSW1cAuby69HtwbnqjJNyo6cgpL7vcyZUo5pknTukRiFYPzRE9Zi78PSt1rLNAa7rwM8R63x?cluster=devnet) |

## Settled markets — fixture 18213979 (finished 1–2, proven from `game_finalised`, seq 1184)

| Market | Verdict | Settlement tx |
|---|---|---|
| Home beats Away — `552nFZzi…iDiq` | **NO** (De Morgan: proved the negated leg `goals(1)−goals(2) < 1` on-chain) | [`1apM5syf…pj2L`](https://explorer.solana.com/tx/1apM5syf7pkmmsvuKZ17i3h9cSumVFcqfbsoHz9QqT6NQoJneGRxqE7i9vNLF75wh3cLLTsNtzNqSiY6mZZpj2L?cluster=devnet) |
| Over 2.5 goals — `BRzUoT3P…x1Z3` | **YES** | [`2LHzcYji…unAU`](https://explorer.solana.com/tx/2LHzcYjiNKQft2BnNYttj2PS1yXn2P33UuYsFXuKZsxKFnS5oR7A25p86bkXSrwje26cLbcZsvvxUnPDxkF8unAU?cluster=devnet) |
| Home beats Away — `6qDtYnRp…LWyG` | **NO** | [`iwtL3Fas…22AG`](https://explorer.solana.com/tx/iwtL3FasUyjuRYjK2GZLeDTifJ6K5cyz4HTKv5UPxhCUQokwPgbbGjaixTGNj3tMju2s7bGMFtW72u2Hs2922AG?cluster=devnet) |
| Over 2.5 goals — `4NyJKmvH…Y9qH` | **YES** | [`noEEkkdp…4Zkw`](https://explorer.solana.com/tx/noEEkkdpgUSPwwT32RS26JeLF6pwJPpiUUCV5Mk3Z9HTQKWeg7sauamaXszqmCQvBGu6dRPbYL82dN7AMJq4Zkw?cluster=devnet) |
| **3-leg parlay** (away win ∧ over 2.5 ∧ home 5+ corners) — `B52Z5hu6…YiUu` | **YES via chunked proof buffer** (payload 1083 B > tx cap; 2 staged chunks → `settle_yes_buffered` → buffer closed) | [`5MuJfCkR…humP`](https://explorer.solana.com/tx/5MuJfCkRJBeyzvaM5EtcpBXZxGGxYp6czWp82xc8v5XroQCAL5pEpY7cpx1VkUvBFAQeoC6ChzNto1GTvSZhPumP?cluster=devnet) |

## Live staked markets — settle when the matches finish

**Vietnam vs Myanmar** — fixture 18143850, kickoff Jul 18 12:00 UTC. 300 YES / 200 NO tUSDC each.

| Market | Address | Create tx |
|---|---|---|
| Vietnam beats Myanmar | `8Vnj5Hko…22nn` | [`5mvj5oKW…haS7`](https://explorer.solana.com/tx/5mvj5oKWm3BSjob6YWnD4Ufs5TyHFTpxxJbJLRErfUXyp41Hb7EYFFT57yPrPzidfWKPH9fPFNUAST6JSs6ehaS7?cluster=devnet) |
| Over 2.5 goals | `FHWydHh8…1k4m` | [`3YsWQY28…48e8`](https://explorer.solana.com/tx/3YsWQY28TsrCtoZsxvnfC5zZNDje7mrCXiAeBYxKkn6U2BTi48AXETxH9pd82D2sTWbRj1n3v7opZssbxLqY48e8?cluster=devnet) |
| Parlay: Myanmar win ∧ over 2.5 ∧ Vietnam 5+ corners | `97n4bvWM…XeEH` | [`3SmwvW9o…8MmC3`](https://explorer.solana.com/tx/3SmwvW9opHRxW52iZ46aAyJdN9G9Ce1XzsDyHSnSk3wxo173Uu2ex2UQsvrBmVm5pUPcbWiD8kv7X3BXAbo8MmC3?cluster=devnet) |

**France vs England** — fixture 18257865, kickoff Jul 18 21:00 UTC. 300 YES / 200 NO tUSDC each.

| Market | Address | Create tx |
|---|---|---|
| France beats England | `6VYcEf3d…4xL6` | [`wrAyUZXQ…MiYj`](https://explorer.solana.com/tx/wrAyUZXQ3pXfBew7QfvXfk957xHCJohgzarMg5F2EyGEAJvunat8xeU9oYsywpUuPLwiZvRLEgEQx8ckVznMiYj?cluster=devnet) |
| Over 2.5 goals | `5D72W9Y5…meHc` | [`3xxM6Xg4…1UsV`](https://explorer.solana.com/tx/3xxM6Xg4JGUdborowMgjfmwiDSBizYtCEzGSXFTdELEuQfGmXcDY4Y593rRTgeDEE45rSnqWRbS6dj8QJS3W1UsV?cluster=devnet) |
| Parlay: England win ∧ over 2.5 ∧ France 5+ corners | `5HkuvpDe…RHSy` | [`5fxgwJ7C…suJw`](https://explorer.solana.com/tx/5fxgwJ7CBdfUNeSxa4fjpzF9PEFdcLNLZMZYJg8ML1RbCbS2UvbZABM8mtMC8XcdLKWXoeXYTmqGruRJX8PvsuJw?cluster=devnet) |

Settlement + claim signatures for these will be appended after the matches
finish (keeper: `cd keeper && npm run watch`).

## Notes

- Program upgraded twice on devnet as instructions were added; each upgrade
  that grew the binary required `solana program extend` first.
- One early market (`BTnmoUxa…MVcH`, 6 statKeys) predates our discovery of the
  API's 5-statKey cap; it is unsettleable and will be voided/refunded after
  its window — kept in the log for honesty.
