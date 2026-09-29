import { useState } from 'react'
import { Calculator, Cable, Layers3, MapPin, Network } from 'lucide-react'
import { CableCatalogPage } from './features/cable-catalog/CableCatalogPage'
import { DuctCatalogPage } from './features/duct-catalog/DuctCatalogPage'
import { MapWorkspace } from './features/map/MapWorkspace'
import { OpticalBudgetPage } from './features/optical-budget/OpticalBudgetPage'
import type { Scenario } from './features/optical-budget/model'
import './App.css'

function App() {
  const [section, setSection] = useState<'map' | 'catalog' | 'ducts' | 'budget'>('map')
  const [catalogOpened, setCatalogOpened] = useState(false)
  const [ductsOpened, setDuctsOpened] = useState(false)
  const [budgetOpened, setBudgetOpened] = useState(false)
  const [incomingBudget, setIncomingBudget] = useState<{ id: string; scenario: Scenario } | null>(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand"><Network size={21} strokeWidth={2} aria-hidden="true" /><span>Fiber Network Studio</span></div>
        <nav className="workspace-navigation" aria-label="Hlavní navigace">
          <button type="button" aria-pressed={section === 'map'} onClick={() => setSection('map')}><MapPin size={15} />Mapa</button>
          <button type="button" aria-pressed={section === 'catalog'} onClick={() => { setCatalogOpened(true); setSection('catalog') }}><Cable size={15} />Katalog kabelů</button>
          <button type="button" aria-pressed={section === 'ducts'} onClick={() => { setDuctsOpened(true); setSection('ducts') }}><Layers3 size={15} />Chráničky</button>
          <button type="button" aria-pressed={section === 'budget'} onClick={() => { setBudgetOpened(true); setSection('budget') }}><Calculator size={15} />Optické ztráty</button>
        </nav>
      </header>

      <MapWorkspace active={section === 'map'} onOpenBudget={scenario => {
        setIncomingBudget({ id: crypto.randomUUID(), scenario })
        setBudgetOpened(true); setSection('budget')
      }} />
      {catalogOpened && <div className="catalog-view" hidden={section !== 'catalog'}><CableCatalogPage /></div>}
      {ductsOpened && <div className="catalog-view" hidden={section !== 'ducts'}><DuctCatalogPage active={section === 'ducts'} /></div>}
      {budgetOpened && <div className="budget-view" hidden={section !== 'budget'}><OpticalBudgetPage
        incoming={incomingBudget} onIncomingHandled={() => setIncomingBudget(null)} /></div>}
    </div>
  )
}

export default App
