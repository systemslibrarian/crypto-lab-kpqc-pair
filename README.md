# KpqC Pair

**AIMer · NTRU+ · KpqC** — the two Korean KpqC algorithms the Quantum Vault lab left
out: a signature whose intended hardness rests on a symmetric one-way function, and a KEM from
the older NTRU line. Together with
[Quantum Vault KpqC](https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/)
this completes the set of four.

---

## What It Is

Two real post-quantum algorithms from Korea's KpqC competition, run in the browser
against their reference implementations:

- **AIMer-128f** — an MPC-in-the-Head signature. The public key holds an image of the
  **AIM2** symmetric one-way function; signing is a Fiat–Shamir transform over a
  proof intended to establish knowledge of a preimage. This historical AIM2-based
  relation has a reported forgery vulnerability: an accepted proof need not imply
  knowledge of a valid AIM2 preimage. The honest signing path remains useful for
  comparing a symmetric construction with the lattice KEM beside it.
- **NTRU+768** — a lattice KEM in the NTRU family, working in the quotient ring
  `Z_3457[X] / (X^768 - X^384 + 1)`, with a ciphertext-validity check that fails
  closed.

Both run as the **KpqC reference implementations compiled to WebAssembly**
(`@killd21/kpqc` 0.2.0). Nothing here is a simulation or a toy stand-in. Two pieces
are additionally hand-rolled in TypeScript so they can be inspected on screen — the
AIM2 forward evaluation (`src/aimer/aim.ts`) and the NTRU+ ring multiplication
(`src/ntruplus/ring.ts`) — and each is cross-checked against the reference rather
than trusted:

- the hand-rolled **AIM2 image is compared to the image the reference WASM put in the
  public key**, and they must be equal. This cross-check demonstrates the honest
  signer's preimage, not what every accepted signature proves;
- the hand-rolled **ring's parameters match the pinned C reference's `params.h`
  and `poly.h`**. A coefficient mod 3457 needs 12 bits, so 768 coefficients pack to
  the 1152-byte key width. Width alone does not identify a modulus or prove ring
  multiplication correct; the review also compared products with the reference's
  NTT multiplication and independent polynomial long division.

