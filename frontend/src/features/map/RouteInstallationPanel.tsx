import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronRight, GripVertical, Layers3, Maximize2, MoveRight, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { CableSpecification } from '../cable-catalog/model'
import { kindLabel, type DuctType } from '../duct-catalog/model'
import { canPlaceItem, hasAvailablePlacement, installationContinuations, installationFit, installationSummary,
  type InstalledItem, type InstallationSummary } from './routeInstallations'
import { routeKind, type UndergroundRoute } from './undergroundRoutes'
import { useRouteInstallations } from './useRouteInstallations'
import { acceptExampleOnArrowRight } from '../../shared/acceptExample'

type Candidate = { key: string; label: string; duct: DuctType | null; cable: CableSpecification | null }
const itemKind = (item: InstalledItem) => item.duct ? kindLabel(item.duct.kind) : 'Optický kabel'
const itemColor = (item: InstalledItem) => item.duct?.color ?? item.cable?.tubes[0]?.color ?? '#286d61'
const routeName = (id: string, routes: UndergroundRoute[]) => routes.find(route => route.id === id)?.name ?? 'Jiný úsek'

function nestedItemCount(root: InstalledItem, items: InstalledItem[]): number {
  const seen = new Set([root.id])
  const pending = [root.id]
  while (pending.length) {
    const parentId = pending.pop()
    for (const item of items) if (item.parentId === parentId && !seen.has(item.id)) {
      seen.add(item.id)
      pending.push(item.id)
    }
  }
  return seen.size - 1
}

function InstallationOverview({ summary }: { summary: InstallationSummary }) {
  return <div className={`installation-overview ${summary.status}`} aria-live="polite">
    <strong>{summary.status === 'empty' ? 'Zatím bez osazení' : summary.status === 'cables'
      ? summary.cables === 1 ? 'V úseku je optický kabel' : 'V úseku jsou optické kabely' : 'Osazeno bez kabelu'}</strong>
    <span>Chráničky, mikrotrubičky, sestavy <b>{summary.ducts}</b></span>
    <span>Optické kabely <b>{summary.cables}</b></span>
  </div>
}

type Placement = { parentId: string | null; slotIndex: number | null; label: string; key: string }

function placementFor(item: InstalledItem, parent: InstalledItem | null, items: InstalledItem[],
  slotIndex: number | null, aerial = false): Placement | null {
  const targetId = parent?.id ?? null
  if (parent?.id === item.id) return null
  let ancestor = parent
  const seen = new Set<string>()
  while (ancestor) {
    if (ancestor.id === item.id || seen.has(ancestor.id)) return null
    seen.add(ancestor.id)
    ancestor = items.find(other => other.id === ancestor?.parentId) ?? null
  }
  const others = items.filter(other => other.id !== item.id)
  if (!canPlaceItem(parent, others, item, slotIndex, aerial)) return null
  if (installationFit(item, parent, slotIndex,
    others.filter(other => other.parentId === targetId)) === 'too-small') return null
  if (item.parentId === targetId && item.slotIndex === slotIndex) return null
  const duplicates = parent ? items.filter(other => other.label === parent.label
    && other.duct?.kind === parent.duct?.kind) : []
  const distinguishingNumber = duplicates.length > 1 ? ` #${duplicates.findIndex(other => other.id === parent?.id) + 1}` : ''
  return { parentId: targetId, slotIndex,
    key: `${parent?.id ?? 'route'}:${slotIndex ?? 'free'}`,
    label: parent ? `Do: ${parent.label}${distinguishingNumber}${slotIndex === null ? '' : ` · pozice ${slotIndex + 1}`}` : 'Samostatně v úseku' }
}

function availablePlacements(item: InstalledItem, items: InstalledItem[], aerial = false): Placement[] {
  const places = [placementFor(item, null, items, null, aerial)]
  for (const parent of items) {
    if (parent.duct?.kind === 'assembly')
      for (let index = 0; index < parent.duct.slots.length; index++)
        places.push(placementFor(item, parent, items, index, aerial))
    else places.push(placementFor(item, parent, items, null, aerial))
  }
  return places.filter((place): place is Placement => place !== null)
}

