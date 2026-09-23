export type VerdictTone = 'neutral' | 'pass' | 'fail' | 'alarm'

export function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing required element: ${selector}`)
  return element
}

export function setVerdict(
  element: HTMLElement,
  tone: VerdictTone,
  message: string,
): void {
  element.className = `verdict verdict-${tone}`
  element.dataset.verdict = tone
  element.replaceChildren()

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.classList.add('verdict-icon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2.25')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute(
    'd',
    tone === 'pass'
      ? 'M20 6 9 17l-5-5'
      : tone === 'neutral'
        ? 'M12 8v4m0 4h.01M4.9 19h14.2L12 5 4.9 19Z'
        : 'M18 6 6 18M6 6l12 12',
  )
  icon.append(path)

  const text = document.createElement('span')
  text.textContent = message
  element.append(icon, text)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export function formatByteCount(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`
}