import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, Plus, Save, Trash2, X } from 'lucide-react'
import { fiberEndKey, spliceCableEnds, type FiberEnd } from './opticalSplices'
import { loadBuildingEquipment } from './buildingEquipment'
import { loadBuildingDistribution, saveBuildingDistribution,
  type BuildingDistributionDocument, type BuildingRiser, type FloorBox, type HomePremise } from './buildingDistribution'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

type Selection = { kind: 'riser' | 'box' | 'premise'; id: string }

export function BuildingDistributionEditor({ pointId, pointName, routes, installations, onClose, onSaved }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]; installations: RouteInstallationDocument[];
  onClose: () => void; onSaved: (document: BuildingDistributionDocument) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BuildingDistributionDocument | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [reservedByEquipment, setReservedByEquipment] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const cableEnds = useMemo(() => spliceCableEnds(pointId, routes, installations), [pointId, routes, installations])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    void Promise.all([loadBuildingDistribution(pointId), loadBuildingEquipment(pointId)])
      .then(([document, equipment]) => {
        setDraft(document)
        setReservedByEquipment(new Set(equipment.ports.filter(port => port.fiber).map(port => fiberEndKey(port.fiber!))))
      }).catch(reason => setError(reason instanceof Error ? reason.message : 'Rozvody se nepodařilo načíst.'))
    return () => dialog?.close()
  }, [pointId])
  const close = () => { if (!dirty || window.confirm('Zavřít editor a zahodit neuložené změny?')) onClose() }
  const update = (next: BuildingDistributionDocument) => { setDraft(next); setDirty(true); setSaved(false); setError('') }
  const selectedRiser = draft?.risers.find(item => item.id === selection?.id)
  const selectedBox = draft?.boxes.find(item => item.id === selection?.id)
  const selectedPremise = draft?.premises.find(item => item.id === selection?.id)
  const premiseBox = selectedPremise && draft?.boxes.find(item => item.id === selectedPremise.boxId)
  const premiseRiser = premiseBox && draft?.risers.find(item => item.id === premiseBox.riserId)
  const selectedCable = cableEnds.find(item => item.id === premiseRiser?.cableItemId)
  const occupied = useMemo(() => {
    const keys = new Set(reservedByEquipment)
    for (const item of draft?.premises ?? []) if (item.id !== selectedPremise?.id && item.fiber) keys.add(fiberEndKey(item.fiber))
    return keys
  }, [reservedByEquipment, draft, selectedPremise?.id])
  const fiberOptions = useMemo(() => selectedCable?.cable?.tubes.flatMap((tube, tubeIndex) =>
    tube.fibers.map((fiber, fiberIndex) => ({ end: { itemId: selectedCable.id, tubeIndex, fiberIndex },
      label: `Tuba ${tubeIndex + 1} · vlákno ${fiberIndex + 1} · ${fiber.name}` }))) ?? [], [selectedCable])
  const addRiser = () => {
    if (!draft) return
    const item: BuildingRiser = { id: crypto.randomUUID(), name: `Vchod ${draft.risers.length + 1}`, cableItemId: null }
    update({ ...draft, risers: [...draft.risers, item] }); setSelection({ kind: 'riser', id: item.id })
  }
  const addBox = (riserId: string) => {
    if (!draft) return
    const item: FloorBox = { id: crypto.randomUUID(), riserId, name: `Box ${draft.boxes.filter(box => box.riserId === riserId).length + 1}`, floor: 1 }
    update({ ...draft, boxes: [...draft.boxes, item] }); setSelection({ kind: 'box', id: item.id })
  }
  const addPremise = (boxId: string) => {
    if (!draft) return
    const item: HomePremise = { id: crypto.randomUUID(), boxId,
      label: `HP ${draft.premises.length + 1}`, status: 'planned', fiber: null }
    update({ ...draft, premises: [...draft.premises, item] }); setSelection({ kind: 'premise', id: item.id })
  }
  const removeSelected = () => {
    if (!draft || !selection) return
    const boxIds = new Set(draft.boxes.filter(box => selection.kind === 'riser' && box.riserId === selection.id
      || selection.kind === 'box' && box.id === selection.id).map(box => box.id))
    const count = selection.kind === 'riser' ? boxIds.size + draft.premises.filter(item => boxIds.has(item.boxId)).length
      : selection.kind === 'box' ? draft.premises.filter(item => item.boxId === selection.id).length : 0
    if (!window.confirm(count ? `Odebrat vybraný prvek i ${count} podřízených prvků?` : 'Odebrat vybraný prvek?')) return
    update({ ...draft,
      risers: draft.risers.filter(item => item.id !== selection.id),
      boxes: draft.boxes.filter(item => item.id !== selection.id && !boxIds.has(item.id)),
      premises: draft.premises.filter(item => item.id !== selection.id && !boxIds.has(item.boxId)),
    })
    setSelection(null)
  }
  const save = async () => {
    if (!draft || !dirty || busy) return
    if (draft.risers.some(item => !item.name.trim()) || draft.boxes.some(item => !item.name.trim())
      || draft.premises.some(item => !item.label.trim())) { setError('Doplňte všechna označení.'); return }
    setBusy(true); setError('')
    try {
      const next = await saveBuildingDistribution(draft)
      setDraft(next); setDirty(false); setSaved(true); onSaved(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Rozvody se nepodařilo uložit.') }
    finally { setBusy(false) }
  }
  const setRiser = (next: BuildingRiser) => {
    if (!draft) return
    const premises = next.cableItemId === selectedRiser?.cableItemId ? draft.premises
      : draft.premises.map(item => draft.boxes.find(box => box.id === item.boxId)?.riserId === next.id
        ? { ...item, status: 'planned' as const, fiber: null } : item)
    update({ ...draft, risers: draft.risers.map(item => item.id === next.id ? next : item), premises })
  }
  const setBox = (next: FloorBox) => { if (draft) update({ ...draft, boxes: draft.boxes.map(item => item.id === next.id ? next : item) }) }
  const setPremise = (next: HomePremise) => { if (draft) update({ ...draft, premises: draft.premises.map(item => item.id === next.id ? next : item) }) }
  const connected = draft?.premises.filter(item => item.status === 'connected').length ?? 0
  return createPortal(<dialog ref={dialogRef} className="splice-editor-dialog distribution-dialog"
    aria-labelledby="distribution-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="splice-editor-header"><span className="splice-editor-emblem"><Building2 size={23} /></span>
      <div><small>Budova · {pointName}</small><h2 id="distribution-title">Domovní FTTH rozvody</h2></div>
      <button type="button" className="icon-button" onClick={close} aria-label="Zavřít editor"><X size={19} /></button>
    </header>
    <div className="distribution-summary"><span><strong>{draft?.risers.length ?? 0}</strong> stoupaček</span>
      <span><strong>{draft?.boxes.length ?? 0}</strong> podlažních boxů</span>
      <span><strong>{connected}/{draft?.premises.length ?? 0}</strong> připojených HP</span></div>
    <div className="distribution-layout">
      <section className="distribution-list" aria-label="Schéma domovního rozvodu">
        <div className="distribution-list-heading"><div><small>VCHODY A PODLAŽÍ</small><h3>Rozvod v budově</h3></div>
          <button type="button" className="move-button" onClick={addRiser} disabled={!draft}><Plus size={15} /> Stoupačka</button></div>
        {!draft && !error && <p>Načítání rozvodu…</p>}
        {draft?.risers.length === 0 && <div className="distribution-empty"><Building2 size={28} />
          <strong>Začněte stoupačkou</strong><p>Pro každý vchod můžete vytvořit vlastní stoupačku. Do ní přidáte boxy na podlažích a přípojná místa bytů.</p></div>}
        {draft?.risers.map(riser => <div className="distribution-riser" key={riser.id}>
          <button type="button" className={`distribution-row${selection?.id === riser.id ? ' selected' : ''}`}
            onClick={() => setSelection({ kind: 'riser', id: riser.id })}><Building2 size={17} /><span><strong>{riser.name}</strong><small>{riser.cableItemId ? 'Přívodní kabel přiřazen' : 'Bez přívodního kabelu'}</small></span></button>
          {draft.boxes.filter(box => box.riserId === riser.id).sort((a, b) => b.floor - a.floor).map(box =>
            <div className="distribution-box" key={box.id}>
              <button type="button" className={`distribution-row${selection?.id === box.id ? ' selected' : ''}`}
                onClick={() => setSelection({ kind: 'box', id: box.id })}><span className="distribution-floor">{box.floor}</span>
                <span><strong>{box.name}</strong><small>{box.floor}. podlaží · {draft.premises.filter(item => item.boxId === box.id).length} HP</small></span></button>
              <div className="distribution-premises">{draft.premises.filter(item => item.boxId === box.id).map(premise =>
                <button type="button" key={premise.id} className={`distribution-premise${selection?.id === premise.id ? ' selected' : ''}${premise.status === 'connected' ? ' connected' : ''}`}
                  onClick={() => setSelection({ kind: 'premise', id: premise.id })}>
                  <span className="distribution-status-dot" /><strong>{premise.label}</strong>
                  <small>{premise.status === 'connected' ? 'Připojeno' : 'Plánováno'}</small></button>)}</div>
            </div>)}
          <button type="button" className="distribution-add" onClick={() => addBox(riser.id)}><Plus size={14} /> Podlažní box</button>
        </div>)}
      </section>
      <section className="distribution-detail" aria-label="Detail vybraného prvku">
        {!selection && <div className="distribution-empty"><strong>Vyberte prvek vlevo</strong>
          <p>Stoupačka představuje rozvod v jednom vchodu. Box patří na podlaží a HP je přípojné místo bytu nebo prostoru.</p></div>}
        {selection && <><div className="distribution-detail-heading"><div><small>VYBRANÝ PRVEK</small>
          <h3>{selectedRiser ? 'Stoupačka' : selectedBox ? 'Podlažní box' : 'Přípojné místo (HP)'}</h3></div>
          <button type="button" className="icon-button" onClick={removeSelected} title="Odebrat prvek" aria-label="Odebrat prvek"><Trash2 size={17} /></button></div>
          {selectedRiser && <><label className="equipment-field">Označení vchodu nebo stoupačky
            <input maxLength={80} value={selectedRiser.name} onChange={event => setRiser({ ...selectedRiser, name: event.target.value })} /></label>
            <label className="equipment-field">Přívodní kabel končící v budově
              <select value={selectedRiser.cableItemId ?? ''} onChange={event => setRiser({ ...selectedRiser, cableItemId: event.target.value || null })}>
                <option value="">Zatím nepřiřazen</option>
                {cableEnds.map(item => <option key={item.id} value={item.id}
                  disabled={draft?.risers.some(riser => riser.id !== selectedRiser.id && riser.cableItemId === item.id)}>{item.label}</option>)}</select></label>
            <p className="equipment-note">Změna kabelu vrátí přípojná místa této stoupačky do stavu plánováno.</p>
            <button type="button" className="move-button" onClick={() => addBox(selectedRiser.id)}><Plus size={15} /> Přidat box na podlaží</button></>}
          {selectedBox && <><label className="equipment-field">Označení boxu
            <input maxLength={80} value={selectedBox.name} onChange={event => setBox({ ...selectedBox, name: event.target.value })} /></label>
            <label className="equipment-field">Podlaží
              <input type="number" min={-10} max={150} value={selectedBox.floor}
                onChange={event => setBox({ ...selectedBox, floor: Number(event.target.value) })} /></label>
            <p className="equipment-note">Box je místo, odkud se v daném podlaží vedou přípojky k bytům nebo prostorům.</p>
            <button type="button" className="move-button" onClick={() => addPremise(selectedBox.id)}><Plus size={15} /> Přidat přípojné místo</button></>}
          {selectedPremise && <><label className="equipment-field">Označení bytu nebo přípojného místa
            <input maxLength={80} value={selectedPremise.label} onChange={event => setPremise({ ...selectedPremise, label: event.target.value })} /></label>
            <label className="equipment-field">Stav
              <select value={selectedPremise.status} onChange={event => setPremise({ ...selectedPremise,
                status: event.target.value as HomePremise['status'], fiber: null })}>
                <option value="planned">Plánováno</option><option value="connected" disabled={!selectedCable}>Připojeno k vláknu</option>
              </select></label>
            {selectedPremise.status === 'connected' && <label className="equipment-field">Konkrétní vlákno přívodního kabelu
              <select value={selectedPremise.fiber ? fiberEndKey(selectedPremise.fiber) : ''} onChange={event => {
                const option = fiberOptions.find(item => fiberEndKey(item.end) === event.target.value)
                setPremise({ ...selectedPremise, fiber: (option?.end ?? null) as FiberEnd | null })
              }}><option value="">Vyberte volné vlákno</option>
                {fiberOptions.map(option => <option key={fiberEndKey(option.end)} value={fiberEndKey(option.end)}
                  disabled={occupied.has(fiberEndKey(option.end))}>{option.label}</option>)}</select></label>}
            {!selectedCable && <p className="equipment-note">Pro připojení nejdříve vyberte přívodní kabel u stoupačky.</p>}
            <p className="equipment-note">HP eviduje cílové místo. Číslo bytu ani jméno obyvatele nemusíte zadávat.</p></>}
        </>}
      </section>
    </div>
    {error && <p className="form-error equipment-message" role="alert">{error}</p>}
    <footer className="splice-editor-footer"><span>{saved ? <><Check size={15} /> Uloženo</> : dirty ? 'Neuložené změny' : 'Přehled domovních rozvodů'}</span>
      <div><button type="button" className="move-button" onClick={close}>Zavřít</button>
        <button type="button" className="primary-button" onClick={() => void save()} disabled={!draft || !dirty || busy}>
          <Save size={15} /> {busy ? 'Ukládání…' : 'Uložit rozvod'}</button></div></footer>
  </dialog>, globalThis.document.body)
}
