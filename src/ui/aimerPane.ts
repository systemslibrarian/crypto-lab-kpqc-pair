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
        <p>AIMer does not hide a lattice equation inside its signature. Its public key contains an AIM2 image; the signer proves, through many MPC simulations, that it knows the secret preimage that produced that image.</p>
      </div>
      <span class="kat-badge" data-kat="aimer-128f-0"><span aria-hidden="true">&#10003;</span> KAT #0 pinned</span>
    </div>

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
          <span class="compare-mark" aria-hidden="true">=</span>
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
        <p class="transcript-caveat" id="aimer-transcript-caveat">Each cell is one repetition's real proof block, sliced at its true offset in this signature. <strong>Which party is hidden in a repetition is not decoded here</strong> — that index comes from the verifier's Fiat-Shamir expansion of h2, and the reference package ships WASM binaries with no source to confirm the expansion against. What is measured instead: flip a bit in any one block and the real verifier rejects.</p>
        <dl class="metrics">
          <div><dt>Parties</dt><dd id="aimer-party-count"></dd></div>
          <div><dt>Repetitions</dt><dd id="aimer-repetition-count"></dd></div>
          <div><dt>Bytes per repetition</dt><dd id="aimer-repetition-size"></dd></div>
          <div><dt>Signature</dt><dd id="aimer-signature-size"></dd></div>
          <div><dt>h2</dt><dd><code id="aimer-h2"></code></dd></div>
        </dl>
      </section>

      <aside class="honesty-note" id="aimer-negative-claim">
        <strong>Accepted, not proven hard.</strong>
        <p>The real verifier accepts this proof, but that success is not a proof that AIM2 is one-way or that this newer scheme has received FIPS-level scrutiny. The browser WASM is not guaranteed constant-time and is not production crypto.</p>
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

  setVerdict(status, 'neutral', 'Ready. The reference WASM loads only when you run it.')

  messageInput.addEventListener('input', () => {
    if (!latestRun || messageInput.value === signedMessage) return
    latestRun = null
    results.hidden = true
    tamperButton.disabled = true
    setVerdict(status, 'neutral', 'Previous proof retired because the message changed.')
  })

  runButton.addEventListener('click', async () => {
    runButton.disabled = true
    tamperButton.disabled = true
    root.setAttribute('aria-busy', 'true')
    setVerdict(status, 'neutral', 'Running AIMer-128f keygen, sign, and verify in WebAssembly...')

    try {
      const message = new TextEncoder().encode(messageInput.value)
      const run = await signWithAimer(message)
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
      signedMessage = messageInput.value
      results.hidden = false
      tamperButton.disabled = false
      if (run.verified && imageMatches) {
        setVerdict(status, 'pass', 'VERIFIED — the proof accepts and computed AIM2(x, IV) equals the public image.')
      } else {
        setVerdict(status, 'alarm', 'ALARM — verification or the independent AIM2 forward check disagreed.')
      }
    } catch (error) {
      latestRun = null
      results.hidden = true
      setVerdict(status, 'fail', `Reference engine unavailable — ${errorMessage(error)}`)
    } finally {
      runButton.disabled = false
      root.removeAttribute('aria-busy')
    }
  })

  tamperButton.addEventListener('click', async () => {
    if (!latestRun) return
    tamperButton.disabled = true
    setVerdict(status, 'neutral', 'Verifying the one-bit-modified transcript...')
    // Inside repetition 17's proof block, not the header: this is the claim the
    // transcript view makes on screen, so it is the byte the button flips.
    const repetition = 16
    const message = new TextEncoder().encode(signedMessage)
    const accepted = await verifyAimer(
      message,
      tamperByte(latestRun.signature, repetitionByteOffset(repetition)),
      latestRun.publicKey,
    )
    setVerdict(
      status,
      accepted ? 'alarm' : 'fail',
      accepted
        ? 'ALARM — a modified transcript was accepted.'
        : `REJECTED — flipping one bit inside repetition ${repetition + 1}'s proof block invalidated the real AIMer proof.`,
    )
  })
}