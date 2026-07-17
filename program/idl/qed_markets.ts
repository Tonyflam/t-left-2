/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/qed_markets.json`.
 */
export type QedMarkets = {
  "address": "hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C",
  "metadata": {
    "name": "qedMarkets",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "QED Markets — trustless multi-leg prediction markets settled by TxLINE validate_stat_v2 CPI"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Winners claim stake + pro-rata share of the losing pool."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "claimerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "docs": [
        "Refund paths that make stranding impossible:",
        "* voided market → every position refunds in full;",
        "* settled market whose winning pool is empty → losing positions refund",
        "in full (there is nobody to pay the losing pool to)."
      ],
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "claimerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "docs": [
        "Create a market: pin fixture, legs, oracle, mint and schedule forever."
      ],
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "feeTreasury",
          "docs": [
            "Token account (of `mint`) that receives protocol fees."
          ]
        },
        {
          "name": "oracleProgram",
          "docs": [
            "the daily-root PDA against it. The UI only surfaces markets pinned to",
            "the canonical TxLINE oracle."
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u64"
        },
        {
          "name": "fixtureId",
          "type": "i64"
        },
        {
          "name": "legs",
          "type": {
            "vec": {
              "defined": {
                "name": "leg"
              }
            }
          }
        },
        {
          "name": "deadlineTs",
          "type": "i64"
        },
        {
          "name": "settleAfterTsMs",
          "type": "i64"
        },
        {
          "name": "voidAfterTs",
          "type": "i64"
        },
        {
          "name": "requiredPeriod",
          "type": "i32"
        },
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "bountyBps",
          "type": "u16"
        },
        {
          "name": "label",
          "type": "string"
        }
      ]
    },
    {
      "name": "settleNo",
      "docs": [
        "Prove NO by De Morgan: name the failed leg (and, for equality legs,",
        "which side reality landed on); the program derives the negated",
        "predicate itself and demands a Merkle proof of it."
      ],
      "discriminator": [
        197,
        221,
        57,
        190,
        72,
        123,
        8,
        173
      ],
      "accounts": [
        {
          "name": "settler",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "settlerToken",
          "docs": [
            "Bounty destination — any token account of the market's mint."
          ],
          "writable": true
        },
        {
          "name": "feeTreasuryToken",
          "docs": [
            "Must be the exact fee treasury pinned at creation."
          ],
          "writable": true
        },
        {
          "name": "oracleProgram",
          "docs": [
            "the handler before the CPI."
          ]
        },
        {
          "name": "dailyScoresRoots",
          "docs": [
            "pinned oracle program id."
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "payload",
          "type": {
            "defined": {
              "name": "statValidationInput"
            }
          }
        },
        {
          "name": "failedLegIndex",
          "type": "u8"
        },
        {
          "name": "eqBranch",
          "type": {
            "option": {
              "defined": {
                "name": "eqBranch"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settleYes",
      "docs": [
        "Prove the YES theorem: the payload must Merkle-prove every leg's stat",
        "slots from a `game_finalised` record; the strategy is compiled on-chain",
        "and verified by `validate_stat_v2` in one CPI."
      ],
      "discriminator": [
        81,
        233,
        236,
        141,
        0,
        252,
        204,
        202
      ],
      "accounts": [
        {
          "name": "settler",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "settlerToken",
          "docs": [
            "Bounty destination — any token account of the market's mint."
          ],
          "writable": true
        },
        {
          "name": "feeTreasuryToken",
          "docs": [
            "Must be the exact fee treasury pinned at creation."
          ],
          "writable": true
        },
        {
          "name": "oracleProgram",
          "docs": [
            "the handler before the CPI."
          ]
        },
        {
          "name": "dailyScoresRoots",
          "docs": [
            "pinned oracle program id."
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "payload",
          "type": {
            "defined": {
              "name": "statValidationInput"
            }
          }
        }
      ]
    },
    {
      "name": "stake",
      "docs": [
        "Stake on YES or NO before the deadline."
      ],
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "staker",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "stakerToken",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "voidMarket",
      "docs": [
        "If the market is still open after its grace window (abandoned fixture,",
        "oracle outage), anyone can void it. All stakes become refundable."
      ],
      "discriminator": [
        243,
        175,
        46,
        124,
        95,
        101,
        39,
        69
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketSettled",
      "discriminator": [
        237,
        212,
        22,
        175,
        201,
        117,
        215,
        99
      ]
    },
    {
      "name": "marketVoided",
      "discriminator": [
        217,
        12,
        138,
        39,
        108,
        75,
        89,
        26
      ]
    },
    {
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ]
    },
    {
      "name": "staked",
      "discriminator": [
        11,
        146,
        45,
        205,
        230,
        58,
        213,
        240
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "labelTooLong",
      "msg": "Market label too long"
    },
    {
      "code": 6001,
      "name": "invalidLegCount",
      "msg": "A market needs between 1 and 4 legs"
    },
    {
      "code": 6002,
      "name": "tooManyProofSlots",
      "msg": "Legs need more proof slots than the TxLINE API can serve (max 5 statKeys)"
    },
    {
      "code": 6003,
      "name": "invalidLeg",
      "msg": "Leg definition is malformed"
    },
    {
      "code": 6004,
      "name": "invalidSchedule",
      "msg": "Betting deadline must be before settle-after time"
    },
    {
      "code": 6005,
      "name": "invalidFees",
      "msg": "Fee + bounty must be below 100%"
    },
    {
      "code": 6006,
      "name": "bettingClosed",
      "msg": "Betting is closed for this market"
    },
    {
      "code": 6007,
      "name": "zeroStake",
      "msg": "Stake amount must be greater than zero"
    },
    {
      "code": 6008,
      "name": "marketNotOpen",
      "msg": "Market is not open"
    },
    {
      "code": 6009,
      "name": "marketNotSettled",
      "msg": "Market is not settled"
    },
    {
      "code": 6010,
      "name": "settlementTooEarly",
      "msg": "Too early to settle this market"
    },
    {
      "code": 6011,
      "name": "voidTooEarly",
      "msg": "Too early to void this market"
    },
    {
      "code": 6012,
      "name": "fixtureMismatch",
      "msg": "Proof payload is for a different fixture"
    },
    {
      "code": 6013,
      "name": "timestampMismatch",
      "msg": "Proof timestamp does not match the batch summary"
    },
    {
      "code": 6014,
      "name": "proofTooOld",
      "msg": "Proof batch predates the settlement window"
    },
    {
      "code": 6015,
      "name": "notFinalised",
      "msg": "Stat leaf is not from a finalised (period=100) score record"
    },
    {
      "code": 6016,
      "name": "statSlotMismatch",
      "msg": "Proof stat slots do not match the market's legs"
    },
    {
      "code": 6017,
      "name": "legIndexOutOfRange",
      "msg": "Leg index out of range"
    },
    {
      "code": 6018,
      "name": "missingEqBranch",
      "msg": "Equality legs need an explicit negation branch (0 = below, 1 = above)"
    },
    {
      "code": 6019,
      "name": "thresholdOverflow",
      "msg": "Threshold negation overflowed"
    },
    {
      "code": 6020,
      "name": "oracleSaysNo",
      "msg": "Oracle rejected the outcome predicate"
    },
    {
      "code": 6021,
      "name": "oracleNoReturnData",
      "msg": "Oracle returned no verdict data"
    },
    {
      "code": 6022,
      "name": "wrongOracleProgram",
      "msg": "Wrong txoracle program account supplied"
    },
    {
      "code": 6023,
      "name": "wrongDailyRootAccount",
      "msg": "Wrong daily scores root account supplied"
    },
    {
      "code": 6024,
      "name": "serializationFailed",
      "msg": "Failed to serialize CPI payload"
    },
    {
      "code": 6025,
      "name": "invalidTimestamp",
      "msg": "Invalid timestamp"
    },
    {
      "code": 6026,
      "name": "notAWinner",
      "msg": "Position is on the losing side"
    },
    {
      "code": 6027,
      "name": "alreadyClaimed",
      "msg": "Position already claimed"
    },
    {
      "code": 6028,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6029,
      "name": "refundUnavailable",
      "msg": "Refunds are only available for voided or dead markets"
    },
    {
      "code": 6030,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "eqBranch",
      "docs": [
        "Negation branch selector for `EqualTo` legs."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "below"
          },
          {
            "name": "above"
          }
        ]
      }
    },
    {
      "name": "leg",
      "docs": [
        "One conjunct of the market's YES-outcome theorem.",
        "",
        "Examples (soccer stat keys: 1/2 = P1/P2 goals, 7/8 = corners, 3/4 = yellows):",
        "* Home win:        `Binary { key_a: 1, key_b: 2, op: Subtract, cmp: GreaterThan, threshold: 0 }`",
        "* Draw:            `Binary { key_a: 1, key_b: 2, op: Subtract, cmp: EqualTo,     threshold: 0 }`",
        "* Over 2.5 goals:  `Binary { key_a: 1, key_b: 2, op: Add,      cmp: GreaterThan, threshold: 2 }`",
        "* Corners > 9.5:   `Binary { key_a: 7, key_b: 8, op: Add,      cmp: GreaterThan, threshold: 9 }`",
        "* Home clean sheet:`Single { key_a: 2,           cmp: EqualTo,     threshold: 0 }`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "legKind"
              }
            }
          },
          {
            "name": "keyA",
            "type": "u32"
          },
          {
            "name": "keyB",
            "docs": [
              "only meaningful for `Binary` legs; must be 0 for `Single`"
            ],
            "type": "u32"
          },
          {
            "name": "op",
            "docs": [
              "only meaningful for `Binary` legs"
            ],
            "type": {
              "defined": {
                "name": "legOp"
              }
            }
          },
          {
            "name": "cmp",
            "type": {
              "defined": {
                "name": "legCmp"
              }
            }
          },
          {
            "name": "threshold",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "legCmp",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "greaterThan"
          },
          {
            "name": "lessThan"
          },
          {
            "name": "equalTo"
          }
        ]
      }
    },
    {
      "name": "legKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "single"
          },
          {
            "name": "binary"
          }
        ]
      }
    },
    {
      "name": "legOp",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "add"
          },
          {
            "name": "subtract"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "market creator (no settlement privileges — settlement is permissionless)"
            ],
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "docs": [
              "caller-chosen id; part of the PDA seeds"
            ],
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "docs": [
              "TxLINE fixture id this market settles against"
            ],
            "type": "i64"
          },
          {
            "name": "mint",
            "docs": [
              "SPL mint staked in this market (test-USDC on devnet)"
            ],
            "type": "pubkey"
          },
          {
            "name": "deadlineTs",
            "docs": [
              "unix seconds — staking closes (kickoff)"
            ],
            "type": "i64"
          },
          {
            "name": "settleAfterTsMs",
            "docs": [
              "unix milliseconds — settlement proofs must carry batch data at/after",
              "this time (expected full-time). TxLINE timestamps are ms."
            ],
            "type": "i64"
          },
          {
            "name": "voidAfterTs",
            "docs": [
              "unix seconds — if still Open after this, anyone may void → full refunds"
            ],
            "type": "i64"
          },
          {
            "name": "legs",
            "docs": [
              "conjunction of legs = the YES theorem"
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "leg"
                }
              }
            }
          },
          {
            "name": "requiredPeriod",
            "docs": [
              "Merkle-proven game phase required on every settlement stat leaf",
              "(100 = game_finalised)"
            ],
            "type": "i32"
          },
          {
            "name": "yesPool",
            "type": "u64"
          },
          {
            "name": "noPool",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "feeBps",
            "docs": [
              "protocol fee on the losing pool, paid to `fee_treasury`"
            ],
            "type": "u16"
          },
          {
            "name": "bountyBps",
            "docs": [
              "permissionless-settlement bounty on the losing pool, paid to whoever",
              "lands the winning settle transaction"
            ],
            "type": "u16"
          },
          {
            "name": "feeTreasury",
            "type": "pubkey"
          },
          {
            "name": "settledAt",
            "docs": [
              "set at settlement"
            ],
            "type": "i64"
          },
          {
            "name": "settler",
            "type": "pubkey"
          },
          {
            "name": "distributable",
            "docs": [
              "losing-pool amount distributable to winners (post fee/bounty)"
            ],
            "type": "u64"
          },
          {
            "name": "oracleProgram",
            "docs": [
              "the TxLINE txoracle program this market settles against — pinned at",
              "creation, re-checked at settlement, used to re-derive the daily-root PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "label",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "deadlineTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "settler",
            "type": "pubkey"
          },
          {
            "name": "bounty",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "proofTsMs",
            "type": "i64"
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "provenValues",
            "type": {
              "vec": "i32"
            }
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settledYes"
          },
          {
            "name": "settledNo"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "marketVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proofNode",
      "docs": [
        "One node of a Merkle inclusion proof."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isRightSibling",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "refunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "scoreStat",
      "docs": [
        "The innermost Merkle leaf: a single provable key/value statistic.",
        "",
        "`key` is the period-prefixed soccer stat key (e.g. `1` = participant-1 total",
        "goals, `3001` = participant-1 second-half goals). `period` is the game phase",
        "of the score record the stat was extracted from — `100` for",
        "`game_finalised` records, which is what QED's provable-finality gate keys on."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "u32"
          },
          {
            "name": "value",
            "type": "i32"
          },
          {
            "name": "period",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "scoresBatchSummary",
      "docs": [
        "Summary of one fixture's score events within a five-minute oracle batch."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "scoresUpdateStats"
              }
            }
          },
          {
            "name": "eventsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "scoresUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "staked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "staker",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "statLeaf",
      "docs": [
        "A stat leaf plus its inclusion proof up to `event_stat_root`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stat",
            "type": {
              "defined": {
                "name": "scoreStat"
              }
            }
          },
          {
            "name": "statProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "statValidationInput",
      "docs": [
        "Full `validate_stat_v2` payload: proves `stats` belong to",
        "`event_stat_root` → fixture sub-tree → batch main tree → the on-chain",
        "`daily_scores_roots` PDA for `ts`'s epoch day."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "fixtureSummary",
            "type": {
              "defined": {
                "name": "scoresBatchSummary"
              }
            }
          },
          {
            "name": "fixtureProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "stats",
            "type": {
              "vec": {
                "defined": {
                  "name": "statLeaf"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
