import { useState, type FormEvent } from 'react'
import { Check, Layers, Plus, Save, Trash2, X } from 'lucide-react'
import { CableStructure } from './CableStructure'
import { countFibers, sequence, markSignature, type CableDraft, type ColorCodeData } from './model'
import { appendTube, removeFiber, removeTube, resizeFibers, resizeStructure } from './structure'
import { ColorCodeInfo } from './ColorCodeInfo'

type Props = { draft: CableDraft; data: ColorCodeData; busy: boolean; dirty: boolean; onChange: (draft: CableDraft) => void; onSave: () => void; onCancel: () => void }

export function CableEditor({ draft, data, busy, dirty, onChange, onSave, onCancel }: Props) {
  const [structureError, setStructureError] = useState('')
  const [activeTube, setActiveTube] = useState(0)
  const [tubeCount, setTubeCount] = useState(String(draft.tubes.length))
  const [fiberCount, setFiberCount] = useState(String(draft.tubes[0].fibers.length))
  const validCounts = [tubeCount, fiberCount].every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 24)
  const rebuild = () => {
    if (!validCounts) return
    try {
      const result = resizeStructure(draft, Number(tubeCount), Number(fiberCount), data)
      const removed = countFibers(draft) - draft.tubes.slice(0, Number(tubeCount)).reduce((sum, tube) => sum + Math.min(tube.fibers.length, Number(fiberCount)), 0)
      if (removed > 0 && !window.confirm(`Zmenšení odstraní ${removed} vláken včetně jejich názvů a značení. Odeberou se položky na konci. Pokračovat?`)) return
      onChange(result); setActiveTube(Math.min(activeTube, result.tubes.length - 1)); setStructureError('')
    } catch (error) { setStructureError((error as Error).message) }
  }
  const addTube = () => {
    try {
      const result = appendTube(draft, data, draft.tubes[activeTube].fibers.length)
      onChange(result); setActiveTube(result.tubes.length - 1); setTubeCount(String(result.tubes.length)); setStructureError('')
    } catch (error) { setStructureError((error as Error).message) }
  }
  const deleteTube = () => {
    const tube = draft.tubes[activeTube]
    if (!window.confirm(`Odebrat tubu „${tube.name}“ a jejích ${tube.fibers.length} vláken? Ostatní názvy a barvy zůstanou zachované. Při odebrání uprostřed se značení tub přepne na vlastní.`)) return
    const result = removeTube(draft, activeTube)
    onChange(result); setActiveTube(Math.min(activeTube, result.tubes.length - 1)); setTubeCount(String(result.tubes.length)); setStructureError('')
  }
  const addFiber = () => {
    try {
      const tube = resizeFibers(draft.tubes[activeTube], draft.tubes[activeTube].fibers.length + 1, data, draft.fiberColorCode)
      onChange({ ...draft, tubes: draft.tubes.map((part, i) => i === activeTube ? tube : part) }); setStructureError('')
    } catch (error) { setStructureError((error as Error).message) }
  }
  const deleteFiber = (index: number) => {
    if (!window.confirm(`Odebrat vlákno „${draft.tubes[activeTube].fibers[index].name}“? Ostatní názvy a barvy zůstanou zachované. Při odebrání uprostřed se značení vláken přepne na vlastní.`)) return
    onChange(removeFiber(draft, activeTube, index)); setStructureError('')
  }
  const changeProfile = (scope: 'fibers' | 'tubes', id: string) => {
    const key = scope === 'fibers' ? 'fiberColorCode' : 'tubeColorCode'
    if (id === 'custom') { onChange({ ...draft, [key]: id }); setStructureError(''); return }
    try {
      const tubes = scope === 'fibers' ? draft.tubes.map(tube => ({ ...tube,
        fibers: sequence(data, id, 'fibers', tube.fibers.length).map((mark, i) => ({ ...tube.fibers[i], ...mark })),
      })) : sequence(data, id, 'tubes', draft.tubes.length).map((mark, i) => ({ ...draft.tubes[i], ...mark }))
      if (!window.confirm('Použít vybraný profil? Nahradí barvy a značky; vlastní názvy zůstanou zachované.')) return
      onChange({ ...draft, tubes, [key]: id }); setStructureError('')
    } catch (error) { setStructureError((error as Error).message) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); onSave() }

  return <form onSubmit={submit} className="cc-editor">
    <fieldset disabled={busy}>
      <div className="cc-detail-heading"><div><span className="cc-eyebrow">{draft.id ? 'ÚPRAVA KABELU' : 'NOVÝ TYP KABELU'}</span>
        <h2>{draft.id ? 'Upravit specifikaci' : 'Vlastní specifikace'}</h2></div>
        <span className="cc-badge cc-badge-warm">{dirty ? 'Neuložené změny' : 'Koncept'}</span>
      </div>
      <div className="cc-fields">
        <label>Název kabelu<input autoFocus required maxLength={100} value={draft.name} placeholder="Např. Přívodní kabel 48 vláken"
          onChange={event => onChange({ ...draft, name: event.target.value })} /></label>
        <label>Výrobce <span className="cc-optional">nepovinné</span><input maxLength={100} value={draft.manufacturer} placeholder="Název výrobce"
          onChange={event => onChange({ ...draft, manufacturer: event.target.value })} /></label>
      </div>
      <label className="cc-note-field">Poznámka <span className="cc-optional">nepovinné</span><textarea rows={2} maxLength={2000} value={draft.notes}
        placeholder="Označení výrobku, zdroj specifikace nebo poznámka pro kolegy"
        onChange={event => onChange({ ...draft, notes: event.target.value })} /></label>
      <label className="cc-source-field">Technický list kabelu <span className="cc-optional">odkaz, nepovinné</span><input type="url" maxLength={2000} value={draft.sourceUrl} placeholder="https://…"
        onChange={event => onChange({ ...draft, sourceUrl: event.target.value })} /></label>
      <div className="cc-fields cc-profile-selects">{(['fibers', 'tubes'] as const).map(scope => <label key={scope}>{scope === 'fibers' ? 'Barevný profil vláken' : 'Barevný profil tub'}
        <select aria-label={scope === 'fibers' ? 'Barevný profil vláken' : 'Barevný profil tub'} value={scope === 'fibers' ? draft.fiberColorCode : draft.tubeColorCode} onChange={event => changeProfile(scope, event.target.value)}>
          <option value="custom">Vlastní značení</option>{data.profiles.filter(profile => profile[scope].length > 0).map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
        </select></label>)}</div>
      <ColorCodeInfo cable={draft} data={data} />
      <div className="cc-section-title"><Layers size={18} /><h3>Struktura kabelu</h3><span>{countFibers(draft)} vláken celkem</span></div>
      <details className="cc-bulk-structure"><summary>Hromadná úprava počtů</summary><div className="cc-generator">
        <label>Počet tub<input type="number" min={1} max={24} step={1} value={tubeCount} onChange={event => setTubeCount(event.target.value)} /></label>
        <span aria-hidden="true">×</span>
        <label>Vláken v tubě<input type="number" min={1} max={24} step={1} value={fiberCount} onChange={event => setFiberCount(event.target.value)} /></label>
        <button className="cc-button" type="button" disabled={!validCounts} onClick={rebuild}><Check size={15} /> Upravit počty</button>
      </div>
      <p className="cc-helper">Nastaví stejný počet vláken ve všech tubách. Stávající názvy a značení zachová; přidává a odebírá na konci.</p></details>
      <div className="cc-structure-actions">
        <button type="button" className="cc-button" disabled={draft.tubes.length >= 24} onClick={addTube}><Plus size={16} /> Přidat tubu</button>
        <button type="button" className="cc-button cc-delete" disabled={draft.tubes.length <= 1} onClick={deleteTube}><Trash2 size={16} /> Odebrat vybranou tubu</button>
      </div>
      {structureError && <p role="alert" className="cc-error">{structureError}</p>}
      {(draft.fiberColorCode === 'custom' || draft.tubeColorCode === 'custom') && <p className="cc-helper">Vlastní značení se neověřuje proti normě. Nové položky s vlastním značením jsou šedé, bez značek; doplňte je podle kabelu.</p>}
      <CableStructure cable={draft} data={data} activeTube={activeTube} onSelect={setActiveTube} onAddFiber={addFiber} onRemoveFiber={deleteFiber} onChange={tube => onChange({
        ...draft, tubeColorCode: markSignature(tube) !== markSignature(draft.tubes[activeTube]) ? 'custom' : draft.tubeColorCode,
        fiberColorCode: tube.fibers.some((fiber, i) => markSignature(fiber) !== markSignature(draft.tubes[activeTube].fibers[i])) ? 'custom' : draft.fiberColorCode,
        tubes: draft.tubes.map((item, index) => index === activeTube ? tube : item),
      })} />
      <div className="cc-editor-footer"><span>Barvy ověřte podle specifikace výrobce.</span><div>
        <button type="button" className="cc-button" onClick={onCancel}><X size={16} /> Zrušit</button>
        <button type="submit" className="cc-button cc-primary"><Save size={16} />{busy ? 'Ukládání…' : 'Uložit kabel'}</button>
      </div></div>
    </fieldset>
  </form>
}
