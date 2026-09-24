import { useRef, useState } from 'react'
import { Calculator, Download, FlaskConical, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { BudgetResult } from './BudgetResult'
import { demoScenario, kinds, newElement, newScenario, newSection, number, type Element, type Section } from './model'
import { parseScenario } from './storage'
import { useOpticalBudget } from './useOpticalBudget'
import './optical-budget.css'

function NumberField({ label, value, onChange, unit }: { label: string; value: string; onChange: (value: string) => void; unit: string }) {
  return <label>{label}<span className="ob-input-unit"><input inputMode="decimal" value={value} placeholder="Neuvedeno"
    aria-label={label} aria-invalid={value !== '' && number(value) === null} onChange={event => onChange(event.target.value)} /><span>{unit}</span></span></label>
}

export function OpticalBudgetPage() {
  const state = useOpticalBudget()
  const { scenario, setScenario } = state
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const patchSection = (id: string, patch: Partial<Section>) => setScenario(previous => ({ ...previous, sections: previous.sections.map(row => row.id === id ? { ...row, ...patch } : row) }))
  const patchElement = (id: string, patch: Partial<Element>) => setScenario(previous => ({ ...previous, elements: previous.elements.map(row => row.id === id ? { ...row, ...patch } : row) }))
  const lossKey = scenario.wavelength === '1310' ? 'loss1310' : 'loss1550'
  const limitKey = scenario.wavelength === '1310' ? 'limit1310' : 'limit1550'
  const remove = (kind: 'sections' | 'elements', id: string) => {
    if (window.confirm('Odebrat tuto položku z výpočtu?')) setScenario(previous => ({ ...previous, [kind]: previous[kind].filter(row => row.id !== id) }))
  }
  return <main className="optical-budget" aria-label="Optické ztráty">
    <header className="ob-heading"><div><span className="ob-eyebrow">NÁVRH OPTICKÉ CESTY</span><h1><Calculator size={27} /> Optické ztráty</h1>
      <p>Sestavte jednu cestu signálu a ověřte její ztrátu pro zvolenou vlnovou délku.</p></div>
      <div className="ob-actions"><button onClick={() => state.replace(demoScenario())}><FlaskConical size={16} /> Ukázka</button>
        <button onClick={() => state.replace(newScenario())}><Plus size={16} /> Nový výpočet</button>
        <button onClick={state.download}><Download size={16} /> Stáhnout</button>
        <button onClick={() => fileInput.current?.click()}><Upload size={16} /> Načíst</button>
        <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Soubor výpočtu" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
          try { if (file.size > 1000000) throw new Error('Soubor je příliš velký (maximum 1 MB).'); const value = parseScenario(await file.text()); state.replace(value); setImportError('') }
          catch (error) { setImportError(error instanceof Error ? error.message : 'Soubor nelze načíst.') }
        }} /></div></header>
    <div className="ob-layout"><div className="ob-inputs">
      {(state.storageError || importError) && <p className="ob-message" role="alert">{state.storageError || importError}</p>}
      <section className="ob-panel"><div className="ob-section-heading"><h2>Zadání</h2><span className="ob-tag">Samostatná kalkulačka</span></div>
        <div className="ob-fields"><label>Název výpočtu<input value={scenario.name} maxLength={200} placeholder="Např. Přívod k budově A" onChange={event => setScenario({ ...scenario, name: event.target.value })} /></label>
          <label>Vlnová délka<select aria-label="Vlnová délka" value={scenario.wavelength} onChange={event => setScenario({ ...scenario, wavelength: event.target.value as '1310' | '1550' })}><option value="1310">1310 nm</option><option value="1550">1550 nm</option></select></label></div>
        <p className="ob-muted">{state.storageError ? 'Automatické ukládání není dostupné.' : 'Zadání se automaticky ukládá pouze v tomto prohlížeči.'} Pro přenos na jiný počítač použijte Stáhnout a Načíst.</p>
      </section>
      <section className="ob-panel"><div className="ob-section-heading"><h2>1. Kabelové úseky</h2><button disabled={scenario.sections.length >= 100} onClick={() => setScenario({ ...scenario, sections: [...scenario.sections, newSection()] })}><Plus size={16} /> Přidat úsek</button></div>
        <p className="ob-muted">Zadejte skutečnou délku kabelu včetně kabelových rezerv. Výběr z katalogu převezme údaje; katalog tím nezměníte.</p>
        {state.catalogError && <p role="alert" className="ob-message">{state.catalogError}</p>}
        <button className="ob-text-button" disabled={state.loading} onClick={state.reload}><RefreshCw size={14} /> {state.loading ? 'Načítání katalogu…' : 'Obnovit nabídku kabelů'}</button>
        {scenario.sections.map((row, i) => <article className="ob-row" key={row.id}>
          <div className="ob-row-heading"><strong>Úsek {i + 1}</strong><button className="ob-remove" aria-label={`Odebrat úsek ${i + 1}`} disabled={scenario.sections.length <= 1} onClick={() => remove('sections', row.id)}><Trash2 size={16} /></button></div>
          <label>Převzít kabel z katalogu<select aria-label={`Kabel pro úsek ${i + 1}`} value="" disabled={state.loading} onChange={event => {
            const cable = state.cables.find(item => item.id === event.target.value)
            if (cable) patchSection(row.id, { name: cable.name, loss1310: cable.attenuation1310DbPerKm?.toString() ?? '', loss1550: cable.attenuation1550DbPerKm?.toString() ?? '', source: `${cable.name} · verze ${cable.version}` })
          }}><option value="">Vyberte pro převzetí údajů…</option>{state.cables.map(cable => <option key={cable.id} value={cable.id}>{cable.name}</option>)}</select></label>
          {row.source && <p className="ob-source">Převzato: {row.source}</p>}
          <div className="ob-fields ob-three"><label>Označení úseku<input aria-label={`Označení úseku ${i + 1}`} maxLength={200} value={row.name} onChange={event => patchSection(row.id, { name: event.target.value })} /></label>
            <NumberField label={`Délka úseku ${i + 1}`} unit="m" value={row.lengthM} onChange={lengthM => patchSection(row.id, { lengthM })} />
            <NumberField label={`Útlum úseku ${i + 1} · ${scenario.wavelength} nm`} unit="dB/km" value={row[lossKey]} onChange={value => patchSection(row.id, { [lossKey]: value, source: '' })} /></div>
        </article>)}
      </section>
      <section className="ob-panel"><div className="ob-section-heading"><h2>2. Spoje a pasivní prvky</h2><button disabled={scenario.elements.length >= 100} onClick={() => setScenario({ ...scenario, elements: [...scenario.elements, newElement()] })}><Plus size={16} /> Přidat prvek</button></div>
        <p className="ob-muted">Konektorový spoj je jeden spojený pár konektorů. U splitteru zadejte ztrátu konkrétní vstupní–výstupní cesty z technického listu, nikoli počet jeho výstupů.</p>
        {scenario.elements.length === 0 && <p className="ob-empty">Zatím žádné prvky. Pokud jsou na cestě svary, konektorové spoje nebo splittery, přidejte je sem.</p>}
        {scenario.elements.map((row, i) => <article className="ob-row" key={row.id}><div className="ob-row-heading"><strong>Prvek {i + 1}</strong><button className="ob-remove" aria-label={`Odebrat prvek ${i + 1}`} onClick={() => remove('elements', row.id)}><Trash2 size={16} /></button></div>
          <div className="ob-fields"><label>Typ prvku<select aria-label={`Typ prvku ${i + 1}`} value={row.kind} onChange={event => patchElement(row.id, { kind: event.target.value as Element['kind'] })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Označení<input aria-label={`Označení prvku ${i + 1}`} maxLength={200} placeholder="Nepovinné" value={row.name} onChange={event => patchElement(row.id, { name: event.target.value })} /></label></div>
          <div className="ob-fields"><NumberField label={`Počet prvků ${i + 1}`} unit="ks" value={row.count} onChange={count => patchElement(row.id, { count })} />
            <NumberField label={`Ztráta prvku ${i + 1} · ${scenario.wavelength} nm`} unit="dB/ks" value={row[lossKey]} onChange={value => patchElement(row.id, { [lossKey]: value })} /></div>
        </article>)}
      </section>
      <section className="ob-panel"><h2>3. Limit a návrhová rezerva</h2><p className="ob-muted">Nepovinné pro součet ztrát. Pro posouzení zadejte povolenou ztrátu pro konkrétní zařízení a aplikaci při {scenario.wavelength} nm. Hodnoty pro obě vlnové délky se uchovávají zvlášť.</p>
        <div className="ob-fields"><NumberField label={`Povolená ztráta · ${scenario.wavelength} nm`} unit="dB" value={scenario[limitKey]} onChange={value => setScenario({ ...scenario, [limitKey]: value })} />
          <NumberField label="Požadovaná rezerva" unit="dB" value={scenario.reserve} onChange={reserve => setScenario({ ...scenario, reserve })} /></div>
        <p className="ob-muted">Rezerva je společná pro tento výpočet. Je to prostor pro budoucí změny a zhoršení, ne další fyzická ztráta. Ukázková data jsou pouze ilustrační.</p>
      </section>
    </div><BudgetResult result={state.result} wavelength={scenario.wavelength} /></div>
  </main>
}
