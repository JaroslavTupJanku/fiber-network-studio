import { useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { changeKind, kindLabel, resizeAssembly, type DuctDraft, type DuctKind, type DuctSlot } from './model'
import { DuctDiagram } from './DuctDiagram'
import { acceptExampleOnArrowRight } from '../../shared/acceptExample'

type Props = { draft: DuctDraft; busy: boolean; dirty: boolean; onChange: (draft: DuctDraft) => void; onSave: () => void; onCancel: () => void }
const numberValue = (raw: string) => raw === '' ? null : Number(raw)

export function DuctEditor({ draft, busy, dirty, onChange, onSave, onCancel }: Props) {
  const [shapeError, setShapeError] = useState('')
  const updateSlot = (index: number, patch: Partial<DuctSlot>) => onChange({ ...draft,
    slots: draft.slots.map((slot, i) => i === index ? { ...slot, ...patch } : slot),
  })
  const resize = (rows: number, columns: number) => {
    try {
      if (rows * columns < draft.slots.length && !window.confirm('Zmenšení odstraní pozice na konci včetně jejich údajů. Pokračovat?')) return
      onChange(resizeAssembly(draft, rows, columns)); setShapeError('')
    } catch (error) { setShapeError((error as Error).message) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); onSave() }
  return <form className="dc-editor" onSubmit={submit}><fieldset disabled={busy}>
    <div className="cc-detail-heading"><div><span className="cc-eyebrow">{draft.id ? 'ÚPRAVA TYPU' : 'NOVÝ TYP'}</span><h2>{draft.id ? 'Upravit specifikaci' : 'Vlastní specifikace'}</h2></div>
      <span className="cc-badge cc-badge-warm">{dirty ? 'Neuložené změny' : 'Koncept'}</span></div>
    <div className="dc-fields"><label>Druh<select value={draft.kind} onChange={event => {
      if (dirty && !window.confirm('Změna druhu nahradí rozložení pozic. Pokračovat?')) return
      onChange(changeKind(draft, event.target.value as DuctKind))
    }}><option value="conduit">Chránička</option><option value="microduct">Mikrotrubička</option><option value="assembly">Sestava pozic</option></select></label>
      <label>Název<input autoFocus required maxLength={100} value={draft.name} placeholder="Např. Mikrotrubička pro přípojky" onChange={event => onChange({ ...draft, name: event.target.value })}
        onKeyDown={event => acceptExampleOnArrowRight(event, name => onChange({ ...draft, name }))}
        title="Šipka doprava převezme šedý příklad" /></label></div>
    <div className="dc-fields"><label>Výrobce <span>nepovinné</span><input maxLength={100} value={draft.manufacturer} onChange={event => onChange({ ...draft, manufacturer: event.target.value })} /></label>
      <label>Model / produktové číslo <span>nepovinné</span><input maxLength={100} value={draft.model} onChange={event => onChange({ ...draft, model: event.target.value })} /></label></div>
    <div className="dc-fields"><label>Barva pláště<input type="color" value={draft.color} onChange={event => onChange({ ...draft, color: event.target.value })} /></label>
      {draft.kind !== 'assembly' && <><label>Vnější průměr (mm) <span>podle technického listu</span><input type="number" min="0.01" max="1000" step="any" value={draft.outerDiameterMm ?? ''} onChange={event => onChange({ ...draft, outerDiameterMm: numberValue(event.target.value) })} /></label>
        <label>Vnitřní průměr (mm) <span>podle technického listu</span><input type="number" min="0.01" max="1000" step="any" value={draft.innerDiameterMm ?? ''} onChange={event => onChange({ ...draft, innerDiameterMm: numberValue(event.target.value) })} /></label></>}</div>
    {draft.kind === 'assembly' && <section className="dc-assembly-edit"><div className="cc-section-title"><h3>Rozložení sestavy</h3><span>{draft.slots.length} pozic</span></div>
      <p>Každá pozice je samostatná chránička nebo mikrotrubička. Jde o uspořádání, ne o počet optických vláken.</p>
      <div className="dc-shape"><label>Řady<input type="number" min={1} max={12} value={draft.rows} onChange={event => resize(Number(event.target.value), draft.columns)} /></label>
        <label>Sloupce<input type="number" min={1} max={12} value={draft.columns} onChange={event => resize(draft.rows, Number(event.target.value))} /></label></div>
      {shapeError && <p className="dc-error" role="alert">{shapeError}</p>}
      <div className="dc-slot-edit-list">{draft.slots.map((slot, index) => <div className="dc-slot-edit" key={index}><strong>{index + 1}</strong>
        <label>Název<input maxLength={40} value={slot.name} onChange={event => updateSlot(index, { name: event.target.value })} /></label>
        <label>Druh<select value={slot.kind} onChange={event => updateSlot(index, { kind: event.target.value as DuctSlot['kind'] })}><option value="conduit">Chránička</option><option value="microduct">Mikrotrubička</option></select></label>
        <label>Barva<input type="color" value={slot.color} onChange={event => updateSlot(index, { color: event.target.value })} /></label>
        <label>Vnější Ø mm<input type="number" min="0.01" max="1000" step="any" value={slot.outerDiameterMm ?? ''} onChange={event => updateSlot(index, { outerDiameterMm: numberValue(event.target.value) })} /></label>
        <label>Vnitřní Ø mm<input type="number" min="0.01" max="1000" step="any" value={slot.innerDiameterMm ?? ''} onChange={event => updateSlot(index, { innerDiameterMm: numberValue(event.target.value) })} /></label>
      </div>)}</div></section>}
    <label className="dc-full">Technický list <span>odkaz, nepovinné</span><input type="url" maxLength={2000} value={draft.sourceUrl} placeholder="https://…" onChange={event => onChange({ ...draft, sourceUrl: event.target.value })} /></label>
    <label className="dc-full">Poznámka <span>nepovinné</span><textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => onChange({ ...draft, notes: event.target.value })} /></label>
    <DuctDiagram item={draft} />
    <div className="cc-editor-footer"><span>Neznámé rozměry nechte prázdné. Schéma samo nepotvrzuje vhodnost instalace.</span><div><button type="button" className="cc-button" onClick={onCancel}><X size={16} /> Zrušit</button>
      <button type="submit" className="cc-button cc-primary"><Save size={16} /> {busy ? 'Ukládání…' : `Uložit ${kindLabel(draft.kind).toLowerCase()}`}</button></div></div>
  </fieldset></form>
}