function InstallationIllustration({ item }: { item: InstalledItem }) {
  const color = itemColor(item)
  const kind = item.duct?.kind
  return <svg className="install-illustration" viewBox="0 0 72 60" aria-hidden="true">
    <rect x="1" y="1" width="70" height="58" rx="10" fill="#f4f8f7" />
    {kind === 'conduit' && <><circle cx="36" cy="30" r="21" fill="#fff" stroke={color} strokeWidth="9" />
      <circle cx="36" cy="30" r="9" fill="#edf5f1" /></>}
    {kind === 'microduct' && <><rect x="11" y="15" width="50" height="30" rx="15" fill={color} opacity=".18" />
      <circle cx="36" cy="30" r="16" fill="#fff" stroke={color} strokeWidth="7" />
      <circle cx="36" cy="30" r="5" fill="#e6f2ed" /></>}
    {kind === 'assembly' && <><rect x="10" y="12" width="52" height="36" rx="8" fill="#fff" stroke={color} strokeWidth="3" />
      {[20, 36, 52].flatMap(x => [23, 38].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#e8f3ee" stroke={color} strokeWidth="2" />))}</>}
    {item.cable && <><path d="M9 41 C23 25 37 45 63 21" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <path d="M9 30 C25 43 38 18 63 34" fill="none" stroke="#d5a33a" strokeWidth="4" strokeLinecap="round" />
      <path d="M9 20 C24 34 42 23 63 43" fill="none" stroke="#4d7ca8" strokeWidth="3" strokeLinecap="round" /></>}
  </svg>
}

export function RouteInstallationPanel({ route, routes, editable, installations }: {
  route: UndergroundRoute; routes: UndergroundRoute[]; editable: boolean;
  installations: ReturnType<typeof useRouteInstallations>
}) {
  const aerial = routeKind(route) === 'aerial'
  const { documents, document, ducts, cables, loading, loadFailed, busy, error, refresh,
    add, generateMicroducts, rename, setCableLength, move, remove } = installations
  const [savedMessage, setSavedMessage] = useState('')
  useEffect(() => {
    if (!savedMessage) return
    const timer = window.setTimeout(() => setSavedMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [savedMessage])
  const [addOpen, setAddOpen] = useState(false)
  const [parentId, setParentId] = useState('')
  const [slotIndex, setSlotIndex] = useState<number | null>(null)
  const [sourceMode, setSourceMode] = useState<'catalog' | 'continuation'>('catalog')
  const [catalogKey, setCatalogKey] = useState('')
  const [continuationId, setContinuationId] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)
  const [selectionEditing, setSelectionEditing] = useState(false)
  const [selectionLabel, setSelectionLabel] = useState('')
  const [lengthInput, setLengthInput] = useState('')
  const [lengthError, setLengthError] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateCatalogId, setGenerateCatalogId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickParentId, setQuickParentId] = useState('')
  const [quickSlotIndex, setQuickSlotIndex] = useState<number | null>(null)
  const [quickCatalogKey, setQuickCatalogKey] = useState('')
  const [quickLabel, setQuickLabel] = useState('')
  const [quickError, setQuickError] = useState('')
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const generateRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const removeDialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (editorOpen && !dialog.open) dialog.showModal()
    if (!editorOpen && dialog.open) dialog.close()
    return () => { if (dialog.open) dialog.close() }
  }, [editorOpen])
  useEffect(() => {
    const dialog = removeDialogRef.current
    if (!dialog) return
    if (pendingRemovalId && !dialog.open) dialog.showModal()
    if (!pendingRemovalId && dialog.open) dialog.close()
    return () => { if (dialog.open) dialog.close() }
  }, [pendingRemovalId])
  const storedParent = document.items.find(item => item.id === parentId) ?? null
  const parent = storedParent && hasAvailablePlacement(storedParent, document.items) ? storedParent : null
  const slots = parent?.duct?.kind === 'assembly' ? parent.duct.slots : []
  const selectedSlot = parent?.duct?.kind === 'assembly' ? slotIndex : null
  const catalogItems: Candidate[] = [
    ...ducts.map(duct => ({ key: `duct:${duct.id}`, label: `${kindLabel(duct.kind)} · ${duct.name}`,
      duct, cable: null })),
    ...cables.map(cable => ({ key: `cable:${cable.id}`, label: `Kabel · ${cable.name}`, duct: null, cable })),
  ]
  const candidates = catalogItems.filter(candidate => canPlaceItem(parent, document.items, candidate, selectedSlot, aerial)
    && installationFit(candidate, parent, selectedSlot,
      document.items.filter(item => item.parentId === parent?.id)) !== 'too-small')
  const continuations = installationContinuations(route, routes, documents)
    .filter(item => canPlaceItem(parent, document.items, item, selectedSlot, aerial)
      && installationFit(item, parent, selectedSlot,
        document.items.filter(other => other.parentId === parent?.id)) !== 'too-small')
  const rootContinuations = installationContinuations(route, routes, documents)
    .filter(item => canPlaceItem(null, document.items, item, null, aerial))
  const selectedCandidate = sourceMode === 'catalog'
    ? candidates.find(candidate => candidate.key === catalogKey) ?? null
    : continuations.find(item => item.id === continuationId) ?? null
  const fit = selectedCandidate ? installationFit(selectedCandidate, parent, selectedSlot,
    document.items.filter(item => item.parentId === parent?.id)) : null
  const roots = document.items.filter(item => item.parentId === null)
  const selectedItem = document.items.find(item => item.id === selectedItemId) ?? null
  const selectedPlacements = selectedItem ? availablePlacements(selectedItem, document.items, aerial) : []
  const draggedItem = document.items.find(item => item.id === draggedId) ?? null
  const draggedPlacements = draggedItem ? availablePlacements(draggedItem, document.items, aerial) : []
  const pendingRemoval = document.items.find(item => item.id === pendingRemovalId) ?? null
  const pendingChildCount = pendingRemoval ? nestedItemCount(pendingRemoval, document.items) : 0
  const selectedHasRoom = selectedItem !== null && hasAvailablePlacement(selectedItem, document.items)
  const openMicroductSlots = selectedItem?.duct?.kind === 'assembly'
    ? selectedItem.duct.slots.map((slot, index) => ({ slot, index }))
      .filter(({ slot, index }) => slot.kind === 'microduct'
        && !document.items.some(item => item.parentId === selectedItem.id && item.slotIndex === index))
    : []
  const generateTypes = ducts.filter(duct => duct.kind === 'microduct'
    && openMicroductSlots.every(({ slot, index }) => installationFit({ duct, cable: null }, selectedItem, index) !== 'too-small'
      && ((!duct.manufacturer && !duct.model) || slot.color.toLowerCase() === duct.color.toLowerCase())))
  const summary = installationSummary(document)
  const storedQuickParent = document.items.find(item => item.id === quickParentId) ?? null
  const quickParent = storedQuickParent && hasAvailablePlacement(storedQuickParent, document.items) ? storedQuickParent : null
  const quickSlots = quickParent?.duct?.kind === 'assembly' ? quickParent.duct.slots : []
  const quickSlot = quickSlots.length ? quickSlotIndex : null
  const quickCandidates = catalogItems.filter(candidate => canPlaceItem(quickParent, document.items, candidate, quickSlot, aerial)
    && installationFit(candidate, quickParent, quickSlot,
      document.items.filter(item => item.parentId === quickParent?.id)) !== 'too-small')
  const quickType = quickCandidates.find(candidate => candidate.key === quickCatalogKey)
  const selectItem = (item: InstalledItem) => {
    setSelectedItemId(item.id)
    setSelectionLabel(item.label)
    setLengthInput(item.actualLengthMeters?.toString() ?? '')
    setLengthError('')
    setSelectionEditing(false)
    setMovePickerOpen(false)
    setGenerateOpen(false)
    setGenerateCatalogId('')
  }
  const saveCableLength = async (item: InstalledItem) => {
    const text = lengthInput.trim().replace(',', '.')
    const length = text === '' ? null : Number(text)
    if (text !== '' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)
      || length === null || !Number.isFinite(length) || length <= 0 || length > 1000000)) {
      setLengthError('Zadejte kladnou délku v metrech, nebo nechte pole prázdné.')
      return
    }
    if (await setCableLength(item.id, length)) {
      setLengthInput(length?.toString() ?? '')
      setLengthError('')
      setSavedMessage(length === null ? 'Délka kabelu odebrána.' : 'Délka uloženého kabelu uložena.')
    }
  }
  const toggleContents = (item: InstalledItem) => {
    if (!collapsedIds.has(item.id)) {
      let ancestorId = selectedItem?.parentId ?? null
      while (ancestorId) {
        if (ancestorId === item.id) { selectItem(item); break }
        ancestorId = document.items.find(other => other.id === ancestorId)?.parentId ?? null
      }
    }
    setCollapsedIds(previous => {
      const next = new Set(previous)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }
  const moveItem = async (item: InstalledItem, place: Placement) => {
    setSavedMessage('')
    const success = await move(item.id, { parentId: place.parentId, slotIndex: place.slotIndex })
    if (success) {
      setSavedMessage(`${item.label} přesunut: ${place.label}.`)
      if (place.parentId) setCollapsedIds(previous => {
        const next = new Set(previous)
        let ancestorId: string | null = place.parentId
        while (ancestorId) {
          next.delete(ancestorId)
          ancestorId = document.items.find(other => other.id === ancestorId)?.parentId ?? null
        }
        return next
      })
      selectItem(item)
      setMovePickerOpen(false)
    }
    setDraggedId(null)
    setDropTargetKey(null)
    return success
  }
  const startDrag = (event: DragEvent<HTMLElement>, item: InstalledItem) => {
    if (!editable || busy) { event.preventDefault(); return }
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.effectAllowed = 'move'
    setDraggedId(item.id)
    selectItem(item)
  }
  const allowDrop = (event: DragEvent<HTMLElement>, place: Placement | undefined) => {
    if (!place || !draggedItem || busy) { setDropTargetKey(null); return }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetKey(place.key)
  }
  const drop = (event: DragEvent<HTMLElement>, place: Placement | undefined) => {
    if (!place || !draggedItem || busy) return
    event.preventDefault()
    void moveItem(draggedItem, place)
  }
  const chooseParent = (id: string) => {
    setParentId(id)
    setFormError('')
    const next = document.items.find(item => item.id === id)
    setSlotIndex(next?.duct?.kind === 'assembly'
      ? next.duct.slots.findIndex((_, index) => !document.items.some(item => item.parentId === id && item.slotIndex === index))
      : null)
    setCatalogKey('')
    setContinuationId('')
  }
  const addInside = (id: string) => {
    const item = document.items.find(other => other.id === id)
    if (!item || !hasAvailablePlacement(item, document.items)) return
    chooseParent(id)
    setSourceMode('catalog')
    setAddOpen(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const openRootContinuation = () => {
    chooseParent('')
    setSourceMode('continuation')
    setAddOpen(true)
    setEditorOpen(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const fillMicroductSlots = async () => {
    if (!selectedItem || !generateCatalogId || openMicroductSlots.length === 0) return
    setSavedMessage('')
    const count = openMicroductSlots.length
    const success = await generateMicroducts(selectedItem.id, generateCatalogId)
    if (success) {
      setSavedMessage(`V sestavě vyplněno ${count} ${count === 1 ? 'místo' : count < 5 ? 'místa' : 'míst'}.`)
      setGenerateOpen(false)
      setGenerateCatalogId('')
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSavedMessage('')
    if (!editable || !selectedCandidate) { setFormError('Vyberte typ nebo navazující prvek.'); return }
    if (fit === 'too-small') { setFormError('Zvolený prvek je pro toto místo příliš velký.'); return }
    const success = await add({ catalogId: sourceMode === 'catalog'
      ? catalogKey.split(':')[1] : null,
    parentId: parent?.id ?? null, slotIndex: selectedSlot, label,
    continueFromItemId: sourceMode === 'continuation' ? continuationId : null })
    if (success) {
      setSavedMessage(`Uloženo do trasy: ${label.trim() || selectedCandidate.label}.`)
      setLabel(''); setCatalogKey(''); setContinuationId(''); setFormError('')
      setParentId(''); setSlotIndex(null)
      setAddOpen(false)
      requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    }
  }
  const submitQuick = async (event: FormEvent) => {
    event.preventDefault()
    if (!editable || !quickType) { setQuickError('Vyberte typ z katalogu.'); return }
    setSavedMessage('')
    const success = await add({ catalogId: quickType.key.split(':')[1], parentId: quickParent?.id ?? null,
      slotIndex: quickSlot,
      label: quickLabel, continueFromItemId: null })
    if (success) {
      setSavedMessage(`Uloženo do trasy: ${quickLabel.trim() || quickType.label}.`)
      setQuickParentId(''); setQuickSlotIndex(null); setQuickCatalogKey('')
      setQuickLabel(''); setQuickError(''); setQuickAddOpen(false)
    }
  }
  const renameItem = async (id: string, nextLabel: string) => {
    setSavedMessage('')
    const success = await rename(id, nextLabel)
    if (success) setSavedMessage(`Označení změněno na ${nextLabel.trim()}.`)
    return success
  }
  const removeItem = async (id: string) => {
    setSavedMessage('')
    const success = await remove(id)
    if (success) {
      setSavedMessage('Prvek i jeho obsah byly z úseku odebrány.')
      const removedIds = new Set<string>([id])
      for (let count = 0; count < document.items.length; count++)
        for (const item of document.items) if (item.parentId && removedIds.has(item.parentId)) removedIds.add(item.id)
      if (selectedItemId && removedIds.has(selectedItemId)) setSelectedItemId(null)
      setCollapsedIds(previous => new Set([...previous].filter(itemId => !removedIds.has(itemId))))
    }
    return success
  }
  const confirmRemoval = async () => {
    if (!pendingRemovalId) return
    const id = pendingRemovalId
    setPendingRemovalId(null)
    await removeItem(id)
  }
  const renderDiagramNodes = (parentId: string | null): ReactNode => document.items
    .filter(item => item.parentId === parentId).map(item => {
      const children = document.items.filter(child => child.parentId === item.id)
      const emptySlots = item.duct?.kind === 'assembly'
        ? item.duct.slots.map((slot, index) => ({ slot, index }))
          .filter(({ index }) => !children.some(child => child.slotIndex === index)) : []
      const target = draggedPlacements.find(place => place.parentId === item.id && place.slotIndex === null)
      const collapsed = collapsedIds.has(item.id)
      const contents = nestedItemCount(item, document.items)
      return <div className="installation-flow-node" key={item.id}>
        <div className={`installation-flow-card ${selectedItemId === item.id ? 'selected' : ''} ${target ? 'can-drop' : ''} ${dropTargetKey === target?.key ? 'drop-active' : ''}`}
          style={{ '--install-color': itemColor(item) } as CSSProperties}
          onDragOver={event => allowDrop(event, target)} onDragLeave={() => setDropTargetKey(null)}
          onDrop={event => drop(event, target)}>
          <button type="button" className="installation-flow-select" draggable={editable && !busy}
            aria-pressed={selectedItemId === item.id} aria-label={`Vybrat a přetáhnout: ${item.label}`}
            onClick={() => selectItem(item)} onDragStart={event => startDrag(event, item)}
            onDragEnd={() => { setDraggedId(null); setDropTargetKey(null) }}>
            <InstallationIllustration item={item} />
            <span className="installation-flow-text"><small>{itemKind(item)}{item.slotIndex === null ? '' : ` · pozice ${item.slotIndex + 1}`}</small>
              <strong>{item.label}</strong><span>{item.duct ? `${contents} ${contents === 1 ? 'prvek uvnitř' : contents > 1 && contents < 5 ? 'prvky uvnitř' : 'prvků uvnitř'}` : 'Optický kabel'}</span></span>
            <GripVertical size={17} aria-hidden="true" />
          </button>
          {item.duct && (children.length > 0 || emptySlots.length > 0) && <button type="button"
            className="installation-flow-toggle" aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Rozbalit' : 'Sbalit'} obsah: ${item.label}`}
            onClick={() => toggleContents(item)}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
          </button>}
          {draggedId && target && <span className="installation-flow-drop-hint">Pustit dovnitř</span>}
        </div>
        {!collapsed && (children.length > 0 || emptySlots.length > 0) && <div className="installation-flow-children">
          {renderDiagramNodes(item.id)}
          {emptySlots.map(({ slot, index }) => {
            const place = draggedPlacements.find(candidate => candidate.parentId === item.id && candidate.slotIndex === index)
            return <div key={`slot-${index}`} className={`installation-flow-slot ${dropTargetKey === place?.key ? 'drop-active' : ''}`}
              onDragOver={event => allowDrop(event, place)} onDragLeave={() => setDropTargetKey(null)}
              onDrop={event => drop(event, place)}>
              <span>Pozice {index + 1} · {slot.name}</span><strong>Volná</strong>
            </div>
          })}
        </div>}
      </div>
    })
  const expandableIds = document.items.filter(item => item.duct && (
    document.items.some(child => child.parentId === item.id)
    || item.duct.kind === 'assembly' && item.duct.slots.length > 0)).map(item => item.id)
  const allCollapsed = expandableIds.length > 0 && expandableIds.every(id => collapsedIds.has(id))
  const editorContent = <section className="installation-panel installation-editor-panel" aria-label="Osazení trasy" ref={sectionRef}>
    <div className="installation-heading"><div><span className="section-label">Prvky v úseku</span>
      <h2>Uspořádání prvků</h2></div><div className="installation-heading-actions">
        <button type="button" className="move-button" aria-expanded={addOpen} aria-controls="installation-add-form"
          onClick={() => {
            setAddOpen(current => !current)
            if (!addOpen) requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
          }} disabled={!editable || loading || loadFailed}><Plus size={15} /> {addOpen ? 'Zavřít' : 'Přidat prvek'}</button>
        <button type="button" className="icon-button" title="Načíst osazení znovu"
          aria-label="Načíst osazení znovu" onClick={refresh}><RefreshCw size={16} /></button>
      </div></div>
    {savedMessage && <p className="installation-saved" role="status"><Check size={15} /> {savedMessage}</p>}
    <p className="route-help">Prvky můžete rozbalit, vybrat a přetáhnout do vhodného místa.</p>
    {loading ? <p className="installation-muted">Načítání osazení…</p> : <>
      {error && <div className="panel-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Načíst znovu</button></div>}
      {loadFailed ? null : roots.length === 0 ? <><p className="installation-empty">{aerial ? 'Vložte kabel přímo do nadzemního úseku. Provedení a zavěšení určete podle skutečného kabelu.' : 'Trasa je zatím prázdná. Tlačítkem Přidat prvek vložte první chráničku, mikrotrubičku nebo sestavu.'}</p>
        {rootContinuations.length > 0 && <button type="button" className="move-button" onClick={openRootContinuation}
          disabled={!editable || busy}>Navázat osazení ze sousedního úseku</button>}</>
        : <div className="installation-view installation-diagram-view">
          <div className="installation-canvas">
            <div className="installation-canvas-heading"><span>Celý úsek trasy</span>
              <div><small>{document.items.length} {document.items.length === 1 ? 'prvek' : document.items.length > 1 && document.items.length < 5 ? 'prvky' : 'prvků'}</small>
                {expandableIds.length > 0 && <button type="button" onClick={() => {
                  if (allCollapsed) setCollapsedIds(new Set())
                  else { setCollapsedIds(new Set(expandableIds)); setSelectedItemId(null) }
                }}>{allCollapsed ? 'Rozbalit vše' : 'Sbalit vše'}</button>}</div></div>
            <div className="installation-flow" aria-label="Uspořádání prvků v úseku">
              <div className={`installation-flow-route ${dropTargetKey === draggedPlacements.find(place => place.parentId === null)?.key ? 'drop-active' : ''}`}
                onDragOver={event => allowDrop(event, draggedPlacements.find(place => place.parentId === null))}
                onDrop={event => drop(event, draggedPlacements.find(place => place.parentId === null))}>
                <Layers3 size={19} /><span><strong>Úsek trasy</strong><small>{roots.length} {roots.length === 1 ? 'samostatný prvek' : roots.length > 1 && roots.length < 5 ? 'samostatné prvky' : 'samostatných prvků'}</small></span>
                {draggedId && draggedPlacements.some(place => place.parentId === null) && <em>Pustit vedle ostatních</em>}
              </div>
              <div className="installation-flow-forest">{renderDiagramNodes(null)}</div>
            </div>
          </div>{selectedItem ? <div className="installation-selection">
          <div className="installation-selection-heading"><div><span>Vybraný prvek · {itemKind(selectedItem)}</span><strong>{selectedItem.label}</strong>
            <small>Typ: {selectedItem.duct?.name ?? selectedItem.cable?.name}</small></div>
            <button type="button" className="installation-selection-close" aria-label="Zrušit výběr prvku"
              onClick={() => setSelectedItemId(null)}><X size={15} /></button></div>
          {selectionEditing ? <form className="install-rename" onSubmit={async event => {
            event.preventDefault()
            if (await renameItem(selectedItem.id, selectionLabel)) setSelectionEditing(false)
          }}><input aria-label="Nové označení prvku" value={selectionLabel} maxLength={80}
              onChange={event => setSelectionLabel(event.target.value)} required />
            <button type="submit" disabled={busy || !selectionLabel.trim()} aria-label="Uložit označení"><Check size={15} /></button>
            <button type="button" onClick={() => setSelectionEditing(false)} aria-label="Zrušit přejmenování"><X size={15} /></button>
          </form> : <div className="installation-selection-actions">
            {selectedHasRoom && <button type="button" onClick={() => addInside(selectedItem.id)} disabled={!editable || busy}>
              <Plus size={14} /> Vložit dovnitř</button>}
            {openMicroductSlots.length > 0 && <button type="button" onClick={() => {
              setGenerateOpen(value => !value)
              if (!generateOpen) requestAnimationFrame(() => generateRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
            }}
              disabled={!editable || busy} aria-expanded={generateOpen}>
              <Layers3 size={14} /> Vyplnit sestavu</button>}
            {selectedPlacements.length > 0 && <button type="button" onClick={() => setMovePickerOpen(current => !current)}
              disabled={!editable || busy} aria-expanded={movePickerOpen}><MoveRight size={14} /> Přesunout…</button>}
            <button type="button" onClick={() => { setSelectionLabel(selectedItem.label); setSelectionEditing(true) }}
              disabled={!editable || busy}><Pencil size={14} /> Přejmenovat</button>
          </div>}
          {selectedPlacements.length === 0 && <p className="installation-move-unavailable">Prvek nyní nemá jiné vhodné místo pro přesun.</p>}
          {selectedItem.cable && <form className="installation-length" onSubmit={event => {
            event.preventDefault(); void saveCableLength(selectedItem)
          }}><label>Délka uloženého kabelu v úseku
            <span><input inputMode="decimal" value={lengthInput} placeholder="Zatím neznámá"
              aria-invalid={!!lengthError} onChange={event => { setLengthInput(event.target.value); setLengthError('') }} /> m</span>
          </label><button type="submit" className="move-button" disabled={!editable || busy}>Uložit délku</button>
            <p>Zadejte délku kabelu včetně rezerv. Mapa ukazuje jen přibližnou délku trasy.</p>
            {selectedItem.lengthBeforeSplitMeters != null && <p className="installation-length-note">
              Před rozdělením měla celá trasa zadanou délku {selectedItem.lengthBeforeSplitMeters.toLocaleString('cs-CZ')} m.
              Délky obou nových úseků je potřeba změřit nebo doplnit zvlášť; původní součet jsme nikam neodhadovali.
            </p>}
            {lengthError && <p className="form-error" role="alert">{lengthError}</p>}</form>}
          {generateOpen && openMicroductSlots.length > 0 && <div className="installation-generate-panel" ref={generateRef}>
            <strong>Vyplnit {openMicroductSlots.length} volných pozic</strong>
            <p>Každá pozice vytvoří samostatnou mikrotrubičku. U obecného typu se převezme barva pozice; výrobkový typ musí barvě odpovídat.</p>
            <label>Typ mikrotrubičky
              <select value={generateCatalogId} onChange={event => setGenerateCatalogId(event.target.value)}
                disabled={busy || !editable}>
                <option value="">Vyberte typ z katalogu</option>
                {generateTypes.map(duct => <option key={duct.id} value={duct.id}>{duct.name}</option>)}
              </select>
            </label>
            <div className="installation-generate-preview" aria-label="Volné pozice">
              {openMicroductSlots.slice(0, 6).map(({ slot, index }) => <span key={index}>
                <i style={{ background: slot.color }} aria-hidden="true" /> {index + 1}. {slot.name}
              </span>)}
              {openMicroductSlots.length > 6 && <span>+ dalších {openMicroductSlots.length - 6}</span>}
            </div>
            {generateTypes.length === 0 && <p>Žádný katalogový typ se do všech volných pozic podle známých rozměrů nevejde.</p>}
            <button type="button" className="primary-button" onClick={() => void fillMicroductSlots()}
              disabled={!generateCatalogId || busy || !editable}>Vytvořit mikrotrubičky</button>
          </div>}
          {movePickerOpen && <div className="installation-move-panel" aria-label="Cíle přesunu">
            <strong>Vyberte nové místo</strong>
            <div>{selectedPlacements.length ? selectedPlacements.map(place => <button type="button" key={place.key}
              className="installation-drop-target"
              disabled={!editable || busy} onClick={() => void moveItem(selectedItem, place)}
              >{place.label}
            </button>) : <span className="installation-muted">Pro tento prvek není jiné vhodné místo.</span>}</div>
          </div>}
          {selectedItem.duct && !selectedHasRoom && <p className="installation-muted">{selectedItem.duct.kind === 'assembly'
            ? 'Všechny pozice sestavy jsou obsazené.'
            : selectedItem.duct.kind === 'microduct' ? 'Mikrotrubička už obsahuje kabel.'
              : 'Chránička s přímým kabelem nemá další volné místo.'}</p>}
          <div className="installation-selection-footer"><button type="button" className="installation-remove-button"
            onClick={() => setPendingRemovalId(selectedItem.id)} disabled={!editable || busy}>
            <Trash2 size={14} /> Odebrat prvek…</button></div>
        </div> : <div className="installation-selection installation-selection-empty">
          <strong>Vyberte prvek vlevo</strong>
          <p>Zde uvidíte jeho údaje a akce. Pořadí a vložení prvků můžete upravit přetažením vlevo.</p>
        </div>}</div>}
      {!loadFailed && <div id="installation-add-form" className="installation-add-container" hidden={!addOpen}>
      <form className="installation-add" onSubmit={submit} ref={formRef}>
        <h3><Layers3 size={16} /> Vložit prvek do trasy</h3>
        <label htmlFor="installation-parent">Kam vložit</label>
        <select id="installation-parent" value={parent?.id ?? ''} onChange={event => chooseParent(event.target.value)} disabled={!editable || busy}>
          <option value="">Samostatně v úseku</option>
          {document.items.filter(item => hasAvailablePlacement(item, document.items)).map(item => <option key={item.id} value={item.id}>
            Do: {item.label} ({itemKind(item)})</option>)}
        </select>
        {slots.length > 0 && <><label htmlFor="installation-slot">Pozice v sestavě</label>
          <select id="installation-slot" value={slotIndex ?? -1} onChange={event => { setSlotIndex(Number(event.target.value)); setCatalogKey(''); setContinuationId('') }} disabled={!editable || busy}>
            {slots.map((slot, index) => <option key={index} value={index}
              disabled={document.items.some(item => item.parentId === parent?.id && item.slotIndex === index)}>
              {index + 1}. {slot.name} · {kindLabel(slot.kind)}
              {document.items.some(item => item.parentId === parent?.id && item.slotIndex === index) ? ' (obsazeno)' : ''}</option>)}
            {slots.every((_, index) => document.items.some(item => item.parentId === parent?.id && item.slotIndex === index))
              && <option value={-1}>Všechny pozice jsou obsazené</option>}
          </select></>}
        <div className="installation-source-modes" role="group" aria-label="Zdroj prvku">
          <label><input type="radio" checked={sourceMode === 'catalog'} onChange={() => setSourceMode('catalog')} /> Nový z katalogu</label>
          <label><input type="radio" checked={sourceMode === 'continuation'} onChange={() => setSourceMode('continuation')} /> Pokračování</label>
        </div>
        {sourceMode === 'catalog' ? <><label htmlFor="installation-catalog">Typ z katalogu</label>
          <select id="installation-catalog" value={catalogKey} onChange={event => setCatalogKey(event.target.value)} disabled={!editable || busy}>
            <option value="">Vyberte typ…</option>
            {candidates.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select>
          {candidates.length === 0 && <p className="installation-muted">Zde není volná pozice nebo vhodný typ z katalogu.</p>}
          {candidates.length > 0 && parent && <p className="installation-muted">Nabídka vynechává nepřípustné druhy a prvky, které se podle známých průměrů nevejdou.</p>}</>
          : <><label htmlFor="installation-continuation">Navázat na sousední úsek</label>
          <select id="installation-continuation" value={continuationId} onChange={event => setContinuationId(event.target.value)} disabled={!editable || busy}>
            <option value="">Vyberte instalovaný prvek…</option>
            {continuations.map(item => <option key={item.id} value={item.id}>{item.label} · {routeName(item.routeId, routes)}</option>)}
          </select>
          {continuations.length === 0 && <p className="installation-muted">V sousedním úseku není vhodný prvek k navázání.</p>}</>}
        {selectedCandidate && parent && <p className={`install-fit ${fit}`}>{fit === 'possible'
          ? 'Průměry předběžně vyhovují. Ověřte produktové podmínky a skutečné uložení.'
          : fit === 'too-small' ? 'Podle zadaných průměrů se prvek nevejde.'
            : 'Rozměry chybí nebo nelze ověřit společné uložení. Kompatibilita zůstává neurčená.'}</p>}
        <label htmlFor="installation-label">Označení prvku <span>(volitelné)</span></label>
        <input id="installation-label" maxLength={80} value={label} onChange={event => setLabel(event.target.value)}
          onKeyDown={event => acceptExampleOnArrowRight(event, setLabel, selectedCandidate?.label)}
          title="Šipka doprava převezme šedé označení"
          placeholder={selectedCandidate?.label ?? 'Např. Chránička CH-01'} disabled={!editable || busy} />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="primary-button" disabled={!editable || busy || !selectedCandidate || fit === 'too-small'}>
          <Plus size={16} /> {busy ? 'Ukládání…' : 'Vložit prvek'}</button>
        {!editable && <p className="installation-muted">Nejdřív dokončete a uložte úpravu průběhu trasy.</p>}
      </form></div>}
    </>}
  </section>
  return <>
    <section className="installation-panel installation-preview-panel" aria-label="Přehled osazení trasy">
      <div className="installation-heading"><div><span className="section-label">Fyzická infrastruktura</span>
        <h2>Osazení úseku</h2></div><div className="installation-heading-actions">
        <button type="button" className="installation-quick-add-toggle" disabled={!editable || loading || loadFailed}
          aria-expanded={quickAddOpen} aria-controls="installation-quick-add"
          onClick={() => { setQuickAddOpen(value => !value); setQuickError('') }}>
          <Plus size={14} /> Přidat</button>
        <button type="button" className="icon-button" title="Načíst osazení znovu"
          aria-label="Načíst osazení znovu" onClick={refresh}><RefreshCw size={16} /></button></div></div>
      {!loading && !loadFailed && <InstallationOverview summary={summary} />}
      {savedMessage && <p className="installation-saved" role="status"><Check size={15} /> {savedMessage}</p>}
      {quickAddOpen && !loadFailed && <form id="installation-quick-add" className="installation-quick-add" onSubmit={submitQuick}>
        <strong>Přidat prvek do trasy</strong>
        <label htmlFor="installation-quick-parent">Kam vložit</label>
        <select id="installation-quick-parent" value={quickParent?.id ?? ''} disabled={busy || !editable}
          onChange={event => {
            const id = event.target.value
            const next = document.items.find(item => item.id === id)
            setQuickParentId(id)
            setQuickSlotIndex(next?.duct?.kind === 'assembly'
              ? next.duct.slots.findIndex((_, index) => !document.items.some(item => item.parentId === id && item.slotIndex === index))
              : null)
            setQuickCatalogKey(''); setQuickError('')
          }}>
          <option value="">Samostatně v úseku</option>
          {document.items.filter(item => hasAvailablePlacement(item, document.items)).map(item => <option key={item.id} value={item.id}>
            Do: {item.label} ({itemKind(item)})</option>)}
        </select>
        {quickSlots.length > 0 && <><label htmlFor="installation-quick-slot">Pozice v sestavě</label>
          <select id="installation-quick-slot" value={quickSlotIndex ?? -1} disabled={busy || !editable}
            onChange={event => { setQuickSlotIndex(Number(event.target.value)); setQuickCatalogKey('') }}>
            {quickSlots.map((slot, index) => <option key={index} value={index}
              disabled={document.items.some(item => item.parentId === quickParent?.id && item.slotIndex === index)}>
              {index + 1}. {slot.name} · {kindLabel(slot.kind)}
              {document.items.some(item => item.parentId === quickParent?.id && item.slotIndex === index) ? ' (obsazeno)' : ''}</option>)}
          </select></>}
        <label htmlFor="installation-quick-type">Typ z katalogu</label>
        <select id="installation-quick-type" value={quickType?.key ?? ''} disabled={busy || !editable}
          onChange={event => { setQuickCatalogKey(event.target.value); setQuickError('') }}>
          <option value="">Vyberte typ…</option>
          {quickCandidates.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
        </select>
        {quickCandidates.length === 0 && <p>Na tomto místě není dostupný vhodný typ.</p>}
        <label htmlFor="installation-quick-label">Označení <span>(volitelné)</span></label>
        <input id="installation-quick-label" value={quickLabel} maxLength={80} disabled={busy || !editable}
          onChange={event => setQuickLabel(event.target.value)}
          onKeyDown={event => acceptExampleOnArrowRight(event, setQuickLabel, quickType?.label)}
          placeholder={quickType?.label ?? 'Např. Chránička CH-01'} />
        {quickError && <p className="form-error" role="alert">{quickError}</p>}
        <div className="installation-quick-actions"><button type="button" onClick={() => setQuickAddOpen(false)}>Zrušit</button>
          <button type="submit" className="primary-button" disabled={!editable || busy || !quickType}>
            {busy ? 'Ukládání…' : 'Přidat prvek'}</button></div>
      </form>}
      {loading ? <p className="installation-muted">Načítání osazení…</p>
        : error ? <div className="panel-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Načíst znovu</button></div>
          : roots.length === 0 ? <><p className="installation-empty">{aerial ? 'Úsek zatím nemá kabel. Přidejte kabel přímo do úseku.' : 'Úsek zatím nemá žádné uložené prvky. Přidejte první chráničku nebo mikrotrubičku.'}</p>
              {rootContinuations.length > 0 && <button type="button" className="move-button" onClick={openRootContinuation}
                disabled={!editable || busy}>Navázat osazení ze sousedního úseku</button>}</>
            : <><div className="installation-preview-list" aria-label="Hlavní prvky v úseku">
              {roots.slice(0, 4).map(root => <button type="button" className="installation-preview-item" key={root.id}
                onClick={() => { selectItem(root); setCollapsedIds(previous => {
                  const next = new Set(previous); next.delete(root.id); return next
                }); setEditorOpen(true) }}>
                <span className="installation-preview-mark" style={{ background: itemColor(root) }} aria-hidden="true" />
                <span><strong>{root.label}</strong><small>{itemKind(root)} · {nestedItemCount(root, document.items)} uvnitř</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>)}
            </div>{roots.length > 4 && <p className="installation-muted">A další {roots.length - 4} hlavní prvky v editoru.</p>}</>}
      <p className="installation-preview-hint">Editor nabídne přehled celého uložení, navázání pokračování a úpravy prvků.</p>
      <button type="button" className="installation-open-editor" disabled={loading || loadFailed}
        onClick={() => { if (roots.length === 1) selectItem(roots[0]); setEditorOpen(true) }}>
        <Maximize2 size={16} /> Otevřít editor osazení</button>
    </section>
    {createPortal(<><dialog ref={dialogRef} className="installation-editor-dialog"
      aria-labelledby="installation-editor-title" onCancel={event => { event.preventDefault(); setEditorOpen(false) }}>
      <div className="installation-editor-shell">
        <header className="installation-editor-header">
          <div className="installation-editor-header-main"><div className="installation-editor-emblem"><Layers3 size={22} /></div>
            <div><span>Podzemní trasa · {route.name}</span>
              <h2 id="installation-editor-title">Editor osazení</h2></div>
            <button type="button" onClick={() => setEditorOpen(false)} aria-label="Zavřít editor osazení"><X size={18} /></button>
          </div>
          {!loading && !loadFailed && <InstallationOverview summary={summary} />}
        </header>
        <div className="installation-editor-scroll">{editorContent}</div>
      </div>
    </dialog><dialog ref={removeDialogRef} className="installation-remove-dialog"
      aria-labelledby="installation-remove-title" onCancel={event => { event.preventDefault(); setPendingRemovalId(null) }}>
      <div className="installation-remove-icon"><Trash2 size={22} /></div>
      <h2 id="installation-remove-title">Odebrat „{pendingRemoval?.label}“?</h2>
      <p>{pendingChildCount > 0
        ? `Spolu s ním odeberete i ${pendingChildCount} ${pendingChildCount === 1 ? 'prvek' : pendingChildCount < 5 ? 'prvky' : 'prvků'} uvnitř.`
        : 'Prvek bude odebrán z tohoto úseku.'} Tuto změnu nelze vrátit.</p>
      <div className="installation-remove-actions">
        <button type="button" onClick={() => setPendingRemovalId(null)}>Zrušit</button>
        <button type="button" className="installation-remove-confirm" onClick={() => void confirmRemoval()}>
          {pendingChildCount ? 'Odebrat včetně obsahu' : 'Odebrat prvek'}</button>
      </div>
    </dialog></>, globalThis.document.body)}
  </>
}
