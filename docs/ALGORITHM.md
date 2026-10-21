# Duel.com Castle Roulette: clean-room algorithm specification

> Package copy of the ProvablyFair.org audit framework's `games/castle-roulette/ALGORITHM.md`.
> It differs from that file only where the file named locations or tracking items
> in the spec author's workspace: those now read as paths inside this package or as
> neutral wording. No rule, number, vector or source note was changed.

Written 20 Oct 2026 for the ProvablyFair.org audit of Duel.com Castle Roulette.

**Status: complete for every captured round.** The position step (§2.3) reproduces
**1,350 / 1,350** dataset positions, **100 / 100** public E10 rolls and **every one
of the readings taken from Duel's public Verify page** (§5.2). One detail is open
(O2): when the first 4-byte chunk lands in the top 16 values of 2³², either Duel
rejects it or it takes `% 48` anyway. No captured round reaches that case. A
crafted probe that settles it is ready but not yet run.

This document is the only input an implementer needs. It was written without
opening any Duel source code, any port of it, or any copy of Duel's in-site
verifier code (§8 lists every file and URL opened). Every step names where it
came from:

- **PAGE**: Duel's public pages, quoted with location and date. This includes
  black-box readings of Duel's public Verify page (crafted inputs typed in, only
  the "Game Result" card read; the code panel was never read). The coordinator
  allowed this on 20 Oct 2026.
- **STANDARD**: the standard provably-fair construction (SHA-256 commitment to a
  server seed; HMAC-SHA256 keyed by the server seed; a public randomness beacon,
  here drand, mixed in after the bet).
- **DATA**: fixed by testing candidates against the 1,350 live rounds in
  `data/castle-roulette-master-1350rounds.json`
  (captured 22–23 Apr 2026), and the 100 public rolls in E10.
- **CONFIG**: Duel's public `GET /api/v2/metadata/roulette`, captured 5 Oct 2026 as
  `evidence/E10-metadata-roulette-2026-10-05.json`.
- **BEACON**: the public drand "quicknet" chain, fetched with GET from
  `https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/`
  on 20 Oct 2026.
- **HINT**: the coordinator's message of 20 Oct 2026, passing on a finding from the
  separate clean-room Crash spec (also data-derived, no Duel code read). For Duel
  Crash, the HMAC message is the drand signature bytes decoded as UTF-8 with
  invalid bytes replaced, then ":0". The hint only proposed this candidate. The
  Castle Roulette data and the Verify page confirmed it (§2.4).

---

## 1. Inputs and commitment

### 1.1 What the game is

A shared, live-hosted wheel round. Players back one of six coins before the
round. The wheel lands on one of 48 positions, and each position belongs to one coin.

- PAGE (E01, and the live game page `duel.com/castle-roulette` rendered 20 Oct
  2026): six bet buttons labelled **2X, 4X, 8X, 16X, 24X, 48X**, each "Place bet";
  header labels "Provably Fair" and "Zero Edge"; a "Last 100" strip (E01:
  51 / 23 / 10 / 8 / 3 / 5; live 20 Oct: 54 / 23 / 11 / 7 / 2 / 3).
- The dataset names the coins `two`, `four`, `eight`, `sixteen`, `twenty_four`,
  `forty_eight`.

### 1.2 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | 64 lowercase hex characters (32 bytes); one per round, revealed after the round | PAGE: E02 round panel field "Server Seed". DATA: 1,350 distinct seeds, all 64 hex |
| `serverSeedHash` | 64 lowercase hex characters | PAGE: E02 field "Server Seed Hashed" |
| `drandRoundId` | integer, the drand quicknet round | PAGE: E02 field "Drand Round ID" |
| `drandSeed` | 96 lowercase hex characters (48 bytes) = the drand round's **BLS signature** | PAGE: E02 field "Drand Randomness"; Verify page field "Drand seed". BEACON: equals the public `signature` (not the public `randomness`) on 1,350/1,350 rounds and 100/100 E10 rolls |
| `coin` | one of the six coins | DATA (`request.coin`); PAGE (E01 buttons) |
| `amount` | stake, decimal | DATA |

There is **no client seed and no player nonce** for this game:

