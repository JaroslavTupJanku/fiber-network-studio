import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, Check, CircleHelp, Link2, Plus, Save, Trash2, X } from 'lucide-react'
import { loadBuildingEquipment, listBuildingEquipment, saveBuildingEquipment,
  type BuildingEquipmentDocument, type EquipmentPort } from './buildingEquipment'
import { isConnectedPremise, listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { fiberEndKey, listOpticalSplices, spliceCableEnds, type OpticalSpliceDocument } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'
import { traceOpticalPath, tracePortToPremise, type OpticalPath } from './traceOpticalPath'
import { countCzech, portLocation } from './equipmentPresentation'

type Selection = { kind: 'rack' | 'shelf' | 'card' | 'port'; id: string }
const id = () => crypto.randomUUID()

export function BuildingEquipmentEditor({ pointId, pointName, pointNames, routes, installations, onClose, onSaved, onTrace, onBudget }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  pointNames: Record<string, string>
  onClose: () => void; onSaved: (document: BuildingEquipmentDocument) => void
  onTrace: (path: OpticalPath | null) => void; onBudget: (path: OpticalPath) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BuildingEquipmentDocument | null>(null)
  const [otherEquipment, setOtherEquipment] = useState<BuildingEquipmentDocument[]>([])
  const [splices, setSplices] = useState<OpticalSpliceDocument[]>([])
  const [distributions, setDistributions] = useState<BuildingDistributionDocument[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [portCount, setPortCount] = useState(8)
  const [portQuery, setPortQuery] = useState('')
  const [path, setPath] = useState<OpticalPath | null>(null)
  const [branchSelections, setBranchSelections] = useState<Record<string, number>>({})
  const [targetPremiseId, setTargetPremiseId] = useState('')
  const select = (next: Selection) => {
    setSelection(next); setMobileView('detail'); setPath(null); setBranchSelections({}); setTargetPremiseId(''); onTrace(null)
  }
  const cables = useMemo(() => spliceCableEnds(pointId, routes, installations), [pointId, routes, installations])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => {
    let live = true
    Promise.all([loadBuildingEquipment(pointId), listBuildingEquipment(), listOpticalSplices(), listBuildingDistribution()])
      .then(([document, all, spliceList, homes]) => { if (live) {
        setDraft(document); setOtherEquipment(all); setSplices(spliceList); setDistributions(homes)
      } })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'Údaje se nepodařilo načíst.') })
    return () => { live = false }
  }, [pointId])
  const update = (next: BuildingEquipmentDocument) => {
    setDraft(next); setDirty(true); setSaved(false); setPath(null); setBranchSelections({}); onTrace(null); setError('')
  }
  const close = () => {
    if (!dirty || window.confirm('Zavřít editor a zahodit neuložené změny?')) onClose()
  }
  const shelfById = new Map(draft?.shelves.map(shelf => [shelf.id, shelf]) ?? [])
  const portById = new Map(draft?.ports.map(port => [port.id, port]) ?? [])
  const selected = selection?.kind === 'rack' ? draft?.racks.find(item => item.id === selection.id)
    : selection?.kind === 'shelf' ? draft?.shelves.find(item => item.id === selection.id)
      : selection?.kind === 'card' ? draft?.cards.find(item => item.id === selection.id)
        : draft?.ports.find(item => item.id === selection?.id)
  const selectedPort = selection?.kind === 'port' ? draft?.ports.find(item => item.id === selection.id) : null
  const selectedCard = selection?.kind === 'card' ? draft?.cards.find(item => item.id === selection.id) : null
  const selectedShelf = selection?.kind === 'shelf' ? shelfById.get(selection.id)
    : selectedCard ? shelfById.get(selectedCard.shelfId)
      : selectedPort ? shelfById.get(draft?.cards.find(card => card.id === selectedPort.parentId)?.shelfId ?? selectedPort.parentId) : null
  const selectedRack = selection?.kind === 'rack' ? draft?.racks.find(item => item.id === selection.id)
    : draft?.racks.find(item => item.id === selectedShelf?.rackId)
  const selectedLocation = selectedPort && draft ? portLocation(draft, selectedPort)
    : [selectedRack?.name, selectedShelf ? `${selectedShelf.kind.toUpperCase()} ${selectedShelf.name}` : null,
      selectedCard?.name].filter(Boolean).join(' / ')
  const selectedOdf = selectedPort ? shelfById.get(selectedPort.parentId)?.kind === 'odf' : false
  const selectedOlt = selectedShelf?.kind === 'olt'
  const targetPremises = distributions.flatMap(document => document.premises
    .filter(isConnectedPremise)
    .map(premise => {
      const box = document.boxes.find(item => item.id === premise.boxId)
      const riser = document.risers.find(item => item.id === box?.riserId)
      return { id: premise.id, label: `${pointNames[document.pointId] ?? 'Budova'} / ${riser?.name ?? 'Vchod'} / ${box?.name ?? 'Box'} / ${premise.label}` }
    })).sort((a, b) => a.label.localeCompare(b.label, 'cs'))
  const occupied = new Set(draft?.ports.filter(port => port.id !== selectedPort?.id && port.fiber)
    .map(port => fiberEndKey(port.fiber!)) ?? [])
  for (const premise of distributions.find(document => document.pointId === pointId)?.premises ?? []) {
    if (isConnectedPremise(premise)) occupied.add(fiberEndKey(premise.fiber!))
  }
  const fiberOptions = cables.flatMap(cable => cable.cable?.tubes.flatMap((tube, tubeIndex) =>
    tube.fibers.map((fiber, fiberIndex) => ({ end: { itemId: cable.id, tubeIndex, fiberIndex },
      label: `${cable.label} · ${tube.name} · ${fiber.name || `vlákno ${fiberIndex + 1}`}` }))) ?? [])
  const changePort = (port: EquipmentPort) => update({ ...draft!, ports: draft!.ports.map(item => item.id === port.id ? port : item) })
  const addRack = () => {
    if (!draft) return
    const rack = { id: id(), name: `ODF/OLT stojan ${draft.racks.length + 1}` }
    update({ ...draft, racks: [...draft.racks, rack] }); select({ kind: 'rack', id: rack.id })
  }
  const addShelf = (rackId: string, kind: 'odf' | 'olt') => {
    if (!draft) return
    const shelf = { id: id(), rackId, kind, name: `Police ${draft.shelves.filter(item => item.rackId === rackId && item.kind === kind).length + 1}` }
    update({ ...draft, shelves: [...draft.shelves, shelf] }); select({ kind: 'shelf', id: shelf.id })
  }
  const addCard = (shelfId: string) => {
    if (!draft) return
    const card = { id: id(), shelfId, name: `Karta ${draft.cards.filter(item => item.shelfId === shelfId).length + 1}` }
    update({ ...draft, cards: [...draft.cards, card] }); select({ kind: 'card', id: card.id })
  }
  const addPorts = (parentId: string) => {
    if (!draft || !Number.isInteger(portCount) || portCount < 1 || portCount > 48) return
    const existing = draft.ports.filter(port => port.parentId === parentId)
    const next = Array.from({ length: portCount }, (_, index) => {
      let position = index + 1
      while (existing.some(port => port.position === position)) position += 1
      existing.push({ id: id(), parentId, position, label: `Port ${position}`, fiber: null, patchPortId: null })
      return existing.at(-1)!
    })
    update({ ...draft, ports: [...draft.ports, ...next] }); select({ kind: 'port', id: next[0].id })
  }
  const removeSelected = () => {
    if (!draft || !selection) return
    const shelfIds = new Set(selection.kind === 'rack' ? draft.shelves.filter(item => item.rackId === selection.id).map(item => item.id)
      : selection.kind === 'shelf' ? [selection.id] : [])
    const cardIds = new Set(selection.kind === 'card' ? [selection.id]
      : draft.cards.filter(item => shelfIds.has(item.shelfId)).map(item => item.id))
    const portIds = new Set(selection.kind === 'port' ? [selection.id]
      : draft.ports.filter(item => shelfIds.has(item.parentId) || cardIds.has(item.parentId)).map(item => item.id))
    const descendants = shelfIds.size + cardIds.size + portIds.size - (selection.kind === 'port' || selection.kind === 'card' || selection.kind === 'shelf' ? 1 : 0)
    if (descendants > 0 && !window.confirm(`Odebrat prvek včetně ${descendants} vnořených prvků a jejich propojení?`)) return
    update({ ...draft,
      racks: draft.racks.filter(item => item.id !== (selection.kind === 'rack' ? selection.id : '')),
      shelves: draft.shelves.filter(item => !shelfIds.has(item.id)),
      cards: draft.cards.filter(item => !cardIds.has(item.id)),
      ports: draft.ports.filter(item => !portIds.has(item.id)).map(item =>
        portIds.has(item.patchPortId ?? '') ? { ...item, patchPortId: null } : item),
    }); setSelection(null); setMobileView('list')
  }
  const setPatch = (targetId: string | null) => {
    if (!draft || !selectedPort) return
    update({ ...draft, ports: draft.ports.map(port => {
      if (port.id === selectedPort.id) return { ...port, patchPortId: targetId }
      if (port.id === targetId) return { ...port, patchPortId: selectedPort.id }
      if (port.id === selectedPort.patchPortId || (targetId && port.patchPortId === targetId)) return { ...port, patchPortId: null }
      return port
    }) })
  }
  const save = async () => {
    if (!draft) return
    setBusy(true); setError('')
    try {
      const next = await saveBuildingEquipment(draft)
      setDraft(next); setOtherEquipment(current => [...current.filter(item => item.pointId !== pointId), next])
      setDirty(false); setSaved(true); onSaved(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vybavení se nepodařilo uložit.') }
    finally { setBusy(false) }
  }
  const trace = (choices: Record<string, number> = branchSelections, targetId = targetPremiseId) => {
    if (!selectedPort || !draft) return
    const allEquipment = [...otherEquipment.filter(item => item.pointId !== pointId), draft]
    const next = targetId && selectedOlt
      ? tracePortToPremise(selectedPort.id, targetId, allEquipment, routes, installations, splices, distributions)
      : traceOpticalPath(selectedPort.id, allEquipment, routes, installations, splices, choices, distributions)
    setPath(next); onTrace(next)
  }
  const selectBranch = (splitterId: string, position: number) => {
    const choices = { ...branchSelections, [splitterId]: position }
    setBranchSelections(choices)
    trace(choices)
  }
  const rename = (name: string) => {
    if (!draft || !selection) return
    const key = selection.kind === 'port' ? 'label' : 'name'
    const listKey = selection.kind === 'rack' ? 'racks' : selection.kind === 'shelf' ? 'shelves'
      : selection.kind === 'card' ? 'cards' : 'ports'
    update({ ...draft, [listKey]: draft[listKey].map(item => item.id === selection.id ? { ...item, [key]: name } : item) })
  }
  const visiblePort = (port: EquipmentPort) => !portQuery.trim() || !!draft && portLocation(draft, port)
    .toLocaleLowerCase('cs').includes(portQuery.trim().toLocaleLowerCase('cs'))
  const visibleRack = (rackId: string) => !portQuery.trim() || !!draft && draft.ports.some(port => {
    const shelf = shelfById.get(draft.cards.find(card => card.id === port.parentId)?.shelfId ?? port.parentId)
    return shelf?.rackId === rackId && visiblePort(port)
  })
  return createPortal(<dialog ref={dialogRef} className="splice-editor-dialog equipment-dialog"
    aria-labelledby="equipment-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="splice-editor-header"><span className="splice-editor-emblem"><Cable size={23} /></span>
      <div><small>Budova · {pointName}</small><h2 id="equipment-title">Optické vybavení</h2></div>
      <button type="button" className="icon-button" onClick={close} aria-label="Zavřít editor"><X size={19} /></button>
    </header>
    <nav className="equipment-mobile-tabs" aria-label="Zobrazení optického vybavení">
      <button type="button" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}>Stojany a porty</button>
      <button type="button" aria-pressed={mobileView === 'detail'} disabled={!selection}
        onClick={() => setMobileView('detail')}>Detail prvku</button>
    </nav>
    <div className="equipment-layout" data-mobile-view={mobileView}>
      <div className="equipment-tree"><div className="equipment-section-title"><div><small>UMÍSTĚNÍ</small><h3>Stojany a porty</h3></div>
        <button type="button" className="move-button" onClick={addRack}><Plus size={15} /> Stojan</button></div>
        {!draft && !error && <p>Načítání vybavení…</p>}
        {draft?.racks.length === 0 && <p className="equipment-empty">Začněte stojanem. Do něj vložíte ODF nebo OLT polici.</p>}
        {(draft?.ports.length ?? 0) > 16 && <label className="equipment-search">Najít port
          <input type="search" value={portQuery} onChange={event => setPortQuery(event.target.value)}
            placeholder="Stojan, police, karta nebo port" /></label>}
        {portQuery && draft && !draft.ports.some(visiblePort) && <p className="equipment-empty">Žádný port neodpovídá hledání.</p>}
        {draft?.racks.filter(rack => visibleRack(rack.id)).map(rack => <div className="equipment-rack" key={rack.id}>
          <button type="button" className={selection?.id === rack.id ? 'equipment-row selected' : 'equipment-row'}
            onClick={() => select({ kind: 'rack', id: rack.id })}><strong>{rack.name}</strong></button>
          {draft.shelves.filter(shelf => shelf.rackId === rack.id && (!portQuery || draft.ports.some(port =>
            (port.parentId === shelf.id || draft.cards.some(card => card.id === port.parentId && card.shelfId === shelf.id)) && visiblePort(port))))
            .map(shelf => <div className="equipment-shelf" key={shelf.id}>
            <button type="button" className={selection?.id === shelf.id ? 'equipment-row selected' : 'equipment-row'}
              onClick={() => select({ kind: 'shelf', id: shelf.id })}><span className="equipment-kind">{shelf.kind.toUpperCase()}</span> {shelf.name}</button>
            {shelf.kind === 'olt' && draft.cards.filter(card => card.shelfId === shelf.id && (!portQuery || draft.ports.some(port =>
              port.parentId === card.id && visiblePort(port)))).map(card =>
              <div className="equipment-card" key={card.id}>
                <button type="button" className={selection?.id === card.id ? 'equipment-row selected' : 'equipment-row'}
                  onClick={() => select({ kind: 'card', id: card.id })}>{card.name}</button>
                <div className="equipment-ports">{draft.ports.filter(port => port.parentId === card.id && visiblePort(port)).map(port =>
                  <button type="button" key={port.id} className={`equipment-port${selection?.id === port.id ? ' selected' : ''}${port.patchPortId ? ' linked' : ''}`}
                    aria-label={`${portLocation(draft, port)} · ${port.patchPortId ? 'propojeno' : 'volný port'}`}
                    title={`${portLocation(draft, port)} · ${port.patchPortId ? 'propojeno' : 'volný port'}`}
                    onClick={() => select({ kind: 'port', id: port.id })}>{port.position}{port.patchPortId ? ' ·' : ''}</button>)}</div>
              </div>)}
            {shelf.kind === 'odf' && <div className="equipment-ports">{draft.ports.filter(port => port.parentId === shelf.id && visiblePort(port)).map(port =>
              <button type="button" key={port.id} className={`equipment-port${selection?.id === port.id ? ' selected' : ''}${port.fiber || port.patchPortId ? ' linked' : ''}`}
                aria-label={`${portLocation(draft, port)} · ${port.fiber ? 'vlákno připojeno' : 'bez vlákna'}${port.patchPortId ? ', propojeno s OLT' : ''}`}
                title={`${portLocation(draft, port)} · ${port.fiber ? 'vlákno připojeno' : 'bez vlákna'}${port.patchPortId ? ', propojeno s OLT' : ''}`}
                onClick={() => select({ kind: 'port', id: port.id })}>{port.position}{port.fiber || port.patchPortId ? ' ·' : ''}</button>)}</div>}
          </div>)}
        </div>)}
        {(draft?.ports.length ?? 0) > 0 && <p className="equipment-tree-hint">Tečka označuje port s připojeným vláknem nebo propojkou.</p>}
      </div>
      <div className="equipment-detail"><small>VYBRANÝ PRVEK</small>
        {!selected && <div className="equipment-empty"><CircleHelp size={25} /><h3>Vyberte prvek vlevo</h3>
          <p>Stojan obsahuje police. ODF police ukončuje vlákna kabelu, OLT police obsahuje karty a jejich porty.</p></div>}
        {selected && draft && <><div className="equipment-detail-heading"><h3>{selection?.kind === 'port' ? 'Port' : selection?.kind === 'card' ? 'OLT karta' : selection?.kind === 'shelf' ? `${selectedShelf?.kind.toUpperCase()} police` : 'Stojan'}</h3>
          <button type="button" className="icon-button" onClick={removeSelected} title="Odebrat prvek" aria-label="Odebrat prvek"><Trash2 size={17} /></button></div>
          <p className="equipment-location" aria-label="Umístění vybraného prvku">{selectedLocation}</p>
          <label className="equipment-field">Název<input maxLength={80} value={'label' in selected ? selected.label : selected.name}
            onChange={event => rename(event.target.value)} /></label>
          {selection?.kind === 'rack' && <div className="equipment-actions"><button type="button" className="move-button" onClick={() => addShelf(selection.id, 'odf')}><Plus size={15} /> ODF police</button>
            <button type="button" className="move-button" onClick={() => addShelf(selection.id, 'olt')}><Plus size={15} /> OLT police</button></div>}
          {selection?.kind === 'shelf' && shelfById.get(selection.id)?.kind === 'olt' &&
            <button type="button" className="move-button" onClick={() => addCard(selection.id)}><Plus size={15} /> OLT karta</button>}
          {(selection?.kind === 'card' || selection?.kind === 'shelf' && shelfById.get(selection.id)?.kind === 'odf') &&
            <div className="equipment-generate"><label>Počet nových portů<input type="number" min="1" max="48" value={portCount}
              onChange={event => setPortCount(Number(event.target.value))} /></label>
              <button type="button" className="move-button" onClick={() => addPorts(selection.id)} disabled={portCount < 1 || portCount > 48}><Plus size={15} /> Vytvořit porty</button></div>}
          {selectedPort && <><p className="equipment-note">Pozice {selectedPort.position}. {selectedOdf
            ? 'Tento ODF port může ukončit jedno vlákno přivedeného kabelu.'
            : 'Tento OLT port můžete propojit s jedním ODF portem.'}</p>
            {selectedOdf && <label className="equipment-field">Ukončené vlákno<select value={selectedPort.fiber ? fiberEndKey(selectedPort.fiber) : ''}
              onChange={event => { const option = fiberOptions.find(item => fiberEndKey(item.end) === event.target.value)
                changePort({ ...selectedPort, fiber: option?.end ?? null }) }}><option value="">Bez vlákna</option>
              {fiberOptions.map(option => <option key={fiberEndKey(option.end)} value={fiberEndKey(option.end)}
                disabled={occupied.has(fiberEndKey(option.end))}>{option.label}</option>)}</select></label>}
            <label className="equipment-field">Propojka na {selectedOdf ? 'OLT' : 'ODF'} port<select value={selectedPort.patchPortId ?? ''}
              onChange={event => setPatch(event.target.value || null)}><option value="">Bez propojky</option>
              {draft.ports.filter(port => port.id !== selectedPort.id && !port.patchPortId &&
                (shelfById.get(port.parentId)?.kind === 'odf') !== selectedOdf)
                .concat(selectedPort.patchPortId && portById.get(selectedPort.patchPortId) ? [portById.get(selectedPort.patchPortId)!] : [])
                .map(port => <option key={port.id} value={port.id}>{portLocation(draft, port)}</option>)}</select></label>
            {selectedOlt && targetPremises.length === 0 && <p className="equipment-note">Zatím není evidováno žádné HP připojené k vláknu. Cestu můžete sledovat po dostupných portech a kabelech.</p>}
            {selectedOlt && targetPremises.length > 0 && <label className="equipment-field">Cílové přípojné místo (volitelné)
              <select value={targetPremiseId} onChange={event => {
                const id = event.target.value
                setTargetPremiseId(id); setBranchSelections({});
                if (id) trace({}, id)
                else { setPath(null); onTrace(null) }
              }}><option value="">Bez cíle – větev splitteru vyberu ručně</option>
                {targetPremises.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <small>Vyberte HP a aplikace ověří cestu právě z tohoto OLT portu.</small></label>}
            <button type="button" className="move-button" onClick={() => { setBranchSelections({}); trace({}) }}>
              <Link2 size={16} /> {targetPremiseId ? 'Ověřit cestu k HP' : 'Sledovat optickou cestu'}</button>
            {path && <div className={`equipment-path ${path.status}`}><strong>{path.status === 'connected' ? path.endPremiseId ? 'Vlákno dohledáno k HP' : 'Port je propojený' : path.status === 'ambiguous' ? 'Nejednoznačná cesta' : 'Otevřená cesta'}</strong>
              <p>{path.message}</p>{[...new Set(path.branchChoices.map(choice => choice.splitterId))].map((splitterId, index) =>
                <label className="equipment-field" key={splitterId}>Sledovat výstup splitteru {index + 1}
                  <select value={branchSelections[splitterId] ?? ''} onChange={event => {
                    if (event.target.value) selectBranch(splitterId, Number(event.target.value))
                  }}><option value="">Vyberte výstup</option>
                    {path.branchChoices.filter(choice => choice.splitterId === splitterId).map(choice =>
                      <option key={choice.position} value={choice.position}>{choice.label}</option>)}
                  </select></label>)}{path.steps.length > 0 && <ol>{path.steps.map((step, index) =>
                <li key={index}>{step.label}</li>)}</ol>}
              {path.routeIds.length > 0 && <p>Počet zvýrazněných úseků na mapě: {path.routeIds.length}</p>}
              {dirty && <p>Jde o náhled neuložených změn. Před přenosem cestu uložte.</p>}
              {path.status === 'connected' && path.steps.some(step => step.routeId) && <button type="button" className="move-button" disabled={dirty}
                onClick={() => onBudget(path)}>Přenést do kalkulačky</button>}</div>}
          </>}
        </>}
        {cables.length === 0 && <p className="equipment-note">Do budovy zatím nevede koncový kabel. Porty můžete připravit; vlákno připojíte po osazení trasy.</p>}
      </div>
    </div>
    {error && <p className="form-error equipment-message" role="alert">{error}</p>}
    {saved && <p className="installation-saved equipment-message" role="status"><Check size={15} /> Vybavení uloženo.</p>}
    <footer className="splice-editor-footer"><span>{draft ? `${countCzech(draft.racks.length, 'stojan', 'stojany', 'stojanů')} · ${countCzech(draft.ports.length, 'port', 'porty', 'portů')}` : ''}</span><div>
      <button type="button" className="move-button" onClick={close}>Zavřít</button>
      <button type="button" className="primary-button" onClick={() => void save()} disabled={!draft || busy}><Save size={16} /> {busy ? 'Ukládání…' : 'Uložit vybavení'}</button>
    </div></footer>
  </dialog>, globalThis.document.body)
}
