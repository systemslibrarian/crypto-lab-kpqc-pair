import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate, ported from the fleet's honest gate and
 * adapted to this lab. Five rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. Reduced motion is set
 *     through `emulateMedia` and then ASSERTED from inside the page, so the
 *     rendering scanned is the one a reduced-motion reader actually gets —
 *     this lab's own `@media (prefers-reduced-motion: reduce)` block doing the
 *     cancelling, not an `addStyleTag` override that bypasses it.
 *
 *  2. NO PANEL IS FORCED VISIBLE FROM SCRIPT. Tabs are switched by clicking
 *     them. This lab renders all three panes eagerly at load and hides two with
 *     `hidden`, so a script that stripped `hidden` would put three tabpanels on
 *     screen at once — a rendering no reader can reach, and the one axe would
 *     then scan instead of the real one.
 *
 *  3. EVERY STATE IS DRIVEN AND SCANNED. Both real crypto round trips, both
 *     tamper rejections, the stale-result retirement, the ring reduction and
 *     the family tree each get their own scan, in {1280, 380}. A click that
 *     silently did nothing is caught because every step waits on a real DOM
 *     completion signal rather than a fixed timeout.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. The surfaces carrying
 *     this lab's meaning — every `.verdict-*` tone, the `.kat-badge`, the
 *     `.honesty-note` / `.scrutiny-note` asides and the shared top bar's
 *     `color-mix()` ink — are fills axe files under `incomplete` rather than
 *     judging.
 *
 *  5. REFLOW AND NON-TEXT CONTRAST HAVE NO AXE RULE AT ALL. `nontext.ts` and
 *     `expectNoHorizontalOverflow` are the only oracles that ever look at a
 *     control's boundary or at whether 33 transcript cells and a 768-term ring
 *     equation force the document sideways at 380px.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it. Transitions
 * also drain in waves rather than in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves — hence six consecutive quiet
 * frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * infinite animations are excluded rather than waited on, a wall-clock budget
 * inside the page gives up and proceeds, and Playwright's timeout is the
 * backstop.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * has that shape: `.panel` rides a fade whose keyframes start at `opacity: 0`,
 * and the reduced-motion block cancels it with `animation: none`, which
 * restores the static `opacity: 1`. This assertion is what makes that a
 * measurement rather than a reading.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from page creation.
 *
 * This lab loads two WASM modules on demand. A module that fails to
 * instantiate leaves its pane's results region EMPTY — and an empty region is
 * exactly what a scan reports as perfectly accessible. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero
 * is a `<header class="cl-hero">` — a second `<header>` at top level, which
 * would be a second banner but for its explicit `role="group"`. Asserting the
 * OUTCOME rather than the markup is what catches the day that role is dropped.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab declares `role="list"` on four containers that are not `<ul>`/`<ol>`
 * — the MPCitH transcript line, the NTRU+ pipeline, the family tree and the
 * AIM trace — because each is styled `list-style: none` or built from `<div>`s,
 * which is the declaration that makes Safari and VoiceOver DROP the implicit
 * role. An explicit `role="list"` is therefore the fix here rather than the
 * defect, so what is asserted is the SHAPE of that fix: an explicit role on a
 * `ul`/`ol` must be `list` (any other value orphans every `<li>` under it), and
 * no visible `role="list"` may be empty, because axe applies
 * `aria-required-children` to the explicit role and fails it the day a
 * container renders with no items.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('ul[role], ol[role]'))) {
      if (el.getAttribute('role') !== 'list') {
        out.push(`${el.tagName.toLowerCase()}[role=${el.getAttribute('role')}] is not role=list`);
      }
    }
    for (const el of Array.from(document.querySelectorAll('[role="list"]'))) {
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.querySelector('[role="listitem"], li') === null) {
        out.push(
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()} is a visible empty role=list`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; a visible empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all. This lab's long
 * values are the 33-cell MPCitH transcript line, truncated hex readouts, the
 * `Z_3457[X]/(X^768 - X^384 + 1)` ring label and a two-column family tree — so
 * the shapes at risk are an unwrapped `<code>` run and a grid item whose
 * automatic minimum size is the min-content of a long line. At 380px that is
 * precisely what this check exists to catch.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This matters here because the transcript line and the ring equation are the
 * two places in this lab most likely to reach for `overflow-x: auto` as the
 * answer to a reflow failure, and a scroller born without a keyboard route is
 * invisible to axe.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden` DO
 * remove an element from the tab order, so those are skipped rather than
 * flagged. This is the assertion that proves the two `hidden` tabpanels really
 * are out of the tab order — this lab renders all three panes eagerly, so two
 * panes' worth of buttons and inputs exist in the DOM at all times.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with full
 * opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * `[hidden]` must mean not painted.
 *
 * This lab leans on `hidden` twice over: for the two inactive tabpanels, and
 * for each pane's results region before a run. A stylesheet rule with a more
 * specific `display` than the UA's `[hidden]{display:none}` silently defeats
 * both — which would put a stale AIMer verdict, or a whole second pane, on
 * screen underneath the active one.
 */
export async function expectHiddenContract(page: Page, label: string): Promise<void> {
  const painted = await page.$$eval('[hidden]', (elements) =>
    elements
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}`)
  );
  expect(painted, `[hidden] elements must not paint in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run with
 * it set prints every finding as it happens and then fails at the end, so a
 * green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Called from
 * inside a `soft` wrapper it would sit AFTER that wrapper's
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard would return first and
 * `nontext.ts` would never execute at all. Calling it here means it runs at
 * every driven state, including `:hover`, and this repo's baseline was captured
 * by that live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(
        `NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`
      );
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically — which matters here because the surfaces carrying
 *    this lab's meaning are `color-mix()` fills axe cannot resolve: every
 *    verdict tone, the KAT badges, both honesty asides and the shared bar's
 *    ink. Everything else in that bucket is a real result axe simply could not
 *    finish — including `aria-prohibited-attr`, which is where an `aria-label`
 *    on a role-less element hides.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted — SC
 *    1.4.3 is about what a reader SEES, and this lab hides decorative verdict
 *    glyphs and the `=` / `→` comparison marks beside their own words.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  await expectHiddenContract(page, label);
  await assertListSemantics(page);

  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first.
  // Chained as `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs
  // those FOUR best-practice rules and NOT ONE WCAG RULE, while a green result
  // reads exactly like a full A/AA pass.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding a `<header class="cl-hero" role="group">` with an
  // `<aside class="cl-hero-why">`, two `<nav>`s, one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();

  const violations = [...wcag.violations, ...landmarks.violations].map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast` is
  // allowed to remain, and only because the arithmetic walk below judges those
  // ratios for real.
  const unexplainedIncomplete = [...wcag.incomplete, ...landmarks.incomplete]
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the ONLY
  // thing that ever measures it.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await expectNoNewNonTextFailures(page, label);
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

/**
 * Load the page with reduced motion actually in effect, and assert the content
 * every scan relies on is really on the page — including the lab's DEFAULTS,
 * which are never assumed.
 *
 * `test.use({ reducedMotion })` has silently done nothing on some Playwright
 * releases, so the emulation is applied imperatively BEFORE the navigation and
 * then *asserted* from inside the page.
 *
 * Dark is the only theme here: `index.html` pins `data-theme="dark"` before
 * first paint and overwrites any stored `light`, and the shared bar's toggle
 * was removed. Both of those are asserted rather than assumed.
 *
 * The defaults are asserted at length because all three panes render eagerly at
 * load: a renderer that threw would leave its panel empty, and an empty region
 * is exactly what a scan reports as perfectly accessible.
 */
export async function boot(page: Page): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Seeded as 'light' on purpose: index.html's anti-flash script must overwrite
  // it. If that script ever stops pinning dark, this boot fails on data-theme
  // rather than quietly scanning a theme nobody ships.
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('.');

  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ──────────────────────────────────────────────
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('tab')).toHaveCount(3);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly what a green axe run says nothing
  // about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // This lab ships NO theme toggle — not the shared bar's, which was removed,
  // and not a lab-local one. The shared CSS hides any lab toggle with
  // `display:none !important`, which would leave a dead-but-known element;
  // asserting the count at zero catches the day one is added anyway.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── The arrival state: AIMer active, the other two panes rendered but shut ─
  // Unlike a lazily-rendered lab, all three panes exist in the DOM from load.
  // They are asserted NON-empty (a renderer that threw is the failure this
  // catches) and hidden.
  await expect(page.locator('#tab-aimer')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-aimer')).toBeVisible();
  for (const id of ['ntruplus', 'set']) {
    await expect(page.locator(`#panel-${id}`)).toBeHidden();
    await expect(page.locator(`#panel-${id}`)).not.toBeEmpty();
  }

  // ── Every shipped control default ─────────────────────────────────────────
  // Neither pane has run yet, so both results regions ship hidden and both
  // tamper buttons ship disabled — a tamper control that is live before there
  // is anything to tamper with would be operating on nothing.
  await expect(page.locator('#aimer-results')).toBeHidden();
  await expect(page.locator('#aimer-tamper')).toBeDisabled();
  await expect(page.locator('#aimer-message')).toHaveValue(
    'National suites can make different hardness bets.'
  );
  await expect(page.locator('#ntru-results')).toBeHidden();
  await expect(page.locator('#ntru-tamper')).toBeDisabled();
  await expect(page.locator('#ring-left')).toHaveValue('767');
  await expect(page.locator('#ring-right')).toHaveValue('1');

  await settle(page);
  await expectNotBlank(page, 'first paint');
}