- PAGE: Duel's public Verify page (`duel.com/provably-fair/verify`, Game =
  "Castle Roulette", rendered 20 Oct 2026, logged out) asks for exactly two
  inputs, labelled **"Drand seed"** and **"Server seed"**. For Dice and Blackjack
  the same page asks for "Client seed", "Server seed" and "Nonce".
- PAGE: with only those two values typed in, the page shows **"Game Result:
  Roll 27"** for round 538493, which is the captured position (§5.2). The round
  id and the drand round id are not inputs to the outcome.
- The ":0" in §2.3 is a constant in the message, not a player nonce.
- Note: Duel's general Overview text ("Fair result = Server seed + Client seed +
  Nonce", E03 and live 20 Oct 2026) describes the seed-pair games and does not fit
  this game.

### 1.3 Commitment

PAGE (duel.com/provably-fair, Overview; E03 and live 20 Oct 2026):

> "We then send you the hex-encoded SHA-256 hash of our server seed before you
> place your bets, to prove we won't change our minds."

```
serverSeedHash = lowercase_hex( SHA-256( hex_decode(serverSeed) ) )
```

i.e. hash the **32 raw bytes**, not the 64 ASCII characters.

- SOURCE: PAGE + STANDARD for SHA-256; DATA for the encoding.
- Candidates: SHA-256 over the hex-decoded bytes → **1,350 / 1,350** dataset rounds
  and **100 / 100** E10 rolls; SHA-256 over the ASCII hex string → **0 / 1,350**.
- Each round has its own seed (1,350 distinct seeds and hashes). There is no seed
  rotation and no next-seed hash to chain.

### 1.4 Beacon binding (drand quicknet)

Chain (BEACON, `/info`, 20 Oct 2026): `schemeID "bls-unchained-g1-rfc9380"`,
`beaconID "quicknet"`, `period 3`, `genesis_time 1692803367`,
chain hash `52db9ba7…84e971`.

For each round:

```
drandSeed            == public signature of round drandRoundId        (byte-exact hex)
public randomness    == SHA-256( hex_decode(drandSeed) )             (drand's own rule)
publishTime(round)   == 1692803367 + (drandRoundId − 1) × 3           (seconds, UTC)
betPlacedAt          <  publishTime(drandRoundId) × 1000              (milliseconds)
```

- SOURCE: STANDARD + BEACON + DATA. All four hold on **1,350 / 1,350** rounds. The
  signature equality also holds on **100 / 100** E10 rolls.
- DATA: every bet is placed between **14,763 ms and 20,405 ms** before its beacon
  round is published. The capture field `commitmentBeforeDrand` equals
  `publishTime × 1000 − betPlacedAt` on 1,350/1,350.
- DATA: drand round ids strictly increase with Duel's round id.
- The position uses the **signature**, not drand's `randomness`. Since
  randomness = SHA-256(signature), the two carry the same information. The
  signature can also be checked against the chain's public key (BLS, not done
  here).
- Not settled: when Duel first showed `serverSeedHash` relative to the beacon
  publication. The capture has no timestamp for the hash display (O3).

---

## 2. Outcome derivation

### 2.1 Input decoding

```
S = hex_decode(serverSeed)     # 32 bytes
G = hex_decode(drandSeed)      # 48 bytes
```

- SOURCE: PAGE (black-box) + DATA. Duel's Verify page gives the same roll for
  upper- and lower-case input. A trailing odd nibble is ignored: `ab/ab`,
  `abc/abc`, `abc/ab` and `ab/abc` all give 28, as `ab/ab` does under §2.3. A
  non-hex pair reads as a zero byte: `zz/zz` gives 26, the same as `00/00`.
  `hello/world` gives 11, the same as §2.3 computes for two zero bytes on each
  side. Real rounds always carry valid lowercase hex, so an implementation needs
  only standard hex decoding.

### 2.2 Message: the signature bytes as lossy UTF-8 text, then ":0"

```
text    = decode_utf8_lossy(G)     # invalid byte sequences → U+FFFD
message = utf8_encode(text) + ":0" # i.e. bytes: lossy(G) || 0x3A 0x30
```

- `decode_utf8_lossy` is the WHATWG / Unicode "maximal subpart" replacement
  decoding: each maximal invalid subsequence becomes one U+FFFD, which re-encodes
  as `EF BF BD`. Valid sequences, including `00`, pass through unchanged. This is
  what Python's `bytes.decode('utf-8', errors='replace')` does. JavaScript's
  `TextDecoder('utf-8')` and Node's `Buffer.toString('utf8')` follow the same
  WHATWG replacement rule, but they were not run against this data (O5).
