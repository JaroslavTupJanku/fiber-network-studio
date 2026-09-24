import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { ponWavelengths, type Technology, type Wavelength } from './model'
import { emptyCatalog, emptyEndpointSelection, equipmentStorageKey, evaluateEquipment, newProfile, parseEquipmentCatalog, profileErrors, type EquipmentCatalog, type EquipmentKind, type EquipmentProfile, type EndpointSelection } from './equipment'
import type { Scenario } from './model'

const kindLabels: Record<EquipmentKind, string> = { olt: 'Port/karta OLT', onu: 'ONT/ONU', module: 'Optický modul' }
const waves = ['1270', '1310', '1490', '1550', '1577'] as const
const fmt = (value: number | null) => value === null ? '—' : value.toLocaleString('cs-CZ', { maximumFractionDigits: 3 }) + ' dBm'

export function EquipmentProfiles({ scenario, onChange }: { scenario: Scenario; onChange: (scenario: Scenario) => void }) {
  const [initial] = useState(() => {
    try { const raw = localStorage.getItem(equipmentStorageKey); return { catalog: raw ? parseEquipmentCatalog(raw) : emptyCatalog(), error: '', enabled: true } }
    catch { return { catalog: emptyCatalog(), error: 'Uložený katalog zařízení má chybný formát. Původní obsah zůstává zachován.', enabled: false } }
  })
  const [catalog, setCatalog] = useState<EquipmentCatalog>(initial.catalog)
  const [storageError, setStorageError] = useState(initial.error)
  const [draft, setDraft] = useState<EquipmentProfile | null>(null)
  const [formError, setFormError] = useState('')
  const selection = scenario.equipment ?? emptyEndpointSelection()
  const persist = (next: EquipmentCatalog) => {
    if (!initial.enabled) return
    try { localStorage.setItem(equipmentStorageKey, JSON.stringify(next)); setStorageError('') }
    catch { setStorageError('Katalog zařízení se nepodařilo uložit v tomto prohlížeči.') }
  }
  const choose = (key: keyof EndpointSelection, value: string) => onChange({ ...scenario, equipment: { ...selection, [key]: value } })
  const save = () => {
    if (!draft || !initial.enabled) return
    const errors = profileErrors(draft)
    if (errors.length) { setFormError(errors.join(' ')); return }
    const next = { ...catalog, profiles: catalog.profiles.some(p => p.id === draft.id)
      ? catalog.profiles.map(p => p.id === draft.id ? draft : p) : [...catalog.profiles, draft] }
    persist(next); setCatalog(next)
    setDraft(null); setFormError('')
  }
  const remove = (id: string) => {
    if (!window.confirm('Opravdu odstranit tento profil z katalogu?')) return
    const next = { ...catalog, profiles: catalog.profiles.filter(p => p.id !== id) }
    persist(next); setCatalog(next)
    onChange({ ...scenario, equipment: Object.fromEntries(Object.entries(selection).map(([key, value]) => [key, value === id ? '' : value])) as EndpointSelection })
  }
  const checked = evaluateEquipment(scenario, catalog, selection)
  const options = (kind: EquipmentKind) => catalog.profiles.filter(p => p.kind === kind)
  return <section className="ob-panel ob-equipment" aria-label="Profily zařízení">
    <div className="ob-section-heading"><h2>Zařízení a výkon na přijímači</h2><button disabled={!initial.enabled} onClick={() => { setDraft(newProfile()); setFormError('') }}><Plus size={16} /> Přidat profil</button></div>
    <p className="ob-muted">Vytvořte profily podle technických listů výrobce. Katalog se ukládá v tomto prohlížeči. Číselné hodnoty se automaticky nedoplňují.</p>
    {storageError && <p className="ob-message" role="alert">{storageError}</p>}
    <div className="ob-fields">
      {([
        ['oltId', 'Koncový port nebo karta OLT', 'olt'],
        ['oltModuleId', 'Modul OLT (volitelně)', 'module'],
        ['onuId', 'Koncové zařízení ONT/ONU', 'onu'],
        ['onuModuleId', 'Modul ONT/ONU (volitelně)', 'module'],
      ] as const).map(([key, label, kind]) => <label key={key}>{label}<select aria-label={label} value={selection[key]} onChange={event => choose(key, event.target.value)}>
        <option value="">{key.includes('Module') ? 'Použít parametry profilu zařízení' : 'Vyberte profil'}</option>
        {options(kind).map(p => <option key={p.id} value={p.id}>{p.manufacturer} — {p.model} ({p.technology.toUpperCase()})</option>)}
      </select></label>)}
    </div>
    {draft && <div className="ob-row"><div className="ob-row-heading"><strong>{catalog.profiles.some(p => p.id === draft.id) ? 'Upravit profil' : 'Nový profil'}</strong><button className="ob-remove" aria-label="Zrušit úpravu" onClick={() => setDraft(null)}><Trash2 size={16} /></button></div>
      <div className="ob-fields ob-three">
        <label>Typ<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as EquipmentKind })}>{Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Technologie<select value={draft.technology} onChange={e => { const technology = e.target.value as Exclude<Technology, 'manual'>; setDraft({ ...draft, technology, txWavelength: ponWavelengths[technology].downstream, rxWavelength: ponWavelengths[technology].upstream }) }}><option value="gpon">GPON</option><option value="xgspon">XGS-PON</option></select></label>
        <label>Výrobce<input maxLength={200} value={draft.manufacturer} onChange={e => setDraft({ ...draft, manufacturer: e.target.value })} /></label>
        <label>Model / karta / typ modulu<input maxLength={200} value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label>
        <label>Vlnová délka Tx<select value={draft.txWavelength} onChange={e => setDraft({ ...draft, txWavelength: e.target.value as Wavelength })}>{waves.map(w => <option key={w} value={w}>{w} nm</option>)}</select></label>
        <label>Vlnová délka Rx<select value={draft.rxWavelength} onChange={e => setDraft({ ...draft, rxWavelength: e.target.value as Wavelength })}>{waves.map(w => <option key={w} value={w}>{w} nm</option>)}</select></label>
        <label>Minimální výkon Tx<input inputMode="decimal" placeholder="dBm" value={draft.txMin} onChange={e => setDraft({ ...draft, txMin: e.target.value })} /></label>
        <label>Maximální výkon Tx<input inputMode="decimal" placeholder="dBm" value={draft.txMax} onChange={e => setDraft({ ...draft, txMax: e.target.value })} /></label>
        <label>Citlivost Rx<input inputMode="decimal" placeholder="dBm" value={draft.rxSensitivity} onChange={e => setDraft({ ...draft, rxSensitivity: e.target.value })} /></label>
        <label>Přetížení Rx<input inputMode="decimal" placeholder="dBm" value={draft.rxOverload} onChange={e => setDraft({ ...draft, rxOverload: e.target.value })} /></label>
        <label>Zdroj hodnot (URL nebo označení dokumentu)<input maxLength={2000} placeholder="Odkaz na datasheet a strana/tabulka" value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })} /></label>
      </div>
      {formError && <p className="ob-message" role="alert">{formError}</p>}
      <button onClick={save}><Save size={15} /> Uložit ověřený profil</button>
    </div>}
    {catalog.profiles.length > 0 && <div className="ob-profile-list">{catalog.profiles.map(p => <div key={p.id}><span><strong>{kindLabels[p.kind]}: {p.manufacturer} {p.model}</strong><small>{p.technology.toUpperCase()} · Tx {p.txMin} až {p.txMax} dBm · Rx {p.rxSensitivity}/{p.rxOverload} dBm</small><small>{/^https?:\/\//i.test(p.source) ? <a href={p.source} target="_blank" rel="noreferrer">Zdroj: {p.source}</a> : 'Zdroj: ' + p.source}</small></span><button className="ob-remove" aria-label={'Upravit ' + p.manufacturer + ' ' + p.model} onClick={() => { setDraft(p); setFormError('') }}>Upravit</button><button className="ob-remove" aria-label={'Odstranit ' + p.manufacturer + ' ' + p.model} onClick={() => remove(p.id)}><Trash2 size={15} /></button></div>)}</div>}
    {checked.errors.length > 0 && <p className="ob-muted">Kontrola zařízení: {checked.errors.join(' ')}</p>}
    {checked.directions.length > 0 && <div className="ob-equipment-results"><h3>Výkon vypočtený na přijímači</h3>{checked.directions.map(d => <div key={d.direction} className={'ob-verdict ' + (d.verdict === 'pass' ? 'ob-pass' : d.verdict !== 'unknown' ? 'ob-fail' : '')}>
      <strong>{d.direction === 'downstream' ? 'K zákazníkovi' : 'Od zákazníka'} · {d.wavelength} nm: {d.verdict === 'pass' ? 'v mezích přijímače' : d.verdict === 'weak' ? 'signál pod citlivostí' : d.verdict === 'overload' ? 'signál nad mezí přetížení' : d.verdict === 'outside' ? 'výkonový rozsah Tx zasahuje pod citlivost i nad přetížení' : 'nelze posoudit'}</strong>
      <span>Vypočtený Rx: {fmt(d.receivedMin)} až {fmt(d.receivedMax)} · meze Rx {fmt(d.sensitivity)} až {fmt(d.overload)} · ztráta trasy {fmt(d.pathLoss)}</span>
    </div>)}<p className="ob-muted">Přijatý výkon se počítá z mezí Tx profilu minus ztráta sestavené trasy pro danou vlnovou délku. Jde o výpočet podle zadaných mezí a ztrát, nikoli o měření.</p></div>}
    <details className="ob-method"><summary>Primární podklady a metoda</summary><p>ITU-T definuje pro PON citlivost i přetížení přijímače a bilanci optické trasy. Doplňte vždy parametry konkrétního zařízení z jeho technického listu.</p>
      <p><a href="https://www.itu.int/rec/T-REC-G.984.2" target="_blank" rel="noreferrer">ITU-T G.984.2 — GPON, vrstva PMD</a></p>
      <p><a href="https://www.itu.int/rec/T-REC-G.9807.1" target="_blank" rel="noreferrer">ITU-T G.9807.1 — XGS-PON</a></p></details>
  </section>
}
