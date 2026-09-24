import { useState, type FormEvent } from 'react'
import { Check, Layers, Save, X } from 'lucide-react'
import { CableStructure } from './CableStructure'
import { countFibers, createTubes, type CableDraft } from './model'

type Props = { draft: CableDraft; busy: boolean; dirty: boolean; onChange: (draft: CableDraft) => void; onSave: () => void; onCancel: () => void }

export function CableEditor({ draft, busy, dirty, onChange, onSave, onCancel }: Props) {
  const [activeTube, setActiveTube] = useState(0)
  const [tubeCount, setTubeCount] = useState(String(draft.tubes.length))
  const [fiberCount, setFiberCount] = useState(String(draft.tubes[0].fibers.length))
  const validCounts = [tubeCount, fiberCount].every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 24)
  const rebuild = () => {
    if (!validCounts || !window.confirm('Přestavět strukturu? Vlastní názvy a barvy všech tub a vláken se nahradí výchozími.')) return
    onChange({ ...draft, tubes: createTubes(Number(tubeCount), Number(fiberCount)) }); setActiveTube(0)
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
      <div className="cc-section-title"><Layers size={18} /><h3>Struktura kabelu</h3><span>{countFibers(draft)} vláken celkem</span></div>
      <div className="cc-generator">
        <label>Počet tub<input type="number" min={1} max={24} step={1} value={tubeCount} onChange={event => setTubeCount(event.target.value)} /></label>
        <span aria-hidden="true">×</span>
        <label>Vláken v tubě<input type="number" min={1} max={24} step={1} value={fiberCount} onChange={event => setFiberCount(event.target.value)} /></label>
        <button className="cc-button" type="button" disabled={!validCounts} onClick={rebuild}><Check size={15} /> Přestavět strukturu</button>
      </div>
      <p className="cc-helper">Počty se změní až přestavěním struktury. Názvy a barvy upravíte po výběru tuby.</p>
      <CableStructure cable={draft} activeTube={activeTube} onSelect={setActiveTube} onChange={tube => onChange({
        ...draft, tubes: draft.tubes.map((item, index) => index === activeTube ? tube : item),
      })} />
      <div className="cc-editor-footer"><span>Barvy ověřte podle specifikace výrobce.</span><div>
        <button type="button" className="cc-button" onClick={onCancel}><X size={16} /> Zrušit</button>
        <button type="submit" className="cc-button cc-primary"><Save size={16} />{busy ? 'Ukládání…' : 'Uložit kabel'}</button>
      </div></div>
    </fieldset>
  </form>
}
