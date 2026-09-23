/**
 * §4.1b/c/d cross-checks: every claim this lab makes on screen, verified
 * against the page's own real verifiers rather than against a fixture of what
 * the page was expected to print.
 *
 * These run against the production build (see `playwright.config.ts`), so the
 * WASM these tests drive is the WASM a visitor gets.
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('.')
})

// ── INV-1 / INV-2: the AIMer round trip and the computed image ──────────────

test('AIMer signs and verifies, and the computed AIM2 image equals the public key image', async ({
  page,
}) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')
  await expect(page.locator('#aimer-status')).toHaveAttribute('data-verdict', 'pass')

  // INV-2: this equality is the whole "knows a preimage" claim made computable.
  // The left side is this lab's own AIM2 evaluation in TypeScript; the right is
  // the image the reference WASM put in the public key. They are produced by
  // completely separate code paths, so an equal pair is a real cross-check.
  const computed = await page.locator('#aim-computed').innerText()
  const published = await page.locator('#aim-public').innerText()
  expect(computed).toBe(published)
  // Guard against the degenerate pass where both sides render empty.
  expect(computed).toMatch(/^[0-9a-f]{32}$/)

  // The transcript view slices the signature into its real per-repetition
  // proof blocks — 33 of them, one per MPC execution.
  await expect(page.locator('#aimer-parties [role="listitem"]')).toHaveCount(33)
  await expect(page.locator('#aimer-repetition-count')).toHaveText('33')
  await expect(page.locator('#aimer-party-count')).toHaveText('16')
  await expect(page.locator('#aimer-repetition-size')).toHaveText('176 B')
})

// §1.6: a reduced view must not imply soundness it does not have. The pane must
// say plainly that it does NOT decode which party is hidden, because the
// reference package ships WASM only and that expansion cannot be confirmed.
test('the transcript view disclaims the hidden-party index it does not decode', async ({ page }) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')

  const caveat = page.locator('#aimer-transcript-caveat')
  await expect(caveat).toBeVisible()
  await expect(caveat).toContainText('not decoded here')

  // The cells must be labelled as proof blocks, NOT as party indices — the
  // wording this lab used before it could back the claim up.
  const firstCell = page.locator('#aimer-parties [role="listitem"]').first()
  await expect(firstCell).toHaveAttribute('title', /proof bytes/)
  await expect(firstCell).not.toHaveAttribute('title', /remains hidden/)
})

// ── INV-3: both tamper rejection paths, against the page's real verifiers ────

test('a tampered AIMer signature is rejected by the real verifier', async ({ page }) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')

  await page.locator('#aimer-tamper').click()
  await expect(page.locator('#aimer-status')).toContainText('REJECTED')
  await expect(page.locator('#aimer-status')).toHaveAttribute('data-verdict', 'fail')
  // The rejection names where the bit was flipped, so the claim is specific.
  await expect(page.locator('#aimer-status')).toContainText('repetition')
  // §1.5: an accepted tamper is the alarm state and must never appear.
  await expect(page.locator('#panel-aimer [data-verdict="alarm"]')).toHaveCount(0)
})

test('a tampered NTRU+ ciphertext fails decapsulation, fail-closed', async ({ page }) => {
  await page.locator('#tab-ntruplus').click()
  await page.locator('#ntru-run').click()
  await expect(page.locator('#ntru-status')).toContainText('MATCH')

  await page.locator('#ntru-tamper').click()
  await expect(page.locator('#ntru-status')).toContainText('REJECTED')
  await expect(page.locator('#ntru-status')).toHaveAttribute('data-verdict', 'fail')
  await expect(page.locator('#panel-ntruplus [data-verdict="alarm"]')).toHaveCount(0)
})

// ── INV-1: the NTRU+ round trip ─────────────────────────────────────────────

test('NTRU+ encapsulation and decapsulation agree on the shared secret', async ({ page }) => {
  await page.locator('#tab-ntruplus').click()
  await page.locator('#ntru-run').click()
  await expect(page.locator('#ntru-status')).toContainText('MATCH')
  await expect(page.locator('#ntru-status')).toHaveAttribute('data-verdict', 'pass')

  const sender = await page.locator('#ntru-sender').innerText()
  const recipient = await page.locator('#ntru-recipient').innerText()
  expect(recipient).toBe(sender)
  // A 32-byte shared secret, fully printed — not a truncated display that could
  // match on its visible prefix alone.
  expect(sender).toMatch(/^[0-9a-f]{64}$/)
})

test('the ring view applies the real NTRU+768 trinomial relation', async ({ page }) => {
  await page.locator('#tab-ntruplus').click()
  // X^767 * X^1 = X^768, which reduces once to X^384 - 1.
  await expect(page.locator('#ring-equation')).toContainText('X^768')
  await expect(page.locator('#ring-equation')).toContainText('-1 + X^384')

  // X^700 * X^500 = X^1200 needs the reduction applied TWICE: X^1200 -> X^816
  // - X^432, then X^816 -> X^432 - X^48, leaving -X^48 once X^432 cancels.
  await page.locator('#ring-left').fill('700')
  await page.locator('#ring-right').fill('500')
  await page.locator('#ring-run').click()
  await expect(page.locator('#ring-equation')).toContainText('X^1200')
  await expect(page.locator('#ring-equation')).toContainText('-X^48')
  await expect(page.locator('#ring-equation')).toContainText('mod 3457')
})

// ── Stale-result retirement, and the same-value no-op ────────────────────────

test('editing the message retires a stale proof instead of leaving it on screen', async ({
  page,
}) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')
  await expect(page.locator('#aimer-results')).toBeVisible()

  await page.locator('#aimer-message').fill('a different message entirely')
  await expect(page.locator('#aimer-results')).toBeHidden()
  await expect(page.locator('#aimer-status')).toContainText('retired')
  // The tamper control must go dead with the proof it was going to tamper with.
  await expect(page.locator('#aimer-tamper')).toBeDisabled()
})

test('rewriting the message to the same value is a no-op, not a retirement', async ({ page }) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')
  const computedBefore = await page.locator('#aim-computed').innerText()

  const message = await page.locator('#aimer-message').inputValue()
  await page.locator('#aimer-message').fill(message)

  await expect(page.locator('#aimer-results')).toBeVisible()
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED')
  await expect(page.locator('#aimer-tamper')).toBeEnabled()
  // The standing proof is the SAME one, not silently recomputed.
  expect(await page.locator('#aim-computed').innerText()).toBe(computedBefore)
})

// ── Hidden panel integrity ──────────────────────────────────────────────────

test('exactly one panel is reachable and hidden panels never paint', async ({ page }) => {
  // All three panes render eagerly at load, so the hidden ones hold real
  // content at all times — `hidden` is the only thing keeping them off screen.
  for (const id of ['aimer', 'ntruplus', 'set']) {
    await page.locator(`#tab-${id}`).click()
    await expect(page.locator(`#tab-${id}`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1)

    const painted = await page.$$eval('[hidden]', (elements) =>
      elements
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}`),
    )
    expect(painted, `[hidden] must not paint while ${id} is active`).toEqual([])

    // A hidden pane must also be out of the tab order, or a keyboard reader
    // walks into controls that are not on screen.
    const reachable = await page.$$eval(
      '[role="tabpanel"][hidden] button, [role="tabpanel"][hidden] input, [role="tabpanel"][hidden] textarea',
      (elements) => elements.filter((element) => (element as HTMLElement).checkVisibility()).length,
    )
    expect(reachable, `no focusable control in a hidden pane while ${id} is active`).toBe(0)
  }
})

// ── INV-5: the negative claims, tied to successful fixtures ─────────────────
//
// The point of INV-5 is that the honest limitation stays on screen at the
// moment the lab is most persuasive — beside a green verdict, not tucked into a
// document nobody opens. Each of these asserts the success FIRST and then the
// standing caveat, so the caveat cannot be satisfied by a page that simply
// failed to run.

test('the AIMer success keeps its no-hardness-proof caveat on screen', async ({ page }) => {
  await page.locator('#aimer-run').click()
  await expect(page.locator('#aimer-status')).toHaveAttribute('data-verdict', 'pass')

  const claim = page.locator('#aimer-negative-claim')
  await expect(claim).toBeVisible()
  await expect(claim).toContainText('not a proof that AIM2 is one-way')
  await expect(claim).toContainText('not production crypto')
  // Nothing in the pane is failing: the caveat stands beside a clean run.
  await expect(page.locator('#panel-aimer .verdict-fail, #panel-aimer .verdict-alarm')).toHaveCount(0)
})

test('the NTRU+ success keeps its no-hardness-proof caveat on screen', async ({ page }) => {
  await page.locator('#tab-ntruplus').click()
  await page.locator('#ntru-run').click()
  await expect(page.locator('#ntru-status')).toHaveAttribute('data-verdict', 'pass')

  const claim = page.locator('#ntru-negative-claim')
  await expect(claim).toBeVisible()
  await expect(claim).toContainText('does not prove the NTRU problem is hard')
  await expect(claim).toContainText('less cross-implementation-scrutinized')
  await expect(page.locator('#panel-ntruplus .verdict-fail, #panel-ntruplus .verdict-alarm')).toHaveCount(0)
})

test('the family tree carries the scrutiny caveat beside all four algorithms', async ({ page }) => {
  await page.locator('#tab-set').click()
  await expect(page.locator('.family-node')).toHaveCount(4)

  const claim = page.locator('#set-negative-claim')
  await expect(claim).toBeVisible()
  await expect(claim).toContainText('less cross-implementation scrutiny than NIST')
  await expect(claim).toContainText('do not establish the underlying hardness assumptions')
})

// ── The KAT badges are claims too ───────────────────────────────────────────

test('both panes advertise the pinned KAT record the unit suite reproduces', async ({ page }) => {
  await expect(page.locator('[data-kat="aimer-128f-0"]')).toContainText('KAT #0 pinned')
  await page.locator('#tab-ntruplus').click()
  await expect(page.locator('[data-kat="ntruplus-768-0"]')).toContainText('KAT #0 pinned')
})
