import './style.css'

import { renderAimerPane } from './ui/aimerPane'
import { renderNtruplusPane } from './ui/ntruplusPane'
import { renderSetPane } from './ui/setPane'

type Pane = 'ntruplus' | 'aimer' | 'set'

const renderers: Record<Pane, (root: HTMLElement) => void> = {
  ntruplus: renderNtruplusPane,
  aimer: renderAimerPane,
  set: renderSetPane,
}

for (const pane of Object.keys(renderers) as Pane[]) {
  const panel = document.querySelector<HTMLElement>(`#panel-${pane}`)
  if (!panel) throw new Error(`Missing panel ${pane}`)
  renderers[pane](panel)
}

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'))

function selectPane(pane: Pane, focus = false): void {
  for (const tab of tabs) {
    const selected = tab.dataset.panel === pane
    tab.classList.toggle('active', selected)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    const panel = document.querySelector<HTMLElement>(`#panel-${tab.dataset.panel}`)
    if (panel) panel.hidden = !selected
    if (selected && focus) tab.focus()
  }
  history.replaceState(null, '', `#${pane}`)
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectPane(tab.dataset.panel as Pane))
  tab.addEventListener('keydown', (event) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    selectPane(tabs[nextIndex]!.dataset.panel as Pane, true)
  })
})

const requestedPane = location.hash.slice(1) as Pane
selectPane(requestedPane in renderers ? requestedPane : 'aimer')

window.addEventListener('hashchange', () => {
  const pane = location.hash.slice(1) as Pane
  if (pane in renderers) selectPane(pane)
})