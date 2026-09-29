import { useEffect, useState } from 'react'
import { listCables } from '../cable-catalog/api'
import type { CableSpecification } from '../cable-catalog/model'
import { calculate, hasScenarioContent, newScenario, type Scenario } from './model'
import { parseScenario, storageKey } from './storage'

export function useOpticalBudget() {
  const [initial] = useState(() => {
    try { const raw = localStorage.getItem(storageKey); return { scenario: raw ? parseScenario(raw) : newScenario(), error: '' } }
    catch { return { scenario: newScenario(), error: 'Uložený výpočet se nepodařilo načíst. Automatické ukládání je pozastavené, aby se původní data nepřepsala.' } }
  })
  const [scenario, setScenario] = useState<Scenario>(initial.scenario)
  const [storageError, setStorageError] = useState(initial.error)
  const [storageEnabled, setStorageEnabled] = useState(!initial.error)
  const [cables, setCables] = useState<CableSpecification[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!storageEnabled) return
    // The status reflects an external storage operation, not derived form state.
    // oxlint-disable-next-line react/set-state-in-effect
    try { localStorage.setItem(storageKey, JSON.stringify(scenario)); setStorageError('') }
    catch { setStorageError('Výpočet se nepodařilo uložit v tomto prohlížeči. Před zavřením si jej stáhněte.'); }
  }, [scenario, storageEnabled])
  useEffect(() => {
    if (!storageError) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [storageError])
  useEffect(() => {
    const controller = new AbortController()
    listCables(controller.signal).then(items => { if (!controller.signal.aborted) { setCables(items); setCatalogError('') } })
      .catch(() => { if (!controller.signal.aborted) setCatalogError('Katalog se nepodařilo načíst. Hodnoty můžete zadat ručně.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  const replace = (next: Scenario, action: 'new' | 'demo' | 'import' | 'map') => {
    const messages = {
      new: 'Vymazat současné zadání cesty a začít nový výpočet?',
      demo: 'Nahradit současné zadání cesty ilustračním příkladem?',
      import: 'Nahradit současné zadání cesty výpočtem ze souboru?',
      map: 'Nahradit současné zadání optickou cestou z mapy?',
    }
    const message = storageEnabled ? messages[action] : `${messages[action]} Původní uložená data, která se nepodařilo načíst, budou přepsána.`
    if ((hasScenarioContent(scenario) || !storageEnabled) && !window.confirm(message)) return
    setScenario(next); setStorageEnabled(true)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'optical-budget.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return { scenario, setScenario, result: calculate(scenario), cables, loading, catalogError, storageError, replace, download,
    reload: () => { setLoading(true); setRevision(value => value + 1) } }
}
