import { expect, test } from '@playwright/test'

import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate'

// Both runs drive real WASM keygen/sign/verify and keygen/encaps/decaps at
// every state, which is why the project timeout is generous.

test('zero WCAG A/AA violations across desktop states', async ({ page }) => {
  const errors = watchPageErrors(page)
  await boot(page)
  await driveAllStates(page, 'desktop 1280px')
  expect(errors, errors.join('\n')).toEqual([])
  reportCollected()
})

test('zero WCAG A/AA violations across 380px states', async ({ page }) => {
  const errors = watchPageErrors(page)
  await page.setViewportSize(NARROW)
  await boot(page)
  await driveAllStates(page, 'mobile 380px')
  expect(errors, errors.join('\n')).toEqual([])
  // Called from the narrow run, which is the second of the two: by now every
  // state has been visited at both widths, so a baselined finding that never
  // appeared has genuinely stopped happening rather than merely not happened
  // yet.
  expectBaselineNotStale()
  reportCollected()
})