- The message length therefore varies by round (70–92 bytes in the §5.1 vectors).
- SOURCE: HINT (candidate) + DATA + PAGE (confirmation): 1,350/1,350, 100/100 and
  every Verify-page reading. The hex text of G (the obvious reading) is at chance
  level (§2.4).

### 2.3 HMAC and reduction to a position

```
digest   = HMAC-SHA256( key = S, message )          # 32 bytes
u        = digest[0..3] as unsigned 32-bit BIG-ENDIAN
position = u mod 48                                  # 0 … 47
```

- SOURCE: STANDARD (HMAC-SHA256 keyed by the server seed) + DATA.
- Key = the 32 hex-decoded seed bytes. The ASCII-hex key and the lossy-decoded
  key score at chance (§2.4).
- Byte order: big-endian 1,350/1,350. Little-endian 69/1,350.
- **Rejection or not (O2).** 2³² = 48 × 89,478,485 + 16. Under plain `mod 48`, the
  16 values `u ≥ 4,294,967,280` (LIMIT) make positions 0–15 one count more likely
  than 16–47. A rejection loop ("if u ≥ LIMIT, use the next 4-byte chunk") would
  remove that. **0 of 1,350** captured rounds have a first chunk ≥ LIMIT
  (probability 16/2³² per round), so both forms give 1,350/1,350. A crafted input
  that separates them was found (§5.3) but could not be run on the Verify page:
  the browser stopped loading pages. Until it is run, implement **plain `mod 48`**
  and flag the branch.
- Exact per-coin return under plain `mod 48` (positions equally weighted
  otherwise), from `spec_check.py`:

  ```
  two          0.999999996275  (−16/2³²)
  four         1.000000000000  (exactly 1)
  eight        1.000000007451  (+32/2³²)
  sixteen      1.000000007451
  twenty_four  1.000000007451
  forty_eight  1.000000007451
  ```

  Each position's probability is off 1/48 by at most ⅔ × 2⁻³² (positions 0–15:
  +⅔ × 2⁻³²; 16–47: −⅓ × 2⁻³²), within the profile's R1 ceiling of 2⁻³². With
  rejection, every coin returns exactly 1.

### 2.4 Candidates tried

Chance level for one rule is 1,350 / 48 ≈ 28 on the dataset and about 0.19 of 9
Verify-page readings.

S/G = hex-decoded server seed / drand signature; Sa/Ga = their ASCII hex strings;
R = drand randomness = SHA-256(G); ids = round id, bet id, drand round id.

