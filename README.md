# KpqC Pair

**AIMer · NTRU+ · KpqC** — the two Korean KpqC algorithms the Quantum Vault lab left
out: a signature whose hardness rests on a symmetric one-way function, and a KEM from
the older NTRU line. Together with
[Quantum Vault KpqC](https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/)
this completes the set of four.

---

## What It Is

Two real post-quantum algorithms from Korea's KpqC competition, run in the browser
against their reference implementations:

- **AIMer-128f** — an MPC-in-the-Head signature. The public key holds an image of the
  **AIM2** symmetric one-way function; signing is a Fiat–Shamir transform over a
  zero-knowledge proof that the signer knows a preimage. Its security rests on a
  symmetric primitive rather than on structured number theory — that contrast with
  the lattice KEM beside it is the whole lesson.
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
  public key**, and they must be equal (this is the "knows a preimage" claim made
  computable rather than asserted);
- the hand-rolled **ring's parameters are checked against the reference's own key
  width** — a coefficient mod 3457 needs 12 bits, so 768 coefficients pack to exactly
  the 1152 bytes the WASM emits.

**Security model:** everything is client-side; no network backend, no key ever
leaves the page. **This is not production crypto.** It is a teaching demo, the WASM
is not guaranteed constant-time, and these schemes are newer and less
cross-implementation-scrutinized than the NIST FIPS selections. See
[Honest Limitations](#honest-limitations).

## Exhibits

1. **NTRU+ — Meet in the NTRU ring.** Encapsulate to a freshly generated public key,
   show the ciphertext, decapsulate, and confirm the sender's and recipient's 32-byte
   secrets are identical. A one-bit change to the ciphertext is rejected by the real
   decapsulation path. Below it, a ring lab multiplies two monomials across all 768
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
  problem — AIMer's hardness assumption is a symmetric one-way function, and the
  proof machinery is MPC-in-the-Head rather than a lattice identity.
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
  state, and it is asserted never to occur — the e2e suite fails if any pane ever
  paints an alarm verdict.
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
- **WASM failing to load.** Both panes degrade to an explicit failure verdict naming
  the error. They never fabricate a result.

## Real-World Usage

KpqC is Korea's national post-quantum standardization effort, and AIMer and NTRU+ are
two of its four final algorithms — the other two, SMAUG-T and HAETAE, are exercised in
[Quantum Vault KpqC](https://systemslibrarian.github.io/crypto-lab-quantum-vault-kpqc/).
National suites like this one matter because they show standardization bodies making
*different* bets from NIST's while covering the same job categories: a signature whose
security reduces to a symmetric primitive is a genuinely different risk profile from a
lattice signature, and a portfolio that contains both is harder to break all at once.

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
  phase-three commitment, and `@killd21/kpqc` ships compiled WASM with no reference
  source to confirm an expansion against. Printing a plausible index would have been
  fabrication, so the pane reports the structure it can prove and names the gap.
- **The signature layout is derived, not documented.** That the 5888 bytes divide as
  a 16-byte salt, two 32-byte commitments and 33 equal 176-byte blocks is arithmetic
  (`16 + 32 + 32 + 33 × 176 = 5888`, the only clean split) corroborated by the
  verifier rejecting a flip inside any block — not a quotation from a specification.
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
**4650**; `npm run test:a11y` and `npm run test:e2e` need no server running first.

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

**25 tests, all green:**

| Suite | Count | What it proves |
| --- | --- | --- |
| Unit + KAT (`npm test`) | **10** in 3 files | Official KAT record 0 reproduced for both algorithms; AIM2 image equals the public key's; per-repetition blocks load-bearing; ring reduction and parameters |
| Claims gate (`npm run test:e2e`) | **13** | Both real round trips, both tamper rejections, stale-result retirement, same-value no-op, hidden-panel integrity, the visible negative claims |
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

**Mutation-tested (INV-4).** Twenty-two deliberate mutations were applied and every
one made the owning test fail. Sixteen against the crypto paths — the AIM outer
S-box exponent, the S-box exponent lanes, the two triangular masks and the matrix
application order in the affine layer, the SHAKE128 affine seed, the GF(2^128)
reduction tail, a pi-derived constant, the affine vector and the feed-forward XOR;
the MPCitH repetition stride and salt width; and the NTRU+ ring's two reduction
signs, its modulus and its dimension. Six against the honesty surface — each of the
three on-screen negative claims hidden or softened, and the MPCitH caveat replaced
with the decoded-party claim this lab deliberately does not make. Each was restored
immediately.

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
