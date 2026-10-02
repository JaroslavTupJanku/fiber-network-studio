import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, Link2, Plus, Save, Trash2, X } from 'lucide-react'
import { listCables } from '../cable-catalog/api'
import type { CableSpecification } from '../cable-catalog/model'
import { fiberEndKey, spliceCableEnds, type FiberEnd } from './opticalSplices'
import { listBuildingEquipment, loadBuildingEquipment } from './buildingEquipment'
import { countCzech } from './equipmentPresentation'
import { IndoorCableFields } from './IndoorCableFields'
import { indoorCableError } from './indoorCable'
import { listOpticalSplices } from './opticalSplices'
import { tracePremisePath, type OpticalPath } from './traceOpticalPath'
import { loadFiberAllocations, type FiberAllocationDocument } from './fiberAllocations'
import { OpticalPathSteps } from './OpticalPathSteps'
import { isConnectedPremise, loadBuildingDistribution, saveBuildingDistribution,
  type BuildingDistributionDocument, type BuildingRiser, type FloorBox, type HomePremise } from './buildingDistribution'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

type Selection = { kind: 'riser' | 'box' | 'premise'; id: string }

export function BuildingDistributionEditor({ pointId, pointName, routes, installations, onClose, onSaved, onTrace, onBudget, onOpenRoute, onViewMap }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]; installations: RouteInstallationDocument[];
  onClose: () => void; onSaved: (document: BuildingDistributionDocument) => void;
  onTrace: (path: OpticalPath | null) => void; onBudget: (path: OpticalPath) => void
  onOpenRoute: (routeId: string) => void; onViewMap: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BuildingDistributionDocument | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [reservedByEquipment, setReservedByEquipment] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [path, setPath] = useState<OpticalPath | null>(null)
  const [allocations, setAllocations] = useState<FiberAllocationDocument | null>(null)
  const [tracing, setTracing] = useState(false)
  const [catalogCables, setCatalogCables] = useState<CableSpecification[]>([])
  const [catalogError, setCatalogError] = useState('')
  const cableEnds = useMemo(() => spliceCableEnds(pointId, routes, installations), [pointId, routes, installations])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    void Promise.all([loadBuildingDistribution(pointId), loadBuildingEquipment(pointId)])
      .then(([document, equipment]) => {
        setDraft(document)
        setReservedByEquipment(new Set(equipment.ports.filter(port => port.fiber).map(port => fiberEndKey(port.fiber!))))
      }).catch(reason => setError(reason instanceof Error ? reason.message : 'Rozvody se nepodařilo načíst.'))
    void listCables().then(setCatalogCables)
      .catch(() => setCatalogError('Katalog kabelů není dostupný.'))
    return () => dialog?.close()
  }, [pointId])
  const close = () => { if (!dirty || window.confirm('Zavřít editor a zahodit neuložené změny?')) onClose() }
  const select = (item: Selection) => { setSelection(item); setMobileView('detail'); setPath(null); onTrace(null) }
  const update = (next: BuildingDistributionDocument) => {
    setDraft(next); setDirty(true); setSaved(false); setError(''); setPath(null); onTrace(null)
  }
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
    update({ ...draft, risers: [...draft.risers, item] }); select({ kind: 'riser', id: item.id })
  }
  const addBox = (riserId: string) => {
    if (!draft) return
    const item: FloorBox = { id: crypto.randomUUID(), riserId, name: `Box ${draft.boxes.filter(box => box.riserId === riserId).length + 1}`, floor: 1 }
    update({ ...draft, boxes: [...draft.boxes, item] }); select({ kind: 'box', id: item.id })
  }
  const addPremise = (boxId: string) => {
    if (!draft) return
    const item: HomePremise = { id: crypto.randomUUID(), boxId,
      label: `HP ${draft.premises.length + 1}`, status: 'planned', fiber: null, indoorCable: null }
    update({ ...draft, premises: [...draft.premises, item] }); select({ kind: 'premise', id: item.id })
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
    setMobileView('list')
  }
  const save = async () => {
    if (!draft || !dirty || busy) return
    if (draft.risers.some(item => !item.name.trim()) || draft.boxes.some(item => !item.name.trim())
      || draft.premises.some(item => !item.label.trim())) { setError('Doplňte všechna označení.'); return }
    const missingFiber = draft.premises.find(item => item.status === 'connected' && !item.fiber)
    if (missingFiber) {
      select({ kind: 'premise', id: missingFiber.id })
      setError(`U přípojného místa ${missingFiber.label} vyberte konkrétní vlákno přívodního kabelu.`)
      return
    }
    const invalidIndoor = draft.premises.map(premise => ({ premise, problem: premise.indoorCable && indoorCableError(premise.indoorCable) }))
      .find(item => item.problem)
    if (invalidIndoor) {
      select({ kind: 'premise', id: invalidIndoor.premise.id })
      setError(`${invalidIndoor.premise.label}: ${invalidIndoor.problem}`)
      return
    }
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
  const trace = async () => {
    if (!draft || !selectedPremise || dirty || tracing) return
    setTracing(true); setError('')
    try {
      const [equipment, splices, fiberAllocations] = await Promise.all([
        listBuildingEquipment(), listOpticalSplices(), loadFiberAllocations()])
      const next = tracePremisePath(selectedPremise.id, equipment, routes, installations, splices, [draft])
      setPath(next); setAllocations(fiberAllocations); onTrace(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Cestu se nepodařilo načíst.') }
    finally { setTracing(false) }
  }
  const connected = draft?.premises.filter(isConnectedPremise).length ?? 0
  return createPortal(<dialog ref={dialogRef} className="splice-editor-dialog network-structure-dialog distribution-dialog"
    aria-labelledby="distribution-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="splice-editor-header"><span className="splice-editor-emblem"><Building2 size={23} /></span>
      <div><small>Budova · {pointName}</small><h2 id="distribution-title">Domovní FTTH rozvody</h2></div>
      <button type="button" className="icon-button" onClick={close} aria-label="Zavřít editor"><X size={19} /></button>
    </header>
    <div className="distribution-summary"><span>{countCzech(draft?.risers.length ?? 0, 'stoupačka', 'stoupačky', 'stoupaček')}</span>
      <span>{countCzech(draft?.boxes.length ?? 0, 'podlažní box', 'podlažní boxy', 'podlažních boxů')}</span>
      <span>Připojená HP <strong>{connected}/{draft?.premises.length ?? 0}</strong></span></div>
    <nav className="distribution-mobile-tabs" aria-label="Zobrazení domovního rozvodu">
      <button type="button" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}>Přehled</button>
      <button type="button" aria-pressed={mobileView === 'detail'} disabled={!selection}
        onClick={() => setMobileView('detail')}>Detail prvku</button>
    </nav>
    <div className="distribution-layout" data-mobile-view={mobileView}>
      <section className="distribution-list" aria-label="Schéma domovního rozvodu">
        <div className="distribution-list-heading"><div><small>VCHODY A PODLAŽÍ</small><h3>Rozvod v budově</h3></div>
          <button type="button" className="move-button" onClick={addRiser} disabled={!draft}><Plus size={15} /> Stoupačka</button></div>
        {!draft && !error && <p>Načítání rozvodu…</p>}
        {draft?.risers.length === 0 && <div className="distribution-empty"><Building2 size={28} />
          <strong>Začněte stoupačkou</strong><p>Pro každý vchod můžete vytvořit vlastní stoupačku. Do ní přidáte boxy na podlažích a přípojná místa bytů.</p></div>}
        {draft?.risers.map(riser => <div className="distribution-riser" key={riser.id}>
          <button type="button" className={`distribution-row${selection?.id === riser.id ? ' selected' : ''}`}
            onClick={() => select({ kind: 'riser', id: riser.id })}><Building2 size={17} /><span><strong>{riser.name}</strong><small>{riser.cableItemId ? 'Přívodní kabel přiřazen' : 'Bez přívodního kabelu'}</small></span></button>
          {draft.boxes.filter(box => box.riserId === riser.id).sort((a, b) => b.floor - a.floor).map(box =>
            <div className="distribution-box" key={box.id}>
              <button type="button" className={`distribution-row${selection?.id === box.id ? ' selected' : ''}`}
                onClick={() => select({ kind: 'box', id: box.id })}><span className="distribution-floor">{box.floor}</span>
                <span><strong>{box.name}</strong><small>{box.floor}. podlaží · {draft.premises.filter(item => item.boxId === box.id).length} HP</small></span></button>
              <div className="distribution-premises">{draft.premises.filter(item => item.boxId === box.id).map(premise =>
                <button type="button" key={premise.id} className={`distribution-premise${selection?.id === premise.id ? ' selected' : ''}${isConnectedPremise(premise) ? ' connected' : ''}`}
                  onClick={() => select({ kind: 'premise', id: premise.id })}>
                  <span className="distribution-status-dot" /><strong>{premise.label}</strong>
                  <small>{isConnectedPremise(premise) ? premise.indoorCable ? 'Připojeno · domovní přívod' : 'Připojeno'
                    : premise.status === 'connected' ? 'Vyberte vlákno' : 'Plánováno'}</small></button>)}</div>
            </div>)}
          <button type="button" className="distribution-add" onClick={() => addBox(riser.id)}><Plus size={14} /> Podlažní box</button>
        </div>)}
      </section>
      <section className="distribution-detail" aria-label="Detail vybraného prvku">
        {!selection && <div className="distribution-empty"><strong>Vyberte prvek vlevo</strong>
          <p>Stoupačka představuje rozvod v jednom vchodu. Box patří na podlaží a HP je přípojné místo bytu nebo prostoru.</p></div>}
        {selection && <><div className="distribution-detail-heading"><div><small>VYBRANÝ PRVEK · {selectedRiser ? 'STOUPAČKA' : selectedBox ? 'PODLAŽNÍ BOX' : 'PŘÍPOJNÉ MÍSTO (HP)'}</small>
          <h3>{selectedRiser?.name ?? selectedBox?.name ?? selectedPremise?.label}</h3></div></div>
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
              <select aria-invalid={!selectedPremise.fiber} value={selectedPremise.fiber ? fiberEndKey(selectedPremise.fiber) : ''} onChange={event => {
                const option = fiberOptions.find(item => fiberEndKey(item.end) === event.target.value)
                setPremise({ ...selectedPremise, fiber: (option?.end ?? null) as FiberEnd | null })
              }}><option value="">Vyberte volné vlákno</option>
                {fiberOptions.map(option => <option key={fiberEndKey(option.end)} value={fiberEndKey(option.end)}
                  disabled={occupied.has(fiberEndKey(option.end))}>{option.label}</option>)}</select>
              {!selectedPremise.fiber && <small>Vyberte vlákno, aby bylo možné HP uložit jako připojené.</small>}</label>}
            {!selectedCable && <p className="equipment-note">Pro připojení nejdříve vyberte přívodní kabel u stoupačky.</p>}
            <p className="equipment-note">HP eviduje cílové místo. Číslo bytu ani jméno obyvatele nemusíte zadávat.</p>
            <IndoorCableFields run={selectedPremise.indoorCable} cables={catalogCables} catalogError={catalogError}
              onChange={indoorCable => setPremise({ ...selectedPremise, indoorCable })} />
            <div className="distribution-trace-action"><button type="button" className="move-button"
              onClick={() => void trace()} disabled={dirty || tracing || selectedPremise.status !== 'connected' || !selectedPremise.fiber}>
              <Link2 size={16} /> {tracing ? 'Hledám cestu…' : 'Sledovat cestu k OLT'}</button>
              {dirty && <small>Nejdříve uložte změny rozvodu.</small>}
              {selectedPremise.status !== 'connected' && <small>Plánované HP zatím nemá přiřazené vlákno.</small>}</div>
            {path && <div className={`equipment-path distribution-path ${path.status}`} role="status">
              <strong>{path.status === 'connected' ? 'Přiřazené vlákno dohledáno k OLT' : path.status === 'ambiguous' ? 'Nejednoznačná cesta' : 'Cesta není úplná'}</strong>
              <p>{path.message}</p>
              {path.steps.length > 0 && <OpticalPathSteps path={path}
                allocations={allocations} onOpenRoute={onOpenRoute} />}
              {path.routeIds.length > 0 && <p>Počet zvýrazněných úseků na mapě: {path.routeIds.length}</p>}
              {path.routeIds.length > 0 && <button type="button" className="move-button" onClick={onViewMap}>Zobrazit celou cestu na mapě</button>}
              {path.status === 'connected' && <button type="button" className="move-button"
                onClick={() => onBudget(path)}>Přenést do kalkulačky</button>}
            </div>}</>}
          <div className="network-structure-remove"><button type="button" onClick={removeSelected}>
            <Trash2 size={15} /> Odebrat prvek…</button></div>
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
