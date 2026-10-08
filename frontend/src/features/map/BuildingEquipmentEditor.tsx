import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, Check, ChevronDown, ChevronRight, CircleHelp, Link2, Plus, Save, Trash2, X } from 'lucide-react'
import { loadBuildingEquipment, listBuildingEquipment, saveBuildingEquipment,
  type BuildingEquipmentDocument, type EquipmentPort } from './buildingEquipment'
import { isConnectedPremise, listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { fiberEndKey, listOpticalSplices, spliceCableEnds, type OpticalSpliceDocument } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'
import { traceOpticalPath, tracePortToPremise, type OpticalPath } from './traceOpticalPath'
import { countCzech, portLocation } from './equipmentPresentation'
import { cableFibers, previewPortAssignments } from './fiberBatch'
import { allocationConflicts, loadFiberAllocations, pathAllocatedFibers, saveFiberAllocations,
  type FiberAllocationDocument } from './fiberAllocations'
import { OpticalPathSteps } from './OpticalPathSteps'

type Selection = { kind: 'rack' | 'shelf' | 'card' | 'port'; id: string }
const id = () => crypto.randomUUID()

function portStatus(port: EquipmentPort): string {
  if (port.fiber && port.patchPortId) return 'Vlákno a propojka'
  if (port.fiber) return 'Připojené vlákno'
  if (port.patchPortId) return 'Propojený'
  return 'Volný'
}

function PortButton({ port, document, selected, onSelect }: {
  port: EquipmentPort; document: BuildingEquipmentDocument; selected: boolean; onSelect: () => void
}) {
  const status = portStatus(port)
  return <button type="button" className={`equipment-port${selected ? ' selected' : ''}${status !== 'Volný' ? ' linked' : ''}`}
    aria-label={`${portLocation(document, port)} · ${status}`} title={`${portLocation(document, port)} · ${status}`}
    onClick={onSelect}><strong>P{port.position}</strong><span>{status}</span></button>
}

export function BuildingEquipmentEditor({ pointId, pointName, pointNames, routes, installations, onClose, onSaved, onTrace, onBudget, onOpenRoute, onViewMap }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  pointNames: Record<string, string>
  onClose: () => void; onSaved: (document: BuildingEquipmentDocument) => void
  onTrace: (path: OpticalPath | null) => void; onBudget: (path: OpticalPath) => void
  onOpenRoute: (routeId: string) => void; onViewMap: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BuildingEquipmentDocument | null>(null)
  const [otherEquipment, setOtherEquipment] = useState<BuildingEquipmentDocument[]>([])
  const [splices, setSplices] = useState<OpticalSpliceDocument[]>([])
  const [distributions, setDistributions] = useState<BuildingDistributionDocument[]>([])
  const [allocations, setAllocations] = useState<FiberAllocationDocument | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [portCount, setPortCount] = useState(8)
  const [bulkCableId, setBulkCableId] = useState('')
  const [bulkFirstFiber, setBulkFirstFiber] = useState(0)
  const [bulkFirstPort, setBulkFirstPort] = useState(1)
  const [bulkCount, setBulkCount] = useState(8)
  const [portQuery, setPortQuery] = useState('')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [path, setPath] = useState<OpticalPath | null>(null)
  const [branchSelections, setBranchSelections] = useState<Record<string, number>>({})
  const [targetPremiseId, setTargetPremiseId] = useState('')
  const [allocationLabel, setAllocationLabel] = useState('')
  const [allocationStatus, setAllocationStatus] = useState<'reserved' | 'used'>('reserved')
  const [allocationBusy, setAllocationBusy] = useState(false)
  const select = (next: Selection) => {
    setSelection(next); setMobileView('detail'); setPath(null); setBranchSelections({}); setTargetPremiseId(''); onTrace(null)
  }
  const toggleCollapsed = (itemId: string) => setCollapsedIds(current => {
    const next = new Set(current)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    return next
  })
  const cables = useMemo(() => spliceCableEnds(pointId, routes, installations), [pointId, routes, installations])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => {
    let live = true
    Promise.all([loadBuildingEquipment(pointId), listBuildingEquipment(), listOpticalSplices(),
      listBuildingDistribution(), loadFiberAllocations()])
      .then(([document, all, spliceList, homes, fiberAllocations]) => { if (live) {
        setDraft(document); setOtherEquipment(all); setSplices(spliceList); setDistributions(homes)
        setAllocations(fiberAllocations)
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
    : [selectedRack?.name, selectedShelf?.name,
      selectedCard?.name].filter(Boolean).join(' / ')
  const selectedOdf = selectedPort ? shelfById.get(selectedPort.parentId)?.kind === 'odf' : false
  const selectedOlt = selectedShelf?.kind === 'olt'
  const targetPremises = distributions.flatMap(document => document.premises
    .filter(isConnectedPremise)
    .map(premise => {
      const box = document.boxes.find(item => item.id === premise.boxId)
      const riser = document.risers.find(item => item.id === box?.riserId)
      return { id: premise.id, label: [pointNames[document.pointId] ?? 'Budova', riser?.name, box?.name, premise.label].filter(Boolean).join(' / ') }
    })).sort((a, b) => a.label.localeCompare(b.label, 'cs'))
  const occupied = new Set(draft?.ports.filter(port => port.id !== selectedPort?.id && port.fiber)
    .map(port => fiberEndKey(port.fiber!)) ?? [])
  for (const premise of distributions.find(document => document.pointId === pointId)?.premises ?? []) {
    if (isConnectedPremise(premise)) occupied.add(fiberEndKey(premise.fiber!))
  }
  const bulkCable = cables.find(item => item.id === bulkCableId)
  const bulkPorts = draft?.ports.filter(port => port.parentId === selectedShelf?.id) ?? []
  const bulkOccupied = new Set(draft?.ports.filter(port => port.fiber).map(port => fiberEndKey(port.fiber!)) ?? [])
  for (const premise of distributions.find(document => document.pointId === pointId)?.premises ?? []) {
    if (isConnectedPremise(premise)) bulkOccupied.add(fiberEndKey(premise.fiber!))
  }
  const bulkPreview = previewPortAssignments(bulkPorts, bulkCable, bulkFirstPort, bulkFirstFiber, bulkCount, bulkOccupied)
  const fiberOptions = cables.flatMap(cable => cable.cable?.tubes.flatMap((tube, tubeIndex) =>
    tube.fibers.map((fiber, fiberIndex) => ({ end: { itemId: cable.id, tubeIndex, fiberIndex },
      label: `${cable.label} · ${tube.name} · ${fiber.name || `vlákno ${fiberIndex + 1}`}` }))) ?? [])
  const changePort = (port: EquipmentPort) => update({ ...draft!, ports: draft!.ports.map(item => item.id === port.id ? port : item) })
  const addRack = () => {
    if (!draft) return
    const rack = { id: id(), name: `Stojan ${draft.racks.length + 1}` }
    update({ ...draft, racks: [...draft.racks, rack] }); select({ kind: 'rack', id: rack.id })
  }
  const addShelf = (rackId: string, kind: 'odf' | 'olt') => {
    if (!draft) return
    const shelf = { id: id(), rackId, kind, name: `${kind.toUpperCase()} ${draft.shelves.filter(item => item.rackId === rackId && item.kind === kind).length + 1}` }
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
  const pathFibers = path ? pathAllocatedFibers(path) : []
  const conflictingAllocations = allocationConflicts(pathFibers, allocations?.allocations ?? [])
  const reservePath = async () => {
    if (!allocations || !path || path.status !== 'connected' || !pathFibers.length
        || !allocationLabel.trim() || conflictingAllocations.length || dirty || allocationBusy) return
    setAllocationBusy(true); setError('')
    try {
      const updated = await saveFiberAllocations({ ...allocations, allocations: [...allocations.allocations, {
        id: crypto.randomUUID(), label: allocationLabel.trim(), status: allocationStatus,
        premiseId: targetPremiseId || path.endPremiseId || null, fibers: pathFibers,
      }] })
      setAllocations(updated); setAllocationLabel('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Využití vláken se nepodařilo uložit.') }
    finally { setAllocationBusy(false) }
  }
  const removeAllocation = async (id: string) => {
    if (!allocations || allocationBusy || !window.confirm('Uvolnit rezervaci nebo službu na celé evidované cestě?')) return
    setAllocationBusy(true); setError('')
    try { setAllocations(await saveFiberAllocations({ ...allocations,
      allocations: allocations.allocations.filter(item => item.id !== id) })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Využití vláken se nepodařilo uvolnit.') }
    finally { setAllocationBusy(false) }
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
  const searchTerm = portQuery.trim().toLocaleLowerCase('cs')
  const matches = (value: string) => value.toLocaleLowerCase('cs').includes(searchTerm)
  const visiblePort = (port: EquipmentPort) => !searchTerm || !!draft
    && (matches(portLocation(draft, port)) || matches(portStatus(port)))
  const visibleCard = (cardId: string, parentMatches = false) => !searchTerm || !!draft
    && (parentMatches || matches(draft.cards.find(card => card.id === cardId)?.name ?? '')
      || draft.ports.some(port => port.parentId === cardId && visiblePort(port)))
  const visibleShelf = (shelfId: string, parentMatches = false) => !searchTerm || !!draft && (() => {
    const shelf = shelfById.get(shelfId)
    return !!shelf && (parentMatches || matches(`${shelf.kind} ${shelf.name}`)
      || draft.cards.some(card => card.shelfId === shelfId && visibleCard(card.id))
      || draft.ports.some(port => port.parentId === shelfId && visiblePort(port)))
  })()
  const visibleRack = (rackId: string) => !searchTerm || !!draft
    && (matches(draft.racks.find(rack => rack.id === rackId)?.name ?? '')
      || draft.shelves.some(shelf => shelf.rackId === rackId && visibleShelf(shelf.id)))
  const isExpanded = (itemId: string) => !!searchTerm || !collapsedIds.has(itemId)
  const odfCount = draft?.shelves.filter(shelf => shelf.kind === 'odf').length ?? 0
  const oltCount = draft?.shelves.filter(shelf => shelf.kind === 'olt').length ?? 0
  const portParentId = selection?.kind === 'card' || selection?.kind === 'shelf' && selectedShelf?.kind === 'odf'
    ? selection.id : null
  const portParentCount = draft?.ports.filter(port => port.parentId === portParentId).length ?? 0
  return createPortal(<dialog ref={dialogRef} className="splice-editor-dialog network-structure-dialog equipment-dialog"
    aria-labelledby="equipment-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="splice-editor-header"><span className="splice-editor-emblem"><Cable size={23} /></span>
      <div><small>Budova · {pointName}</small><h2 id="equipment-title">Optické vybavení</h2></div>
      <button type="button" className="icon-button" onClick={close} aria-label="Zavřít editor"><X size={19} /></button>
    </header>
    <div className="distribution-summary"><span>{countCzech(draft?.racks.length ?? 0, 'stojan', 'stojany', 'stojanů')}</span>
      <span>{odfCount} ODF</span><span>{oltCount} OLT</span>
      <span>{countCzech(draft?.ports.length ?? 0, 'port', 'porty', 'portů')}</span></div>
    <nav className="equipment-mobile-tabs" aria-label="Zobrazení optického vybavení">
      <button type="button" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}>Přehled</button>
      <button type="button" aria-pressed={mobileView === 'detail'} disabled={!selection}
        onClick={() => setMobileView('detail')}>Detail prvku</button>
    </nav>
    <div className="equipment-layout" data-mobile-view={mobileView}>
      <div className="equipment-tree"><div className="equipment-section-title"><div><small>VYBAVENÍ V BUDOVĚ</small><h3>Stojany a zařízení</h3></div>
        <button type="button" className="move-button" onClick={addRack}><Plus size={15} /> Stojan</button></div>
        {!draft && !error && <p>Načítání vybavení…</p>}
        {draft?.racks.length === 0 && <p className="equipment-empty">Začněte stojanem. ODF je optický rozvaděč pro ukončení vláken, OLT je aktivní zařízení poskytovatele. Přidejte jen vybavení, které v budově skutečně je.</p>}
        {draft && <label className="equipment-search">Hledat ve vybavení
          <input type="search" value={portQuery} onChange={event => setPortQuery(event.target.value)}
            placeholder="Stojan, ODF, OLT, karta nebo port" /></label>}
        {portQuery && draft && !draft.racks.some(rack => visibleRack(rack.id))
          && <p className="equipment-empty">Žádný prvek neodpovídá hledání.</p>}
        {draft?.racks.filter(rack => visibleRack(rack.id)).map(rack => {
          const rackMatches = !!searchTerm && matches(rack.name)
          const shelves = draft.shelves.filter(shelf => shelf.rackId === rack.id && visibleShelf(shelf.id, rackMatches))
          return <section className="equipment-rack" key={rack.id}>
            <div className="equipment-node-heading"><button type="button" className={`equipment-row${selection?.id === rack.id ? ' selected' : ''}`}
              onClick={() => select({ kind: 'rack', id: rack.id })}><strong>{rack.name}</strong>
                <small>{countCzech(draft.shelves.filter(shelf => shelf.rackId === rack.id).length, 'zařízení', 'zařízení', 'zařízení')}</small></button>
              {!searchTerm && shelves.length > 0 && <button type="button" className="equipment-toggle" onClick={() => toggleCollapsed(rack.id)}
                aria-expanded={isExpanded(rack.id)} aria-label={`${isExpanded(rack.id) ? 'Sbalit' : 'Rozbalit'} ${rack.name}`}>
                {isExpanded(rack.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>}</div>
            {isExpanded(rack.id) && shelves.map(shelf => {
              const shelfMatches = rackMatches || !!searchTerm && matches(`${shelf.kind} ${shelf.name}`)
              const cards = draft.cards.filter(card => card.shelfId === shelf.id && visibleCard(card.id, shelfMatches))
              const shelfPorts = draft.ports.filter(port => port.parentId === shelf.id && visiblePort(port))
              const childCount = shelf.kind === 'odf' ? shelfPorts.length : cards.length
              return <div className="equipment-shelf" key={shelf.id}>
                <div className="equipment-node-heading"><button type="button" className={`equipment-row${selection?.id === shelf.id ? ' selected' : ''}`}
                  onClick={() => select({ kind: 'shelf', id: shelf.id })}><span className="equipment-kind">{shelf.kind.toUpperCase()}</span>
                  <span className="equipment-row-copy"><strong>{shelf.name}</strong><small>{shelf.kind === 'odf'
                    ? countCzech(draft.ports.filter(port => port.parentId === shelf.id).length, 'port', 'porty', 'portů')
                    : countCzech(draft.cards.filter(card => card.shelfId === shelf.id).length, 'karta', 'karty', 'karet')}</small></span></button>
                  {!searchTerm && childCount > 0 && <button type="button" className="equipment-toggle" onClick={() => toggleCollapsed(shelf.id)}
                    aria-expanded={isExpanded(shelf.id)} aria-label={`${isExpanded(shelf.id) ? 'Sbalit' : 'Rozbalit'} ${shelf.name}`}>
                    {isExpanded(shelf.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>}</div>
                {isExpanded(shelf.id) && shelf.kind === 'odf' && shelfPorts.length > 0 &&
                  <div className="equipment-ports">{shelfPorts.map(port => <PortButton key={port.id} port={port} document={draft}
                    selected={selection?.id === port.id} onSelect={() => select({ kind: 'port', id: port.id })} />)}</div>}
                {isExpanded(shelf.id) && shelf.kind === 'olt' && cards.map(card => {
                  const ports = draft.ports.filter(port => port.parentId === card.id && visiblePort(port))
                  return <div className="equipment-card" key={card.id}>
                    <div className="equipment-node-heading"><button type="button" className={`equipment-row${selection?.id === card.id ? ' selected' : ''}`}
                      onClick={() => select({ kind: 'card', id: card.id })}><span className="equipment-row-copy"><strong>{card.name}</strong>
                        <small>{countCzech(draft.ports.filter(port => port.parentId === card.id).length, 'port', 'porty', 'portů')}</small></span></button>
                      {!searchTerm && ports.length > 0 && <button type="button" className="equipment-toggle" onClick={() => toggleCollapsed(card.id)}
                        aria-expanded={isExpanded(card.id)} aria-label={`${isExpanded(card.id) ? 'Sbalit' : 'Rozbalit'} ${card.name}`}>
                        {isExpanded(card.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>}</div>
                    {isExpanded(card.id) && ports.length > 0 && <div className="equipment-ports">{ports.map(port =>
                      <PortButton key={port.id} port={port} document={draft} selected={selection?.id === port.id}
                        onSelect={() => select({ kind: 'port', id: port.id })} />)}</div>}
                  </div>
                })}
              </div>
            })}
          </section>
        })}
      </div>
      <div className="equipment-detail">
        {!selected && <div className="equipment-empty"><CircleHelp size={25} /><h3>Vyberte prvek vlevo</h3>
          <p>Vyberte stojan, ODF, OLT, kartu nebo port. V detailu uvidíte jeho umístění a dostupné akce.</p></div>}
        {cables.length === 0 && <p className="equipment-note">Do budovy zatím nevede koncový kabel. Porty můžete připravit; vlákno připojíte po osazení trasy.</p>}
        {selected && draft && <><div className="equipment-detail-heading"><div><small>VYBRANÝ PRVEK · {selection?.kind === 'port' ? `${selectedOdf ? 'ODF' : 'OLT'} PORT` : selection?.kind === 'card' ? 'OLT KARTA' : selection?.kind === 'shelf' ? selectedShelf?.kind.toUpperCase() : 'STOJAN'}</small>
          <h3>{'label' in selected ? selected.label : selected.name}</h3></div></div>
          <p className="equipment-location" aria-label="Umístění vybraného prvku">{selectedLocation}</p>
          <label className="equipment-field">Označení<input maxLength={80} value={'label' in selected ? selected.label : selected.name}
            onChange={event => rename(event.target.value)} /></label>
          {selection?.kind === 'rack' && <section className="equipment-add-section"><h4>Vložit do stojanu</h4>
            <div className="equipment-actions"><button type="button" className="move-button" onClick={() => addShelf(selection.id, 'odf')}><Plus size={15} /> ODF</button>
              <button type="button" className="move-button" onClick={() => addShelf(selection.id, 'olt')}><Plus size={15} /> OLT</button></div></section>}
          {selection?.kind === 'shelf' && selectedShelf?.kind === 'olt' && <section className="equipment-add-section"><h4>Karty v OLT</h4>
            <p>{countCzech(draft.cards.filter(card => card.shelfId === selection.id).length, 'karta', 'karty', 'karet')} v tomto zařízení.</p>
            <button type="button" className="move-button" onClick={() => addCard(selection.id)}><Plus size={15} /> Přidat kartu</button></section>}
          {portParentId && <section className="equipment-add-section"><h4>Porty</h4>
            <p>{countCzech(portParentCount, 'port', 'porty', 'portů')} v tomto prvku. Nové porty přibudou za stávající.</p>
            <div className="equipment-generate"><label>Počet přidávaných portů<input type="number" min="1" max="48" value={portCount}
              onChange={event => setPortCount(Number(event.target.value))} /></label>
              <button type="button" className="move-button" onClick={() => addPorts(portParentId)} disabled={!Number.isInteger(portCount) || portCount < 1 || portCount > 48}>
                <Plus size={15} /> Přidat {countCzech(portCount, 'port', 'porty', 'portů')}</button></div></section>}
          {selection?.kind === 'shelf' && selectedShelf?.kind === 'odf' && bulkPorts.length > 0 && <section className="equipment-add-section equipment-bulk">
            <h4>Hromadně ukončit vlákna</h4><p>Vyberte kabel, první vlákno a port. Náhled ukáže celý rozsah; obsazené pozice se nezmění.</p>
            <div className="equipment-bulk-fields">
              <label>Kabel<select value={bulkCableId} onChange={event => { setBulkCableId(event.target.value); setBulkFirstFiber(0) }}>
                <option value="">Vyberte kabel</option>{cables.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select></label>
              <label>První vlákno<select value={bulkFirstFiber} disabled={!bulkCable} onChange={event => setBulkFirstFiber(Number(event.target.value))}>
                {bulkCable && cableFibers(bulkCable).map((choice, index) => <option key={fiberEndKey(choice.end)} value={index}>{choice.label}</option>)}
              </select></label>
              <label>Od portu<select value={bulkFirstPort} onChange={event => setBulkFirstPort(Number(event.target.value))}>
                {bulkPorts.sort((a, b) => a.position - b.position).map(port => <option key={port.id} value={port.position}>P{port.position}</option>)}
              </select></label>
              <label>Počet portů<input type="number" min="1" max="96" value={bulkCount}
                onChange={event => setBulkCount(Number(event.target.value))} /></label>
            </div>
            {bulkCable && (bulkPreview.length === bulkCount ? <div className="equipment-bulk-preview"><strong>Náhled · {bulkCount} portů</strong>
              <ol>{bulkPreview.map(row => <li key={row.port.id} className={row.conflict ? 'conflict' : ''}>
                <span>P{row.port.position} ← {row.fiber.label}</span>{row.conflict && <small>{row.conflict}</small>}
              </li>)}</ol></div> : <p className="form-error">Rozsah přesahuje počet portů nebo vláken.</p>)}
            <button type="button" className="move-button" disabled={bulkPreview.length !== bulkCount || bulkPreview.some(row => row.conflict)}
              onClick={() => { if (!draft || !bulkPreview.length) return
                const assignments = new Map(bulkPreview.map(row => [row.port.id, row.fiber.end]))
                update({ ...draft, ports: draft.ports.map(port => assignments.has(port.id)
                  ? { ...port, fiber: assignments.get(port.id)! } : port) })
              }}><Plus size={15} /> Připojit všechna vlákna</button>
          </section>}
          {selectedPort && <><p className={`equipment-port-detail-status${portStatus(selectedPort) === 'Volný' ? '' : ' linked'}`}>
            {selectedOdf ? 'ODF' : 'OLT'} · P{selectedPort.position} · {portStatus(selectedPort)}</p>
            <p className="equipment-note">Pozice {selectedPort.position}. {selectedOdf
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
                  </select></label>)}{path.steps.length > 0 && <OpticalPathSteps path={path}
                allocations={allocations} onOpenRoute={onOpenRoute} />}
              {path.routeIds.length > 0 && <p>Počet zvýrazněných úseků na mapě: {path.routeIds.length}</p>}
              {path.routeIds.length > 0 && <button type="button" className="move-button" onClick={onViewMap}>Zobrazit celou cestu na mapě</button>}
              {dirty && <p>Jde o náhled neuložených změn. Před přenosem cestu uložte.</p>}
              {path.status === 'connected' && pathFibers.length > 0 && <div className="fiber-allocation-card">
                <strong>Využití celé cesty</strong>
                {conflictingAllocations.length > 0 ? <><p>Tato cesta už obsahuje přiřazená vlákna:</p>
                  {conflictingAllocations.map(item => <div className="fiber-allocation-entry" key={item.id}>
                    <span>{item.status === 'used' ? 'Obsazeno' : 'Rezervováno'} · {item.label}</span>
                    <button type="button" className="move-button" disabled={allocationBusy}
                      onClick={() => void removeAllocation(item.id)}>Uvolnit</button></div>)}</>
                  : <><p>{pathFibers.length} {pathFibers.length === 1 ? 'vlákno v kabelovém běhu' : 'vlákna v kabelových bězích'}.
                    Přiřazení se zobrazí na všech úsecích těchto běhů.</p>
                    <label className="equipment-field">Služba nebo důvod rezervace<input maxLength={120}
                      value={allocationLabel} onChange={event => setAllocationLabel(event.target.value)}
                      placeholder="Např. Internet · byt 201" /></label>
                    <label className="equipment-field">Stav<select value={allocationStatus}
                      onChange={event => setAllocationStatus(event.target.value as 'reserved' | 'used')}>
                      <option value="reserved">Rezervováno</option><option value="used">Obsazeno službou</option>
                    </select></label>
                    <button type="button" className="move-button" disabled={!allocationLabel.trim() || dirty || allocationBusy}
                      onClick={() => void reservePath()}>{allocationBusy ? 'Ukládám…' : 'Přiřadit celou cestu'}</button></>}
              </div>}
              {path.status === 'connected' && path.steps.some(step => step.routeId) && <button type="button" className="move-button" disabled={dirty}
                onClick={() => onBudget(path)}>Přenést do kalkulačky</button>}</div>}
          </>}
          <div className="network-structure-remove"><button type="button" onClick={removeSelected}>
            <Trash2 size={15} /> Odebrat prvek…</button></div>
        </>}
      </div>
    </div>
    {error && <p className="form-error equipment-message" role="alert">{error}</p>}
    <footer className="splice-editor-footer"><span>{saved ? <><Check size={15} /> Uloženo</> : dirty ? 'Neuložené změny' : 'Přehled optického vybavení'}</span><div>
      <button type="button" className="move-button" onClick={close}>Zavřít</button>
      <button type="button" className="primary-button" onClick={() => void save()} disabled={!draft || !dirty || busy}><Save size={16} /> {busy ? 'Ukládání…' : 'Uložit vybavení'}</button>
    </div></footer>
  </dialog>, globalThis.document.body)
}