| # | Family | Size | Data | Best |
|---|---|---|---|---|
| 1 | HMAC-SHA256 in both key/message orders and SHA-256 of concatenations (with `:`, `-` or no separator), over Sa/S × Ga/G; mappings u32 BE/LE `% 48`, 32-bit float × 48, 52-bit float × 48, whole digest `% 48` | 120 rules | 1,350 + E10 | 40/1,350; 3/100 |
| 2 | As 1, plus messages carrying `0`, `1`, round id, drand round id or bet id (with `:`, `-` or no separator), HMAC-SHA512, SHA-256(G), XOR forms; u32 at every 4-byte offset, u64, 52-bit | 16,172 rules | first 200 | 13/200 |
| 3 | As 1 with R in place of G, plus `R:0`, `R:drandRoundId`, `R:roundId`, HMAC-SHA512 | 440 rules | 1,350 | 43/1,350 |
| 4 | Families 2 + 3 with any fixed value → position table allowed | 5,816 rules | 1,350 | 156/1,350 (chance level for a free table) |
| 5 | SHA-256/512, SHA-1, SHA3-256 and MD5 in HMAC and concatenation forms over G and R, ids in the message; u32 at every byte offset BE/LE, whole digest, 32-bit float | 209,710 rules | 1,350 + E10 | 56/1,450 |
| 6 | Additive and XOR mixes of a seed-derived u32 and a beacon-derived u32, plus single-input controls | 103 rules | 1,350 | 39/1,350 |
| 7 | Core HMAC/hash forms over S, Sa, SHA-256(S) × G, Ga, R; SHA-256/512 and double hashes; any 1–8-byte window BE/LE, `% 48` or scaled; hex prefixes of 5–16 characters | 153,643 rules with ≥ 1 hit | first 300 | 20/300 |
| 8 | `HMAC-SHA256(key = S or Sa, "X:n")`, `"X:n:0"`, `"n:X"`, X = **Ga** (hex text) or hex(R), fixed n = 0…2,000 | 24,012 rules × 2 mappings | first 60 | 8/60 |
| 9 | Roles swapped: `HMAC-SHA256(key = G/Ga/R, "serverSeed:n")`, `":n:0"`, plain; n = 0…299 | 2,404 rules × 3 mappings | first 60 | 7/60 |
| 10 | 11 hash families × HMAC/concatenation × S, Sa × G, Ga, R, `G:0`, `R:0`, `G:0:0`; free value → position table allowed | 2,800 rules | 1,350 | exact 53/1,350; table 151/1,350 |
| 11 | 12 hash families × HMAC, concatenation, XOR over G, SHA-256(G), Ga × S, SHA-256(S), Sa; any 1–8-byte window, hex prefixes | 197,684 rules with ≥ 1 hit | 9 readings | 4/9 |
| 12 | Template grammar `X{sep}n[{sep}c]` with Ga or hex(R), both role orders, SHA-256/512 | 5,284 rules with ≥ 1 hit | 9 readings | 3/9 |
| 13 | Seeded PRNGs (MT19937, mulberry32, Python Mersenne) on HMAC/hash digests | 29 rules with ≥ 1 hit | 9 readings | 2/9 |
| **14** | **Lossy-UTF-8 message (HINT):** message = lossy(G) or lossy(SHA-256(G)) + one of `""`, `":0"`, `":1"`, `":0:0"`, `"-0"`, `":"`; key = S, lossy(S) or Sa, in both HMAC orders; mappings u32 BE `% 48`, u32 LE `% 48`, u32 BE with rejection, u32 × 48 >> 32, 4-byte float × 48, whole digest `% 48` | 432 rules | 1,350 + E10 + 9 readings | **1,350/1,350, 100/100, 9/9** for `HMAC(key=S, lossy(G)+":0")`, u32 BE `% 48` (and with rejection). Next best: 69/1,350 (same message, little-endian) |

Family 14 output (`search14.py`, 20 Oct 2026):

```
rules 432 | rows D 1350 E 100 Verify-page 9
  D 1350/1350  E 100/100  V 9/9 ('HMAC(k=S, m=lossy(G)+":0")', 'u32BE%48')
  D 1350/1350  E 100/100  V 9/9 ('HMAC(k=S, m=lossy(G)+":0")', 'u32BE reject')
  D 69/1350  E 8/100  V 0/9 ('HMAC(k=S, m=lossy(G)+":0")', 'u32LE%48')
  D 43/1350  E 1/100  V 0/9 ('HMAC(k=lossy(SHA256(G))+"", m=Sa)', 'u32BE*48>>32')
  D 43/1350  E 1/100  V 0/9 ('HMAC(k=lossy(SHA256(G))+"", m=Sa)', 'float4(Stake)*48')
  D 39/1350  E 0/100  V 1/9 ('HMAC(k=Sa, m=lossy(G)+":")', 'big%48')
```

Why families 1–13 missed: none of them turned G into UTF-8 text with replacement.
Family 8 already had the exact `key = S`, `":0"`, u32 BE `% 48` shape, but its
message was the hex text of G.

---

## 3. Win condition and payout

### 3.1 Position → tier table

```
position 0            → forty_eight  (48x)    1 position
positions 1–2         → twenty_four  (24x)    2 positions
positions 3–5         → sixteen      (16x)    3 positions
positions 6–11        → eight        (8x)     6 positions
positions 12–23       → four         (4x)    12 positions
positions 24–47       → two          (2x)    24 positions
```

- SOURCE: DATA. Every position 0–47 occurs in the capture, and each always comes
  with the same `winningCoin`. The table holds on **1,350 / 1,350**. The tier
  multipliers are PAGE (E01 and the live game page: 2X … 48X).
- For every tier, position count × multiplier = **48**. With equally likely
  positions every coin returns exactly 100 %, which matches the "Zero Edge" label
  on E01 and the live page. For the 2⁻³²-scale effect of `mod 48`, see §2.3.
