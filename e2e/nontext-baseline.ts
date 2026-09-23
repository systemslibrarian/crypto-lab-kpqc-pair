/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY, AND THAT IS THE POINT — this is the terminal state of the
 * ratchet, not an unrun check. The gate's first full drive over this lab found
 * exactly one control boundary under 3:1, and it was fixed in `src/style.css`
 * rather than listed here: `.tab-btn` drew no border of its own and leaned on
 * the `.tab-list` wrapper for its edges, so the LAST tab — `#tab-set`, the only
 * one with no `border-right` divider to its name — was delineated by nothing
 * but its own `--surface` fill against `--bg`, which is 1.08:1. Its two
 * siblings passed on their dividers alone, which is precisely how a per-element
 * oracle earns its keep: the strip looked bounded, and one third of it was not.
 * The fix moves the boundary onto every `.tab-btn` (`--control-border`, 5.75:1
 * against the page) and collapses adjacent edges with a negative margin, so no
 * tab depends on its position in the strip for a visible edge.
 *
 * The shared top bar's `.cl-btn`, baselined in older labs at ~1.49:1, already
 * draws its edge from `--cl-ink` here and clears 3:1 — which is why the entries
 * much of this fleet carries are absent too.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this same
 * path and asserts nothing, which is how this file is regenerated; the capture
 * run after that fix printed zero findings at both 1280px and 380px.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
