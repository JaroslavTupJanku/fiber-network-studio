import { useEffect, useRef, useState } from 'react'
import { Calculator, Cable, Layers3, MapPin, Network, Users, Library } from 'lucide-react'
import { CableCatalogPage } from './features/cable-catalog/CableCatalogPage'
import { DuctCatalogPage } from './features/duct-catalog/DuctCatalogPage'
import { MapWorkspace } from './features/map/MapWorkspace'
import { CustomerWorkspace } from './features/customers/CustomerWorkspace'
import { OpticalBudgetPage } from './features/optical-budget/OpticalBudgetPage'
import type { Scenario } from './features/optical-budget/model'
import './App.css'
import './features/map/networkSchematic.css'
import './features/map/workspacePolish.css'

function App() {
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    void fetch('/api/demo').then(response => response.ok ? response.json() : null)
      .then(value => setDemo(value?.enabled === true)).catch(() => { /* optional demo badge */ })
  }, [])
  const [section, setSection] = useState<'map' | 'catalog' | 'ducts' | 'budget' | 'customers'>('map')
  const [networkSection, setNetworkSection] = useState<'map' | 'budget'>('map')
  const [catalogSection, setCatalogSection] = useState<'catalog' | 'ducts'>('catalog')
  const inNetwork = section === 'map' || section === 'budget'
  const inCatalogs = section === 'catalog' || section === 'ducts'
  const [customerScope, setCustomerScope] = useState<string | null>(null)
  const [customerVisit, setCustomerVisit] = useState(0)
  const [customerDirty, setCustomerDirty] = useState(false)
  const [customerMapFocus, setCustomerMapFocus] = useState<{ id: string; sequence: number } | null>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const [catalogOpened, setCatalogOpened] = useState(false)
  const [ductsOpened, setDuctsOpened] = useState(false)
  const [budgetOpened, setBudgetOpened] = useState(false)
  const [incomingBudget, setIncomingBudget] = useState<{ id: string; scenario: Scenario } | null>(null)
  useEffect(() => {
    const navigation = navigationRef.current
    const selected = navigation?.querySelector<HTMLElement>("[aria-pressed='true']")
    if (!navigation || !selected) return
    navigation.scrollTo({ left: selected.offsetLeft - navigation.offsetLeft - 16, behavior: 'smooth' })
  }, [section])
  const navigate = (next: 'map' | 'catalog' | 'ducts' | 'budget') => {
    if (section === 'customers' && customerDirty
      && !window.confirm('Zahodit neuložené změny zákazníka?')) return false
    setCustomerDirty(false)
    if (next === 'map' || next === 'budget') setNetworkSection(next)
    else setCatalogSection(next)
    setSection(next)
    return true
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand"><Network size={21} strokeWidth={2} aria-hidden="true" /><span>Fiber Network Studio</span></div>
        {demo && <a className="demo-guide-link" href="/demo.html" target="_blank" rel="noopener noreferrer">Ukázková síť · Jak začít</a>}
        <nav className="workspace-navigation" aria-label="Hlavní navigace" ref={navigationRef}>
          <button type="button" aria-pressed={inNetwork} onClick={() => navigate(networkSection)}><Network size={15} />Síť</button>
          <button type="button" aria-pressed={section === 'customers'} onClick={() => { if (section === 'customers') return; setCustomerScope(null); setCustomerVisit(value => value + 1); setSection('customers') }}><Users size={15} />Zákazníci</button>
          <button type="button" aria-pressed={inCatalogs} onClick={() => { if (navigate(catalogSection)) { if (catalogSection === 'catalog') setCatalogOpened(true); else setDuctsOpened(true) } }}><Library size={15} />Katalogy</button>
        </nav>
      </header>
      <div className="app-content">
      {inNetwork && <nav className="section-navigation" aria-label="Práce se sítí">
        <span>Síť</span>
        <button type="button" aria-pressed={section === 'map'} onClick={() => navigate('map')}><MapPin size={15} />Mapa</button>
        <button type="button" aria-pressed={section === 'budget'} onClick={() => { if (navigate('budget')) setBudgetOpened(true) }}><Calculator size={15} />Výpočet ztrát</button>
      </nav>}
      {inCatalogs && <nav className="section-navigation" aria-label="Katalogy materiálu">
        <span>Katalogy</span>
        <button type="button" aria-pressed={section === 'catalog'} onClick={() => { if (navigate('catalog')) setCatalogOpened(true) }}><Cable size={15} />Kabely</button>
        <button type="button" aria-pressed={section === 'ducts'} onClick={() => { if (navigate('ducts')) setDuctsOpened(true) }}><Layers3 size={15} />Chráničky</button>
      </nav>}
      <MapWorkspace active={section === 'map'} customerMapFocus={customerMapFocus} onOpenCustomers={buildingId => {
        setCustomerScope(buildingId); setCustomerVisit(value => value + 1); setSection('customers')
      }} onOpenBudget={scenario => {
        setIncomingBudget({ id: crypto.randomUUID(), scenario })
        setNetworkSection('budget'); setBudgetOpened(true); setSection('budget')
      }} onOpenCalculator={() => { setBudgetOpened(true); navigate('budget') }} />
      {catalogOpened && <div className="catalog-view" hidden={section !== 'catalog'}><CableCatalogPage /></div>}
      {ductsOpened && <div className="catalog-view" hidden={section !== 'ducts'}><DuctCatalogPage active={section === 'ducts'} /></div>}
      {budgetOpened && <div className="budget-view" hidden={section !== 'budget'}><OpticalBudgetPage
        incoming={incomingBudget} onIncomingHandled={() => setIncomingBudget(null)} /></div>}
      {section === 'customers' && <CustomerWorkspace key={customerVisit} buildingId={customerScope}
        onDirtyChange={setCustomerDirty}
        onShowBuilding={id => { setCustomerDirty(false); setCustomerMapFocus(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })); setNetworkSection('map'); setSection('map') }} />}
      </div>
    </div>
  )
}

export default App