- CONFIG has no paytable. Its `castle_roulette_config` carries
  `min_house_edge_limit "0.1"`, `max_house_edge_limit "5"`, `exposure_percent "5"`
  and `bankroll "50000000"`. None of them is used here (O4).
- "Position" is the index that the round record and the Verify page ("Roll")
  report. The visual order of slots on the drawn wheel is not needed.

### 3.2 Win rule

```
win  ⇔  coin == tier(position)
```

- SOURCE: DATA. The recorded `isWin` matches on **1,350 / 1,350** (473 wins,
  877 losses).

### 3.3 Payout

```
win : amountWon = amount × multiplier(coin)      exact (2, 4, 8, 16, 24 or 48)
loss: amountWon = 0
stake debit: amountCurrency = −amount
```

- SOURCE: DATA. Exact decimal equality on **1,350 / 1,350**. Served strings carry
  18 decimals (`"0.020000000000000000"`), so compare them numerically.
- DATA: the served `multiplier` is the multiplier of the **landed** tier, not of
  the backed coin. A `forty_eight` loss that lands on `twenty_four` serves
  `"24.000000000000000000"`. This holds on 1,350/1,350. On a loss, this field is
  not the player's payout rate.
- DATA: `effectiveEdge` is 0 on 1,350/1,350.

### 3.4 Fields an implementation must not read

`position`, `winningCoin`, `isWin`, `multiplier`, `effectiveEdge`, `amountWon` and
E10 `roll` are the operator's claims, to be checked. The derivation reads only
`serverSeed`, `drandSeed` (checked against the public chain), `coin` and `amount`.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Inputs = server seed + drand seed only | PAGE | Verify page fields "Drand seed", "Server seed"; Roll 27 for round 538493 |
| Commitment = SHA-256 of the hex-decoded seed | PAGE + STANDARD + DATA | 1,350/1,350 and 100/100; ASCII form 0/1,350 |
| drand seed = public quicknet signature | BEACON + DATA | 1,350/1,350; 100/100 |
| Publish time = genesis + (round − 1) × 3; bet before it | BEACON + DATA | 1,350/1,350; gap 14.8–20.4 s |
| Both inputs hex-decoded | PAGE (black-box) + DATA | §2.1 readings |
| Message = lossy-UTF-8(G) + ":0" | HINT + DATA + PAGE | 1,350/1,350; 100/100; all Verify readings; hex-text form at chance |
| HMAC-SHA256, key = S | STANDARD + DATA | as above; Sa and lossy(S) keys at chance |
| First 4 bytes big-endian, mod 48 | DATA | 1,350/1,350; LE 69/1,350 |
| Rejection ≥ 4,294,967,280 | not settled | 0/1,350 rounds reach it; O2 |
| Position → tier table | DATA + PAGE (tiers) | 1,350/1,350; 48/48 positions seen |
| Win ⇔ backed coin = landed tier | DATA | 1,350/1,350 |
| Payout = amount × multiplier, exact; loss = 0 | DATA | 1,350/1,350 |

---

## 5. Test vectors

### 5.1 From the dataset

Five rounds copied from `castle-roulette-master-1350rounds.json`. "randomness" is the
public drand value SHA-256(drandSeed), fetched from the relay, and is not used in
the derivation. `message` is shown in hex, including the trailing `3a30` (":0").

