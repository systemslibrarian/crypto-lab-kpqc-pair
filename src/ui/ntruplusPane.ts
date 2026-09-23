import { decapsulateNtruplus, runNtruplus, type NtruplusRun } from '../ntruplus/reference'
import {
  NTRUPLUS_N,
  NTRUPLUS_Q,
  NTRUPLUS_RING_LABEL,
  multiplyNtruplusRing,
  nonzeroTerms,
  polynomialFromTerms,
} from '../ntruplus/ring'
import { tamperByte, toHex } from '../shared/bytes'
import { errorMessage, requiredElement, setVerdict } from './shared'

function signedCoefficient(coefficient: number): number {
  return coefficient > NTRUPLUS_Q / 2 ? coefficient - NTRUPLUS_Q : coefficient
}

function formatTerm(coefficient: number, degree: number): string {
  const signed = signedCoefficient(coefficient)
  if (degree === 0) return String(signed)
  if (signed === 1) return degree === 1 ? 'X' : `X^${degree}`
  if (signed === -1) return degree === 1 ? '-X' : `-X^${degree}`
  return `${signed}${degree === 1 ? 'X' : `X^${degree}`}`
}

export function renderNtruplusPane(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">KEY ENCAPSULATION</p>
        <h2>Meet in the NTRU ring</h2>
        <p>The sender uses a public key to wrap a fresh 32-byte secret. The recipient uses the secret key to recover the same bytes; NTRU+'s re-encryption check rejects a malformed ciphertext before an application can treat it as valid.</p>
      </div>
      <span class="kat-badge" data-kat="ntruplus-768-0"><span aria-hidden="true">&#10003;</span> KAT #0 pinned</span>
    </div>

    <div class="control-strip">
      <div class="action-row">
        <button class="action primary" id="ntru-run" type="button">Encapsulate and decapsulate</button>
        <button class="action danger" id="ntru-tamper" type="button" disabled>Flip one ciphertext bit</button>
      </div>
      <div class="verdict verdict-neutral" id="ntru-status" role="status" aria-live="polite" data-verdict="neutral"></div>
    </div>

    <div id="ntru-results" hidden>
      <dl class="artifact-grid">
        <div><dt>Public key</dt><dd><code id="ntru-pk"></code><span>1,152 bytes</span></dd></div>
        <div><dt>Ciphertext</dt><dd><code id="ntru-ct"></code><span>1,152 bytes</span></dd></div>
        <div><dt>Sender secret</dt><dd><code id="ntru-sender"></code><span>32 bytes</span></dd></div>
        <div><dt>Recipient secret</dt><dd><code id="ntru-recipient"></code><span>32 bytes</span></dd></div>
      </dl>
      <div class="pipeline" role="list" aria-label="NTRU+ encapsulation stages">
        <div role="listitem"><span>01</span><strong>SOTP encode</strong><p>Bind the message to fresh coins as a short polynomial.</p></div>
        <div role="listitem"><span>02</span><strong>NTRU ring</strong><p>Multiply in the 768-dimensional quotient ring.</p></div>
        <div role="listitem"><span>03</span><strong>Re-encrypt</strong><p>Decapsulation recomputes the ciphertext and compares it.</p></div>
        <div role="listitem"><span>04</span><strong>Accept / reject</strong><p>Only a matching ciphertext releases the shared secret.</p></div>
      </div>
      <aside class="honesty-note" id="ntru-negative-claim">
        <strong>Matched, not proven hard.</strong>
        <p>The sender and recipient agree here, but a round trip does not prove the NTRU problem is hard. This reference WASM is newer and less cross-implementation-scrutinized than the NIST FIPS selections, is not guaranteed constant-time, and is not production crypto.</p>
      </aside>
    </div>

    <section class="ring-lab" aria-labelledby="ring-title">
      <div class="section-heading">
        <p class="eyebrow">THE DISCRETE OBJECT</p>
        <h3 id="ring-title">Watch a term wrap through the real ring</h3>
        <p><code>${NTRUPLUS_RING_LABEL}</code>. Choose monomial degrees; multiplication is performed across all ${NTRUPLUS_N} coefficients and then reduced by <code>X^768 = X^384 - 1</code>.</p>
      </div>
      <div class="ring-controls">
        <label for="ring-left">Left degree <input id="ring-left" type="number" min="0" max="767" step="1" value="767" /></label>
        <span aria-hidden="true">x</span>
        <label for="ring-right">Right degree <input id="ring-right" type="number" min="0" max="767" step="1" value="1" /></label>
        <button class="action secondary" id="ring-run" type="button">Multiply in Rq</button>
      </div>
      <div class="ring-equation" id="ring-equation" role="status" aria-live="polite"></div>
    </section>
  `

  const runButton = requiredElement<HTMLButtonElement>(root, '#ntru-run')
  const tamperButton = requiredElement<HTMLButtonElement>(root, '#ntru-tamper')
  const status = requiredElement<HTMLElement>(root, '#ntru-status')
  const results = requiredElement<HTMLElement>(root, '#ntru-results')
  let latestRun: NtruplusRun | null = null

  setVerdict(status, 'neutral', 'Ready. Keys and secrets stay in this browser session.')

  runButton.addEventListener('click', async () => {
    runButton.disabled = true
    tamperButton.disabled = true
    root.setAttribute('aria-busy', 'true')
    setVerdict(status, 'neutral', 'Running NTRU+768 keygen, encapsulation, and decapsulation in WebAssembly...')

    try {
      const run = await runNtruplus()
      requiredElement(root, '#ntru-pk').textContent = toHex(run.publicKey, 20)
      requiredElement(root, '#ntru-ct').textContent = toHex(run.ciphertext, 20)
      requiredElement(root, '#ntru-sender').textContent = toHex(run.senderSecret)
      requiredElement(root, '#ntru-recipient').textContent = toHex(run.recipientSecret)
      results.hidden = false
      latestRun = run
      tamperButton.disabled = false
      setVerdict(
        status,
        run.matched ? 'pass' : 'alarm',
        run.matched
          ? 'MATCH — decapsulation recovered the sender\'s exact 32-byte secret.'
          : 'ALARM — encapsulation and decapsulation produced different secrets.',
      )
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
    setVerdict(status, 'neutral', 'Decapsulating the one-bit-modified ciphertext...')
    const result = await decapsulateNtruplus(
      tamperByte(latestRun.ciphertext),
      latestRun.secretKey,
    )
    setVerdict(
      status,
      result.accepted ? 'alarm' : 'fail',
      result.accepted
        ? 'ALARM — a modified ciphertext reached the accepted path.'
        : 'REJECTED — the NTRU+ re-encryption check returned failure.',
    )
  })

  const leftInput = requiredElement<HTMLInputElement>(root, '#ring-left')
  const rightInput = requiredElement<HTMLInputElement>(root, '#ring-right')
  const ringOutput = requiredElement<HTMLElement>(root, '#ring-equation')

  const updateRing = (): void => {
    const leftDegree = Math.min(767, Math.max(0, Math.trunc(leftInput.valueAsNumber || 0)))
    const rightDegree = Math.min(767, Math.max(0, Math.trunc(rightInput.valueAsNumber || 0)))
    leftInput.value = String(leftDegree)
    rightInput.value = String(rightDegree)
    const product = multiplyNtruplusRing(
      polynomialFromTerms([{ coefficient: 1, degree: leftDegree }]),
      polynomialFromTerms([{ coefficient: 1, degree: rightDegree }]),
    )
    const terms = nonzeroTerms(product)
      .map(({ coefficient, degree }) => formatTerm(coefficient, degree))
      .join(' + ')
      .replaceAll('+ -', '- ')
    const rawDegree = leftDegree + rightDegree
    ringOutput.innerHTML = `<code>X^${leftDegree} x X^${rightDegree} = X^${rawDegree}</code><span aria-hidden="true">&rarr;</span><code>${terms || '0'} (mod ${NTRUPLUS_Q})</code>`
  }

  requiredElement<HTMLButtonElement>(root, '#ring-run').addEventListener('click', updateRing)
  updateRing()
}