**Security model:** everything is client-side; no network backend, no key ever
leaves the page. **This is not production crypto.** It is a teaching demo, the WASM
is not guaranteed constant-time, and these schemes are newer and less
cross-implementation-scrutinized than the NIST FIPS selections. See
[Honest Limitations](#honest-limitations).

### AIMer source and binary identification

The [January 30, 2026 specification](https://aimer-signature.org/docs/AIMer_Specification_v260130.pdf) prints the SHA-256 digest of its [reference archive](https://github.com/samsungsds-opensource/AIMer/blob/e47c497f3552c234e0ca8368df9bb629af9608ce/AIMer-package.zip) on the cover. The archive matches that digest, `d7bbdb28e70dad021da2057bc0b4802585770cbc2d7449acfcd770d8bc624521`. All 30 C sources and headers and all six known-answer response files in the [vendor directory at the npm release tag](https://github.com/killd21/kpqc-js/tree/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/AIMer) match the corresponding archive files byte for byte.

The lockfile pins the published `@killd21/kpqc@0.2.0` package by integrity hash. Its `wasm/aimer.wasm` is 127,927 bytes with SHA-256 `84891f67519658f64544b34bf472a3a7206fd054bc19a815a554438207a96805`. The [binary stored under the Git tag](https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/packages/kpqc/wasm/aimer.wasm) is 128,195 bytes with SHA-256 `e66de0d791066401e26814f3afaa688b7bc8dce2998ca13de0b573e2c823bb63`. The lab displays and tests the digest of the npm artifact it loads. The evidence identifies the source archive and the two distributed binaries. Reproducing the npm compilation remains a separate check.

## Research status — historical AIM2 implementation

[Practical Null-Branch Witness Attacks on In-the-Head Signatures,
ePrint 2026/2235](https://eprint.iacr.org/2026/2235), published September 28, 2026,
reports practical classical, public-key-only forgeries for AIM2-based AIMer v2.0,
including AIMer-128f. Zero factors in the encoded relation permit satisfying
witnesses that do not decode to valid OWF preimages; the authors demonstrate
acceptance by unmodified reference verifiers without signing queries. This is a
**demonstrated result reported in a preprint**, not an attack on AIM2 inversion
or a blanket break of MPC-in-the-Head.

This lab retains the historical AIM2 path in `@killd21/kpqc` 0.2.0. Its pinned
vendor source contains the implicated zero-factor equations. The paper's forgery
has **not yet been independently reproduced against this lab's shipped WASM**.
The authors' artifact was unavailable when this update was prepared; a forged
AIMer-128f fixture must be checked against this exact verifier before claiming
local reproduction. Passing honest KATs or rejecting a particular flipped bit
does not rule out a constructed forgery.

Section 6.4 explains that AIMer v3.0 replaces AIM2 with AIM3 and excludes the zero
branch used in this attack. That is not a comprehensive security assessment of
v3.0. This lab has not migrated to AIM3 and must not be used for deployment.

**Research update — November 15, 2026.** [Biryukov, García Fernández, and Udovenko,
*Magic Pot: Cryptanalysis of full AIM2 in the standard and related-/reused-key settings
using new elimination framework*, ePrint 2026/903](https://eprint.iacr.org/2026/903)
(approved May 10, 2026; full version of a EUROCRYPT 2026 paper) cryptanalyses the AIM2
primitive of AIMer v2.1 itself rather than the proof relation: a new algebraic
elimination framework recovers an AIM2-I key (the 128-bit-security instance, the level
this lab's AIMer-128f reference uses) in about 2^103.66 encryptions against a claimed
128-bit level (previous best 2^125.8), and becomes practical only in misuse settings
(one secret key reused under different IVs, or related keys). This is a reported loss
of security margin, not a practical break of a single honestly generated AIMer-128f
key like the one this lab's reference WASM creates; it does not change what the
exhibit shows, and KAT agreement, the matching AIM2 image, and one-bit tamper
rejection were never evidence that AIM2 is one-way.

## NTRU+ research update — October 19, 2026

[de Perthuis and Trenkić, *How Secure are NTRU+ Keys? Analysing the Best Module Attacks*, ePrint 2026/2527](https://eprint.iacr.org/2026/2527), received October 18 and published October 19, is a **preprint with model-dependent estimates**. Its simulation-based analysis finds the best module attack saves 4–10 BKZ block sizes, costing at most three bits of security in the Core-SVP model. The analyzed NTRU+ parameterizations remain safe within the authors' analysis.

This is not demonstrated production-key recovery or a proof of security. The lab retains NTRU+768 and its pinned known-answer fixtures; it does not execute the module attack. These estimates should not be subtracted from unrelated security figures or generalized to every NTRU-based scheme. The visible NTRU+ panel and Primary trails link to the paper.

The NTRU+768 secret key in this build occupies **2,336 bytes**. The [pinned key generator](https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/NTRUplus/Reference_Implementation/NTRU%2B768/kem.c) writes two 1,152-byte polynomial encodings, then the 32-byte public-key hash. The [hash definition](https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/NTRUplus/Reference_Implementation/NTRU%2B768/symmetric.c) absorbs byte 0x00 followed by the public key into SHAKE256. The KEM separately returns a 32-byte shared secret.

## Exhibits

1. **NTRU+ — Meet in the NTRU ring.** Encapsulate to a freshly generated public key,
   show the ciphertext, decapsulate, and confirm the sender's and recipient's 32-byte
   secrets are identical. A one-bit change to the ciphertext is rejected by the real
   decapsulation path. The pinned decoder checks SOTP decoding and the recovered
   randomness against a hash-derived reconstruction; it does not literally build
   and compare a second ciphertext. On rejection its C output is zeroed and the JS
   wrapper returns no shared secret. Below it, a ring lab multiplies two monomials across all 768
   coefficients and shows the reduction `X^768 = X^384 - 1` applied — once for
   `X^767 · X`, and twice for `X^700 · X^500`, which lands on `-X^48`.
2. **AIMer (headline) — A signature from a symmetric one-way function.** Evaluates
   AIM2 forward on the secret preimage, stage by stage — constant addition, two
   inverse-Mersenne power maps, the SHAKE128-derived affine layers, the `x^7` outer
   S-box and the feed-forward XOR — then prints the computed image beside the image
   in the public key. It then signs and verifies with the reference implementation,
   splits the 5888-byte signature into its 33 per-repetition proof blocks, and lets
   you flip one bit inside a block and watch the real verifier reject it.
3. **The Set — Same jobs, different foundations.** The four KpqC algorithms placed on
   the post-quantum family tree (NTRU lattice KEM, module-lattice KEM, module-lattice
   signature, symmetric/MPCitH signature), with the two that live in the sibling lab
   linked across.

## When to Use It

- **Use it** to see that a post-quantum signature does not have to be a lattice
  problem — AIMer's intended hardness assumption is a symmetric one-way function, and the
  proof machinery is MPC-in-the-Head rather than a lattice identity. The historical
  relation flaw means this assumption alone does not establish signature security.
- **Use it** to show that national PQ suites cover the same job categories as NIST's
  while making different bets, and that "post-quantum" is a portfolio of assumptions
  rather than one replacement algorithm.
- **Use it** to watch an NTRU quotient ring actually wrap, on real discrete
  coefficients, rather than being told that it does.
- **Do NOT use it** to pick an algorithm for a real system, and do not read anything
  here as a claim that the KpqC selections are more or less secure than the FIPS
  ones. Nothing here establishes a hardness assumption; a green verdict means the
  implementation agreed with itself and with the published vectors.
- **Do NOT** lift this code into production. Use a maintained, audited library.

## Live Demo

**https://systemslibrarian.github.io/crypto-lab-kpqc-pair/**

Run a real AIMer keygen/sign/verify and watch the independently computed AIM2 image
land on the public key's image; tamper with a repetition block and watch the
signature fail. Run a real NTRU+ encapsulation and decapsulation, confirm the shared
secrets match, then corrupt the ciphertext and watch it fail closed. Drive the ring
reduction by hand.

## What Can Go Wrong

- **A tampered signature or ciphertext that still verifies.** This is the alarm
  state for the specific one-bit edits exercised here, and the e2e suite fails if
  those edits paint an alarm verdict. This is not a universal forgery-rejection
  guarantee; see the reported AIMer relation flaw above.
- **Transcribing the AIM affine layer wrong.** The affine layer is the easy
  transcription error in AIM, and a wrong one still produces plausible-looking hex.
  It is caught because the computed image has to equal the reference's public-key
  image; perturbing the triangular masks, the matrix order, the SHAKE seed, the pi
  constants, the reduction polynomial or the feed-forward XOR each break that
  equality.
- **Reducing the NTRU+ ring with the wrong sign.** `X^768 = X^384 - 1` has a minus
  sign that is easy to lose; both reduction terms are mutation-tested.
- **Reading the MPCitH view as more than it is.** The reduced transcript view shows
  33 repetitions of a 16-party simulation. It does **not** decode which party is
  hidden per repetition, and it does not imply the full soundness of the parameter
  set — see below.
- **WASM failing to load or a check being interrupted.** Both panes name the engine
  error. An interrupted check says `NOT CHECKED`; it cannot claim the signature or
  ciphertext was rejected. Editing a message while signing retires that pending
  result, and a new run clears the preceding run's displayed artifacts.

## Real-World Usage

KpqC is Korea's national post-quantum standardization effort, and AIMer and NTRU+ are
two of its four final algorithms — the other two, SMAUG-T and HAETAE, are exercised in
[Quantum Vault KpqC](https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/).
National suites like this one matter because they show standardization bodies making
*different* bets from NIST's while covering the same job categories: a signature whose
intended security relies on a symmetric primitive has a different assumption from a
lattice signature. Diversifying assumptions does not repair a flawed relation encoding;
the historical AIM2 signature here has the reported vulnerability described above.

## Honest Limitations

- **No hardness proof.** A successful verify says the proof system accepted; it is not
  evidence that AIM2 is one-way, nor that the NTRU problem is hard. A successful KEM
  round trip says the two sides agree, nothing more.
- **Less scrutiny than the FIPS picks.** These are newer schemes with less
  cross-implementation review than the NIST selections. Algebraic analysis of the
  original AIM prompted the AIM/AIM2 tweak, which is exactly the kind of history that
  is still accumulating here.
- **The MPCitH view is partial, and says so on screen.** The pane slices the signature
  into its real 33 × 176-byte per-repetition proof blocks at their true offsets, and
  proves those blocks are load-bearing by flipping a bit in one and watching the real
  verifier reject. It deliberately does **not** print which party is hidden in each
  repetition: that index comes from the verifier's Fiat–Shamir expansion of the
  phase-three commitment. The view stops at the sourced byte layout and does not
  reconstruct each party's MPC view.
- **The signature layout has a primary source.** The pinned reference's
  [signature and proof structs](https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/AIMer/Reference_Implementation/sign.h)
  and [AIMer-128f parameters](https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/AIMer/Reference_Implementation/params/params-aimer-128f.h)
  define a 16-byte salt, two 32-byte commitments, and 33 equal 176-byte blocks.
  Each block contains a 64-byte reveal path, a 32-byte missing commitment and five
  16-byte field elements. The total is `16 + 32 + 32 + 33 × 176 = 5888`.
  Neither divisibility alone nor rejection after a bit flip proves that layout.
- **Not constant-time, not production.** The browser WASM makes no timing guarantees
  and this lab makes no side-channel claims.
- **One parameter set each.** AIMer-128f and NTRU+768 only.

## How to Run Locally

```bash
npm install
npm run dev          # http://localhost:5173/crypto-lab-kpqc-pair/

npm test             # unit + KAT suite (Vitest)
npm run build        # typecheck, then production build to dist/
npm run preview      # serve the production build

npm run test:a11y    # axe/WCAG A+AA gate over the production build
npm run test:e2e     # claims gate: real crypto, tamper, negative claims
```

The Playwright projects build and serve the production bundle themselves on port
**4713**; `npm run test:a11y` and `npm run test:e2e` need no server running first.

## Related Demos

- [Quantum Vault KpqC](https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/)
  — the other two KpqC finalists, SMAUG-T and HAETAE. Pair with this lab for all four.
- [MPCitH Sign](https://systemslibrarian.github.io/crypto-lab-mpcith-sign/) — the
  general MPC-in-the-Head construction that AIMer instantiates.
- [NTRU Classic](https://systemslibrarian.github.io/crypto-lab-ntru-classic/) — the
  original NTRU line that NTRU+ descends from.
- [KEM Trap](https://systemslibrarian.github.io/crypto-lab-kem-trap/) — why a KEM must
  fail closed on a malformed ciphertext, which is the discipline NTRU+ mirrors here.

## Build & Verify

**37 tests, all green:**

| Suite | Count | What it proves |
| --- | --- | --- |
| Unit + KAT (`npm test`) | **15** in 3 files | Official KAT record 0 reproduced for both algorithms; AIM2 image equals the public key's; per-repetition blocks load-bearing; ring reduction, safe-integer coefficients, parameters, and engine-error classification |
| Claims gate (`npm run test:e2e`) | **20** | Both real round trips, tamper rejection, interrupted-engine refusal and retry, pending-message retirement, same-value no-op, mismatch rendering, hidden-panel integrity, and visible negative claims |
| Accessibility gate (`npm run test:a11y`) | **2** | 13 driven states each, at 1280px and 380px — 26 scanned states |

**KAT provenance.** `src/kat/fixtures.ts` pins record 0 of the KpqC reference
packages as shipped in `@killd21/kpqc` 0.2.0 (vendored at commit
`9886cfb5`): `vendor/AIMer/KAT/aimer-128f/PQCsignKAT_48.rsp` and
`vendor/NTRUplus/KAT/NTRU+768/PQCkemKAT_2336.rsp`. The seed
`061550…1FFA1` is the 48-byte value the shared `PQCgenKAT` generator draws for
record 0 from the standard entropy input `00 01 … 2F`, which is why one seed serves
both algorithms. `src/kat/kat.test.ts` does not compare transcriptions: it seeds the
WASM module's own NIST DRBG, calls the C `crypto_sign_keypair` / `crypto_sign` and
`crypto_kem_keypair` / `crypto_kem_enc` entry points directly, and digests the raw
output buffers with SHA-256 — so a pass means the shipped WASM reproduces the
upstream vector byte for byte.

**Student-accuracy review — November 24, 2026.** The original published build was
checked with delayed WASM loading and interrupted real verifier calls. It reported
an old signature as verified beside edited text, and reported both engine errors as
cryptographic rejection. The corrected claims suite drives these cases and also
checks that a failed ciphertext leaves no old recipient secret on screen.

Independent review read all 100 AIMer and 100 NTRU+ records from the pinned upstream
`.rsp` files: every signature verified, and every KEM ciphertext decapsulated to its
recorded secret. Python integer field arithmetic and SHAKE recomputed every stage
of 105 AIM2 examples, including zero S-box inputs. Twenty-three ring products
(including dense inputs and both reduction boundaries) agreed with independent
polynomial long division and the pinned C reference's NTT multiplication. The two
large-safe-integer regressions were checked with exact `BigInt` arithmetic. These
checks establish agreement for the exercised inputs, not cryptographic security.

**Historical mutation checks (INV-4).** Twenty-two deliberate mutations were applied and every
one made the owning test fail. Sixteen against the crypto paths — the AIM outer
S-box exponent, the S-box exponent lanes, the two triangular masks and the matrix
application order in the affine layer, the SHAKE128 affine seed, the GF(2^128)
reduction tail, a pi-derived constant, the affine vector and the feed-forward XOR;
the MPCitH repetition stride and salt width; and the NTRU+ ring's two reduction
signs, its modulus and its dimension. Six against the honesty surface — each of the
three on-screen negative claims hidden or softened, and the MPCitH caveat replaced
with the decoded-party claim this lab deliberately does not make. Each was restored
immediately. Those historical mutations were not rerun in the November 24 review.

Two of those found real gaps rather than confirming existing cover, which is the
point of running them: the ring suite phrased its expected coefficient as
`NTRUPLUS_Q - 1`, so a modulus mutation could not be detected until the parameters
were pinned as literals and cross-checked against the reference key width; and the
MPCitH view's original hidden-party output was assertable only for length and range,
so any derivation at all would have passed.

**Accessibility.** The gate is not "axe returned no violations". At every one of the
26 scanned states it also asserts axe's `incomplete` bucket is empty, walks every
text node arithmetically for composite-aware WCAG 1.4.3 contrast (including
`aria-hidden` content, which axe skips entirely), measures non-text contrast
(WCAG 1.4.11, which axe has no rule for) ratcheted against an
**empty** `e2e/nontext-baseline.ts`, and checks reflow at 380px, keyboard
reachability of scrolling regions, and that nothing focusable paints nothing. The one
finding the first full drive produced — the last tab button delineated by a 1.08:1
fill because it inherited no border — was fixed in `src/style.css` rather than
baselined.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
