import { useState, type FormEvent } from 'react'
import { Check, Layers, Save, X } from 'lucide-react'
import { CableStructure } from './CableStructure'
import { countFibers, createTubes, sequence, markSignature, type CableDraft, type ColorCodeData } from './model'
import { ColorCodeInfo } from './ColorCodeInfo'

type Props = { draft: CableDraft; data: ColorCodeData; busy: boolean; dirty: boolean; onChange: (draft: CableDraft) => void; onSave: () => void; onCancel: () => void }

export function CableEditor({ draft, data, busy, dirty, onChange, onSave, onCancel }: Props) {
  const [structureError, setStructureError] = useState('')
  const [activeTube, setActiveTube] = useState(0)
  const [tubeCount, setTubeCount] = useState(String(draft.tubes.length))
  const [fiberCount, setFiberCount] = useState(String(draft.tubes[0].fibers.length))
  const validCounts = [tubeCount, fiberCount].every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 24)
  const rebuild = () => {
    if (!validCounts || !window.confirm('Přestavět strukturu? Vlastní názvy a barvy všech tub a vláken se nahradí výchozími.')) return
    try {
      const tubes = createTubes(data, Number(tubeCount), Number(fiberCount), draft.fiberColorCode, draft.tubeColorCode)
      onChange({ ...draft, tubes }); setActiveTube(0); setStructureError('')
    } catch (error) { setStructureError((error as Error).message) }
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
      <div className="cc-generator">
        <label>Počet tub<input type="number" min={1} max={24} step={1} value={tubeCount} onChange={event => setTubeCount(event.target.value)} /></label>
        <span aria-hidden="true">×</span>
        <label>Vláken v tubě<input type="number" min={1} max={24} step={1} value={fiberCount} onChange={event => setFiberCount(event.target.value)} /></label>
        <button className="cc-button" type="button" disabled={!validCounts} onClick={rebuild}><Check size={15} /> Přestavět strukturu</button>
      </div>
      <p className="cc-helper">Počty se změní až přestavěním struktury. Názvy a barvy upravíte po výběru tuby.</p>
      {structureError && <p role="alert" className="cc-error">{structureError}</p>}
      {(draft.fiberColorCode === 'custom' || draft.tubeColorCode === 'custom') && <p className="cc-helper">Vlastní značení se neověřuje proti normě. Při přestavění se vlastní části vytvoří šedé, bez značek; doplňte je podle kabelu.</p>}
      <CableStructure cable={draft} data={data} activeTube={activeTube} onSelect={setActiveTube} onChange={tube => onChange({
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
