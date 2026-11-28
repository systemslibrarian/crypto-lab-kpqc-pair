import { AIMER_128F_WASM_SHA256 } from '../kat/fixtures'
import { evaluateAim2, inspectMpcithTranscript, repetitionByteOffset } from '../aimer/aim'
import { signWithAimer, verifyAimer, type AimerRun } from '../aimer/reference'
import { bytesEqual, tamperByte, toHex } from '../shared/bytes'
import { errorMessage, formatByteCount, requiredElement, setVerdict } from './shared'

export function renderAimerPane(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">HEADLINE MECHANISM</p>
        <h2>A signature from a symmetric one-way function</h2>
        <p>AIMer does not hide a lattice equation inside its signature. Its public key contains an AIM2 image. This walkthrough evaluates AIM2 on the honest signer's secret preimage and checks its signature; an accepted historical AIM2 proof need not establish knowledge of a preimage.</p>
      </div>
      <span class="kat-badge" data-kat="aimer-128f-0"><span aria-hidden="true">&#10003;</span> KAT #0 pinned</span>
    </div>

    <aside class="honesty-note" id="aimer-research-warning" aria-label="AIMer research status">
      <strong>Historical AIM2 — reported forgery vulnerability.</strong>
      <p><a href="https://eprint.iacr.org/2026/2235">ePrint 2026/2235 (September 28, 2026)</a> reports public-key-only forgeries against AIMer v2.0 accepted by unmodified reference verifiers. This is a demonstrated result reported in a preprint; it has not yet been independently reproduced against this lab's shipped WASM. Honest KATs and one-bit tamper rejection do not establish signature security. AIM3-based v3.0 excludes this zero-branch attack, without a comprehensive security assessment here.</p>
      <p><strong>Research update — November 15, 2026.</strong> <a href="https://eprint.iacr.org/2026/903">ePrint 2026/903 (Biryukov, García Fernández, and Udovenko; EUROCRYPT 2026)</a> cryptanalyses the AIM2 primitive of AIMer v2.1 itself, not the proof relation: a new algebraic elimination framework recovers an AIM2-I key (the 128-bit-security instance, the level this lab's AIMer-128f reference uses) in about 2<sup>103.66</sup> encryptions against a claimed 128-bit level, and is practical only in misuse settings (one secret key reused under different IVs, or related keys). That is a reported loss of security margin, not a practical break of a single honestly generated AIMer-128f key; it does not change what this pane shows, and KAT agreement was never evidence that AIM2 is one-way.</p>
    </aside>

    <details class="transcript-caveat" id="aimer-source">
      <summary>Which AIMer implementation does this lab run?</summary>
      <p>The browser loads AIMer-128f from the npm package <code>@killd21/kpqc@0.2.0</code>.
      Its WebAssembly binary is 127,927 bytes. Its SHA-256 digest is <code>${AIMER_128F_WASM_SHA256}</code>.</p>
      <p>The C sources in the <a href="https://github.com/killd21/kpqc-js/tree/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/AIMer">tagged vendor directory</a>
      match the archive identified by the <a href="https://aimer-signature.org/docs/AIMer_Specification_v260130.pdf">January 30, 2026 specification</a>.
      The prebuilt binary in that Git tag has a different digest. Use the npm digest above to identify the bytes running here.</p>
    </details>

    <div class="control-strip">
      <label for="aimer-message">Message to sign</label>
      <textarea id="aimer-message" rows="3">National suites can make different hardness bets.</textarea>
      <div class="action-row">
        <button class="action primary" id="aimer-run" type="button">Generate proof and verify</button>
        <button class="action danger" id="aimer-tamper" type="button" disabled>Flip one transcript bit</button>
      </div>
      <div class="verdict verdict-neutral" id="aimer-status" role="status" aria-live="polite" data-verdict="neutral"></div>
    </div>

    <div id="aimer-results" hidden>
      <section class="mechanism" aria-labelledby="aim-forward-title">
        <div class="section-heading">
          <p class="eyebrow">COMPUTED FORWARD</p>
          <h3 id="aim-forward-title">The AIM2 image, stage by stage</h3>
        </div>
        <ol class="trace-grid" role="list">
          <li class="trace-step"><span class="step-number">01</span><div><strong>Preimage + constants</strong><p id="aim-input"></p></div></li>
          <li class="trace-step"><span class="step-number">02</span><div><strong>Two inverse-Mersenne power maps</strong><p id="aim-sboxes"></p></div></li>
          <li class="trace-step"><span class="step-number">03</span><div><strong>SHAKE128-derived affine layers</strong><p id="aim-affine"></p></div></li>
          <li class="trace-step"><span class="step-number">04</span><div><strong>Combine, x^7, feed forward</strong><p id="aim-output"></p></div></li>
        </ol>
        <div class="compare-row">
          <div><span>Computed AIM2 image</span><code id="aim-computed"></code></div>
          <span class="compare-mark" id="aim-compare" aria-hidden="true">=</span>
          <div><span>Image in public key</span><code id="aim-public"></code></div>
        </div>
      </section>

      <section class="mechanism" aria-labelledby="mpc-title">
        <div class="section-heading">
          <p class="eyebrow signal">FIAT-SHAMIR TRANSCRIPT</p>
          <h3 id="mpc-title">33 MPC executions become one signature</h3>
          <p>Each repetition simulates 16 parties and contributes one equal-width proof block. Hashing the commitments, message, and public AIM2 image selects one hidden party per repetition; the verifier rebuilds every revealed view and checks both commitment hashes.</p>
        </div>
        <div class="transcript-line" id="aimer-parties" role="list" aria-label="Per-repetition proof blocks in this signature"></div>
        <p class="transcript-caveat" id="aimer-transcript-caveat">Each cell is one repetition's real proof block, sliced at the offset defined by the <a href="https://github.com/killd21/kpqc-js/blob/9886cfb59fac204fdf2947bfab5ac4964c7f3fea/vendor/AIMer/Reference_Implementation/sign.h">pinned reference source</a>. <strong>Which party is hidden in a repetition is not decoded here</strong> — the verifier derives that index from its Fiat-Shamir expansion of h2. This is a view of the signature layout, not a reconstruction of every MPC view. The button tests a one-bit edit in repetition 17; the reference tests also exercise other blocks.</p>
        <dl class="metrics">
          <div><dt>Parties</dt><dd id="aimer-party-count"></dd></div>
          <div><dt>Repetitions</dt><dd id="aimer-repetition-count"></dd></div>
          <div><dt>Bytes per repetition</dt><dd id="aimer-repetition-size"></dd></div>
          <div><dt>Signature</dt><dd id="aimer-signature-size"></dd></div>
          <div><dt>h2</dt><dd><code id="aimer-h2"></code></dd></div>
        </dl>
      </section>

      <aside class="honesty-note" id="aimer-negative-claim">
        <strong>Acceptance does not prove security.</strong>
        <p>Even when the real verifier accepts a signature, acceptance does not establish knowledge of a valid preimage in this historical relation. A successful check is not a proof that AIM2 is one-way. See the reported public-key-only forgery vulnerability above. The browser WASM is not guaranteed constant-time and is not production crypto.</p>
      </aside>
    </div>
  `

  const messageInput = requiredElement<HTMLTextAreaElement>(root, '#aimer-message')
  const runButton = requiredElement<HTMLButtonElement>(root, '#aimer-run')
  const tamperButton = requiredElement<HTMLButtonElement>(root, '#aimer-tamper')
  const status = requiredElement<HTMLElement>(root, '#aimer-status')
  const results = requiredElement<HTMLElement>(root, '#aimer-results')
  let latestRun: AimerRun | null = null
  let signedMessage = messageInput.value
  let currentMessage: string | null = null
  let operation = 0

  setVerdict(status, 'neutral', 'Ready. The reference WASM loads only when you run it.')

  messageInput.addEventListener('input', () => {
    if (currentMessage === null || messageInput.value === currentMessage) return
    operation += 1
    currentMessage = null
    latestRun = null
    results.hidden = true
    tamperButton.disabled = true
    runButton.disabled = false
    root.removeAttribute('aria-busy')
    setVerdict(status, 'neutral', 'Previous proof retired because the message changed.')
  })

  runButton.addEventListener('click', async () => {
    const request = ++operation
    const messageText = messageInput.value
    currentMessage = messageText
    latestRun = null
    results.hidden = true
    runButton.disabled = true
    tamperButton.disabled = true
    root.setAttribute('aria-busy', 'true')
    setVerdict(status, 'neutral', 'Running AIMer-128f keygen, sign, and verify in WebAssembly...')

    try {
      const message = new TextEncoder().encode(messageText)
      const run = await signWithAimer(message)
      if (request !== operation) return
      const trace = evaluateAim2(
        run.secretKey.subarray(0, 16),
        run.publicKey.subarray(0, 16),
      )
      const publicImage = run.publicKey.subarray(16, 32)
      const imageMatches = bytesEqual(trace.output, publicImage)
      const transcript = inspectMpcithTranscript(run.signature)

      requiredElement(root, '#aim-input').textContent =
        `x = ${toHex(trace.input)}; two fixed constants are XORed into parallel lanes.`
      requiredElement(root, '#aim-sboxes').textContent =
        `S1 = ${toHex(trace.sboxOutputs[0], 8)}; S2 = ${toHex(trace.sboxOutputs[1], 8)}`
      requiredElement(root, '#aim-affine').textContent =
        `A1(S1) = ${toHex(trace.affineOutputs[0], 8)}; A2(S2) = ${toHex(trace.affineOutputs[1], 8)}`
      requiredElement(root, '#aim-output').textContent =
        `combined = ${toHex(trace.combined, 8)}; output = ${toHex(trace.output)}`
      requiredElement(root, '#aim-computed').textContent = toHex(trace.output)
      requiredElement(root, '#aim-public').textContent = toHex(publicImage)
      requiredElement(root, '#aim-compare').textContent = imageMatches ? '=' : '≠'
      requiredElement(root, '#aimer-party-count').textContent = String(transcript.parties)
      requiredElement(root, '#aimer-repetition-count').textContent = String(transcript.repetitions.length)
      requiredElement(root, '#aimer-repetition-size').textContent = `${transcript.repetitionBytes} B`
      requiredElement(root, '#aimer-signature-size').textContent = formatByteCount(run.signature.length)
      requiredElement(root, '#aimer-h2').textContent = toHex(transcript.phaseThreeCommitment, 12)

      const partyLine = requiredElement(root, '#aimer-parties')
      partyLine.replaceChildren(
        ...transcript.repetitions.map((block, repetition) => {
          const cell = document.createElement('span')
          cell.setAttribute('role', 'listitem')
          cell.title =
            `Repetition ${repetition + 1} of ${transcript.repetitions.length}: ` +
            `${transcript.repetitionBytes} proof bytes starting ${toHex(block, 4)}`
          cell.textContent = String(repetition + 1)
          return cell
        }),
      )

      latestRun = run
      signedMessage = messageText
      results.hidden = false
      tamperButton.disabled = false
      if (run.verified && imageMatches) {
        setVerdict(status, 'pass', 'VERIFIED — the proof accepts and computed AIM2(x, IV) equals the public image.')
      } else {
        setVerdict(status, 'alarm', 'ALARM — verification or the independent AIM2 forward check disagreed.')
      }
    } catch (error) {
      if (request !== operation) return
      latestRun = null
      currentMessage = null
      results.hidden = true
      setVerdict(status, 'fail', `Reference engine unavailable — ${errorMessage(error)}`)
    } finally {
      if (request === operation) {
        runButton.disabled = false
        root.removeAttribute('aria-busy')
      }
    }
  })

  tamperButton.addEventListener('click', async () => {
    if (!latestRun) return
    const request = ++operation
    const run = latestRun
    tamperButton.disabled = true
    runButton.disabled = true
    root.setAttribute('aria-busy', 'true')
    setVerdict(status, 'neutral', 'Verifying the one-bit-modified transcript...')
    // Inside repetition 17's proof block, not the header: this is the claim the
    // transcript view makes on screen, so it is the byte the button flips.
    const repetition = 16
    const message = new TextEncoder().encode(signedMessage)
    try {
      const accepted = await verifyAimer(
        message,
        tamperByte(run.signature, repetitionByteOffset(repetition)),
        run.publicKey,
      )
      if (request !== operation) return
      setVerdict(
        status,
        accepted ? 'alarm' : 'fail',
        accepted
          ? 'ALARM — a modified transcript was accepted.'
          : `REJECTED — flipping one bit inside repetition ${repetition + 1}'s proof block invalidated the real AIMer proof. The trace below describes the original key and signature.`,
      )
    } catch (error) {
      if (request !== operation) return
      setVerdict(status, 'fail', `NOT CHECKED — reference engine error: ${errorMessage(error)}`)
      tamperButton.disabled = false
    } finally {
      if (request === operation) {
        runButton.disabled = false
        root.removeAttribute('aria-busy')
      }
    }
  })
}