/** Switch to a tab by clicking it, and prove the switch happened. */
async function openTab(page: Page, id: string, panelId: string): Promise<void> {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#tab-${id}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(panelId)).toBeVisible();
  await expect(page.locator(panelId)).not.toBeEmpty();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Four things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: AIMer
 *    active and un-run, both results regions shut, both tamper buttons dead.
 *
 *  - BOTH REAL CRYPTO RUNS ARE EXERCISED, not stubbed. Each click loads a WASM
 *    module and performs a genuine keygen/sign/verify or keygen/encaps/decaps,
 *    so these are the slowest states in the gate and every wait is on a real
 *    completion signal rather than a timeout.
 *
 *  - EVERY REJECTION STATE. Both tamper paths paint a sticky red verdict, and
 *    the stale-result retirement paints a neutral one while tearing the results
 *    region back down. None of these is reachable without driving it on
 *    purpose, and a red verdict is a different set of fills from a green one.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `click()` resolves, so it is the state a
 *    reader occupies the instant after pressing a button — and `.action:hover`
 *    and `.tab-btn:hover` both repaint their fill. It is scanned explicitly.
 */
export async function driveAllStates(page: Page, viewport: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${viewport} / ${s}`);

  await scanAt('arrival: AIMer active and un-run, both panes shut, tamper disabled');

  // ── The shared skip link, focused ─────────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── AIMer: the real sign/verify round trip ────────────────────────────────
  await page.locator('#aimer-run').click();
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED');
  await expect(page.locator('#aimer-status')).toHaveAttribute('data-verdict', 'pass');
  // INV-2 on screen: the independently computed image equals the published one.
  await expect(page.locator('#aim-computed')).toHaveText(
    await page.locator('#aim-public').innerText()
  );
  await expect(page.locator('#aimer-parties [role="listitem"]')).toHaveCount(33);
  await expect(page.locator('#aimer-negative-claim')).toBeVisible();
  await scanAt('AIMer: signed and verified, 33 repetition blocks, image match');

  // The button is still hovered from the click above.
  await scanAt('AIMer: the run button in its just-clicked, still-hovered state');

  // ── AIMer: the tamper rejection ───────────────────────────────────────────
  await page.locator('#aimer-tamper').hover();
  await scanAt('AIMer: the danger button hovered');
  await page.locator('#aimer-tamper').click();
  await expect(page.locator('#aimer-status')).toContainText('REJECTED');
  await expect(page.locator('#aimer-status')).toHaveAttribute('data-verdict', 'fail');
  await scanAt('AIMer: one bit flipped inside a repetition block, correctly rejected');

  // ── AIMer: same-value no-op, then stale-result retirement ─────────────────
  await page.locator('#aimer-run').click();
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED');
  const message = await page.locator('#aimer-message').inputValue();
  // Refilling with the SAME text must not retire a valid proof.
  await page.locator('#aimer-message').fill(message);
  await expect(page.locator('#aimer-results')).toBeVisible();
  await expect(page.locator('#aimer-status')).toContainText('VERIFIED');
  await scanAt('AIMer: message rewritten to the same value, proof still standing');

  await page.locator('#aimer-message').fill(`${message} changed`);
  await expect(page.locator('#aimer-results')).toBeHidden();
  await expect(page.locator('#aimer-status')).toContainText('retired');
  await scanAt('AIMer: message changed, stale proof retired and results torn down');

  // ── NTRU+ ─────────────────────────────────────────────────────────────────
  await openTab(page, 'ntruplus', '#panel-ntruplus');
  await scanAt('NTRU+: arrival, un-run');

  await page.locator('#ntru-run').click();
  await expect(page.locator('#ntru-status')).toContainText('MATCH');
  await expect(page.locator('#ntru-status')).toHaveAttribute('data-verdict', 'pass');
  await expect(page.locator('#ntru-sender')).toHaveText(
    await page.locator('#ntru-recipient').innerText()
  );
  await expect(page.locator('#ntru-negative-claim')).toBeVisible();
  await scanAt('NTRU+: encapsulated and decapsulated, secrets equal');

  await page.locator('#ntru-tamper').click();
  await expect(page.locator('#ntru-status')).toContainText('REJECTED');
  await expect(page.locator('#ntru-status')).toHaveAttribute('data-verdict', 'fail');
  await scanAt('NTRU+: malformed ciphertext, FO implicit reject, fail closed');

  // ── The ring lab, including the repeated-reduction case ───────────────────
  await page.locator('#ring-left').fill('700');
  await page.locator('#ring-right').fill('500');
  await page.locator('#ring-run').click();
  await expect(page.locator('#ring-equation')).toContainText('X^1200');
  await expect(page.locator('#ring-equation')).toContainText('-X^48');
  await scanAt('NTRU+: X^700 * X^500 reduced twice through the trinomial');

  // ── The Set ───────────────────────────────────────────────────────────────
  await openTab(page, 'set', '#panel-set');
  await expect(page.locator('.family-node')).toHaveCount(4);
  await expect(page.locator('#set-negative-claim')).toBeVisible();
  await scanAt('The Set: four KpqC algorithms on the family tree');
}