**V1: round 538493, bet 6371554** (phase A, `two`, win; also read on Duel's Verify page)
```
serverSeed      adace83dfe4957273152c5c52aea5e4fc112dabef87ff4baa350ca652420eb26
serverSeedHash  ae7a5f98e2f4785022a58890db980cb71bb9f0c1bd02a44a1d69699ad18baaaa
drandRoundId    28007049   published 1776824511 (2026-04-22T02:21:51Z); bet at 1776824490621 ms
drandSeed       8d59f6f2c17c6c3a77f65dfc4b5530bb607c8891d21a90cdff2628d69a461ca692b6ad3c041e1c7a8a9d87005cd6621d
randomness      a0f726de1160479b246fb4c7c2704b3b4bce3ce879604825eb79357e87795885
message (92 B)  efbfbd59efbfbdefbfbdefbfbd7c6c3a77efbfbd5defbfbd4b5530efbfbd607cefbfbdefbfbdefbfbd1aefbfbdefbfbdefbfbd2628d69a461cefbfbdefbfbdefbfbdefbfbd3c041e1c7aefbfbdefbfbdefbfbd005cefbfbd621d3a30
HMAC            d6b318ab366262e3139f86c6d1f6695b548ee0e56c05128f5ba0b8ae1b71b3b1
u32 3602061483 → position 27 → two → win; multiplier 2; amountWon 0.02
```

**V2: round 540415, bet 6412325** (phase C, stake 1, `two`, win)
```
serverSeed      9d4721c7414516459a279c0577e88fd583e2339121c6cbd98557f652e791808d
serverSeedHash  d02f36db42cf89ae8d76c3c0169270f3916886638251212eec80ae66c10e9212
drandRoundId    28026594   published 1776883146; bet at 1776883125773 ms
drandSeed       851e604a895dc2a13ace561cf219f72f91b76dbef987de9c246f320425da40882777f98edd04f26bc24e63e077c90a80
randomness      55dca4c9b7990e75e49d6e7a2ef64e6b66ce25a83ef7e511106f6c768b1742ba
message (90 B)  efbfbd1e604aefbfbd5dc2a13aefbfbd561cefbfbd19efbfbd2fefbfbdefbfbd6defbfbdefbfbdefbfbdde9c246f320425efbfbd40efbfbd2777efbfbdefbfbdefbfbd04efbfbd6befbfbd4e63efbfbd77efbfbd0aefbfbd3a30
HMAC            3ebd086ba8c431ef22fa322ace2a0c35430da48ee8da034cd128325e6f1daab6
u32 1052575851 → position 27 → two → win; multiplier 2; amountWon 2
```

**V3: round 540004, bet 6401166** (phase B, `eight`, loss)
```
serverSeed      1726a013573289c021223f32114ee754012c96d8bae142084bd2f7217af77498
serverSeedHash  32069b261d26e46206fcb91afa8419e3cac86be5bf7c372baf2b18aa27b183c9
drandRoundId    28022484   published 1776870816; bet at 1776870795753 ms
drandSeed       b165350aebd5f05641d042ce59f296f0a256f24a8552cb89a7f480ab1f09418f8a721ac54590c0e6258c2d6e9c6f2199
randomness      9002a78d29eebc8fcc9452f00706e0cb73c227b58bfb97706474b3af040b35fc
message (88 B)  efbfbd65350aefbfbdefbfbdefbfbd5641efbfbd42efbfbd59efbfbdefbfbd56efbfbd4aefbfbd52cb89efbfbdefbfbd1f0941efbfbdefbfbd721aefbfbd45efbfbdefbfbdefbfbd25efbfbd2d6eefbfbd6f21efbfbd3a30
HMAC            001dfa87bc9fe4982660b7556c2616c3139ad05e5dfb020faf29afb00651508d
u32 1964679 → position 39 → two → loss; served multiplier 2 (landed tier); amountWon 0
```

**V4: round 541112, bet 6450364** (phase D, `sixteen`, win)
```
serverSeed      c3befbdb23570b76a3c091ef0fc57d177f0fdffbbcab8a66cc0087379f8ff116
serverSeedHash  69ff2e868da41481c843375cf969b62fe94bd125cd6561a9d13c70fe473c6268
drandRoundId    28033564   published 1776904056; bet at 1776904035882 ms
drandSeed       880616e5f423c3c9f0e2acb06de5aada0496fe09c78da00497593bdbd8babcb6da1b260074526eaa783224998a8b63d2
randomness      9807f40a49f636a588900788098776235da85934653529b7c2123add422f0dff
message (91 B)  efbfbd0616efbfbdefbfbd23efbfbdefbfbdefbfbde2acb06defbfbdefbfbd04efbfbdefbfbd09c78defbfbd04efbfbd593befbfbdd8baefbfbdefbfbdefbfbd1b260074526eefbfbd783224efbfbdefbfbdefbfbd63efbfbd3a30
HMAC            839b89944992255ce8cd0c879dbd8e2a4d423fc88b4043b3328b3d1fe5906365
u32 2208008596 → position 4 → sixteen → win; multiplier 16; amountWon 0.16
```

**V5: round 541180, bet 6454246** (phase E, `forty_eight`, win on the single 48x position)
```
serverSeed      651a40d387346919ee59de3ac9858c3a8b20aa1d5dc78ecfd54d5a869bd5cfb5
serverSeedHash  8930e42cbf5db531bf28177327324bea49f6711e8c19d7b0bcb61040a1d651a6
drandRoundId    28034244   published 1776906096; bet at 1776906075881 ms
drandSeed       91f15725497c704c9f61ed8a7f5937067c7928022ba670f0b8fa5f7c23a1583649fd470a748e1413864038285f4c1332
randomness      a20a014382e5232205c589d0778dfc7c95ee3db31984185a90f75ff7a477d706
message (70 B)  efbfbdefbfbd5725497c704cefbfbd61efbfbd7f5937067c7928022befbfbd70efbfbdefbfbd5f7c23efbfbd583649efbfbd470a74efbfbd1413efbfbd4038285f4c13323a30
HMAC            07129a702e6f6237d190061776e058804613bf2be5c5bad2647bb221c8dec392
u32 118659696 → position 0 → forty_eight → win; multiplier 48; amountWon 0.48
```

### 5.2 Duel's Verify page (black-box readings, 20 Oct 2026)

`duel.com/provably-fair/verify`, Game = Castle Roulette, logged out. Each reading
was repeated until the inputs held and the result was stable over 1.2 s. "Spec" is
§2.3 computed on the page's byte reading of the input (§2.1).

```
D = 8d59f6f2…cd6621d (V1 drandSeed)      S = adace83d…20eb26 (V1 serverSeed)
Drand seed, Server seed   page    spec
D,  S                   → 27      27   (= captured position of round 538493)
D,  upper(S)            → 27      27
S,  D   (swapped)       → 36      36
00, 00                  → 26      26
01, 00                  → 5       5
00, 01                  → 13      13
ab, ab                  → 28      28   (abc/abc, abc/ab, ab/abc: page 28; read as ab)
ff, ff                  → 14      14
D,  00                  → 39      39
00, S                   → 43      43
zz, zz                  → 26      26   (read as 00/00)
hello, world            → 11      11   (read as 0000/0000)
a,  a                   → no result shown (no whole byte)
```

### 5.3 Crafted rejection probe (not yet run)

Found by searching server seeds of the form 28 zero bytes + 4-byte counter
(`findrej.js`):

```
drandSeed   = V1 drandSeed
serverSeed  = 00000000000000000000000000000000000000000000000000000000161fff60
HMAC        = fffffff4ad282d590ec6b3b7539f5a75d9f5c00620affb53fc64ca5bac039d05
u32 chunk0  = 4294967284 (≥ LIMIT 4294967280)
plain mod 48            → position 4
rejection (next chunk)  → 2905091417 mod 48 = position 41
```

Typing these two values into the Verify page settles O2: 4 means plain `mod 48`,
41 means rejection.

---

## 6. Open points

- **O1: the derivation. CLOSED 20 Oct 2026** (§2.2–2.3; family 14).
- **O2: rejection or plain `mod 48`.** The data cannot tell them apart (0/1,350
  rounds reach the branch). The §5.3 probe settles it. The effect is at most
  ⅔ × 2⁻³² per position and ≤ 32/2³² ≈ 7.5 × 10⁻⁹ on any coin's return.
- **O3: commitment timing.** The capture shows the bet placed 14.8–20.4 s before
  the beacon round is published, but has no timestamp for when Duel first showed
  `serverSeedHash`. CASTLE-17's "commitment shown before the beacon is published"
  is not witnessed by this dataset.
- **O4: CONFIG edge fields.** `min_house_edge_limit "0.1"`,
  `max_house_edge_limit "5"` and `exposure_percent "5"` are in the public config.
  Every captured round served `effectiveEdge 0` and paid the full 2/4/…/48x. No
  public source says what these fields do. The config was captured 5 Oct, the
  rounds on 22–23 Apr.
- **O5: lossy-decoder parity across languages.** The spec was checked with
  Python's `errors='replace'`. A JavaScript implementation should use
  `TextDecoder('utf-8')` (non-fatal) and run §5.1 V1–V5 as known answers before
  trusting it. Every captured signature exercises the replacement path.
- **O6: E10 `roll` = dataset `position`.** Both are reproduced by the same §2.3, so
  they are the same index. E10 carries no tier, so its rolls test §2 only.

---

## 7. Reproduction

The spec author's check scripts (throwaway, outside every repo):
`spec_check.py` (all determined parts plus §2.3), `search*.py` (the §2.4
families; `search14.py` is family 14), `fetch_drand.py` + `drand_cache.json`
(1,450 public drand rounds), `oracle_vectors.json` (§5.2), `findrej.js` (§5.3).

`spec_check.py` output, 20 Oct 2026:

```
commit: 1350/1350
commit_ascii: 0/1350
sig_eq_public: 1350/1350
rand_eq_sha256sig: 1350/1350
pubtime_formula: 1350/1350
bet_before_beacon: 1350/1350
gap_field: 1350/1350
pos_range: 1350/1350
tier_table: 1350/1350
win_rule: 1350/1350
served_mult_is_winning_tier: 1350/1350
edge0: 1350/1350
stake_debit: 1350/1350
payout: 1350/1350
wins: 473  losses: 877
bet-to-beacon gap ms: min 14763 max 20405
drand round ids strictly increase with roundId: True
positions seen: 48 /48
positions per tier: {'forty_eight': 1, 'twenty_four': 2, 'sixteen': 3, 'eight': 6, 'four': 12, 'two': 24}  count x multiplier: {'forty_eight': 48, 'twenty_four': 48, 'sixteen': 48, 'eight': 48, 'four': 48, 'two': 48}
E10 rolls: commit 100/100  sig_eq_public 100/100  roll in 0..47 100/100
position = HMAC-SHA256(key=S, msg=lossyUTF8(G)+":0") u32BE % 48: dataset 1350/1350  E10 100/100
same with rejection >= 4294967280: dataset 1350/1350;  rounds whose first chunk >= LIMIT: 0
  plain %48 RTP two          = 0.999999996275  (excess -3.725e-09)
  plain %48 RTP four         = 1.000000000000  (excess 0.000e+00)
  plain %48 RTP eight        = 1.000000007451  (excess 7.451e-09)
  plain %48 RTP sixteen      = 1.000000007451  (excess 7.451e-09)
  plain %48 RTP twenty_four  = 1.000000007451  (excess 7.451e-09)
  plain %48 RTP forty_eight  = 1.000000007451  (excess 7.451e-09)
```

---

## 8. Files and URLs opened while writing this spec

Files: `evidence/` E01, E02, E03, E04 (PNG),
`E10-metadata-roulette-2026-10-05.json` and its `.meta.json`;
`data/castle-roulette-master-1350rounds.json`;
the audit framework's `games/castle-roulette/profile.json`;
the audit framework's `games/dice/ALGORITHM.md` (format model).

E04 is a screenshot of the Verify tab. Its code panel shows only a header comment
and empty input lines (`clientSeed`, `serverSeed`, `nonce`). No algorithm line is
visible and none was read.

URLs (GET, logged out, 20 Oct 2026):

- `duel.com/provably-fair` (Overview) and `duel.com/castle-roulette`.
- `duel.com/provably-fair/verify`: Castle Roulette selected; crafted inputs typed
  in. Only the form labels, the game list and the "Game Result" card text were
  read, through a filter that rejected any text containing code tokens. Three
  sessions, all disclosed in §5.2. A fourth, for the §5.3 probe, failed to load
  the page.
- `duel.com/economics-changelog`: opened by a stray click; it showed only site
  chat.
- `curl` of `duel.com/provably-fair`, `duel.com/castle-roulette` and
  `duel.com/originals/castle-roulette` (empty app shells).
- `api.drand.sh/<quicknet>/info` and `/public/<round>` for the 1,450 referenced
  rounds.
- One web search, with no relevant result.

Not opened: any `verify-tab`, `verifier-parity`, `src/`, `tests/`, `scripts/`,
`capture/`, `verify.js`, `test.js`, `MANIFEST.md` or `README.md` of any Duel
package or of `pf-verifier`, any saved Duel JS bundle, the Verify page's code
panel, the castle-roulette `CHANGES.md` / `status.json`, or anything in the
browser-automation snapshot folder of the spec author's workspace. The browser tool wrote
page snapshots there, and they may contain the code panel's text.
