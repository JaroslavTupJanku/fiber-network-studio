import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Check, Layers3, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { CableSpecification } from '../cable-catalog/model'
import { kindLabel, type DuctType } from '../duct-catalog/model'
import { canPlaceItem, installationContinuations, installationFit, installationSummary,
  type InstalledItem, type RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'
import { useRouteInstallations } from './useRouteInstallations'

type Candidate = { key: string; label: string; duct: DuctType | null; cable: CableSpecification | null }
const itemKind = (item: InstalledItem) => item.duct ? kindLabel(item.duct.kind) : 'Optický kabel'
const itemColor = (item: InstalledItem) => item.duct?.color ?? item.cable?.tubes[0]?.color ?? '#286d61'
const routeName = (id: string, routes: UndergroundRoute[]) => routes.find(route => route.id === id)?.name ?? 'Jiný úsek'

function SectionDiagram({ item, items, depth = 0 }: { item: InstalledItem; items: InstalledItem[]; depth?: number }) {
  const children = items.filter(child => child.parentId === item.id)
  if (item.duct?.kind === 'assembly') return <div className="install-diagram-assembly" style={{
    gridTemplateColumns: `repeat(${item.duct.columns}, minmax(0, 1fr))`,
  }} aria-hidden="true">{item.duct.slots.map((slot, index) => {
    const child = children.find(other => other.slotIndex === index)
    return <div key={index} className="install-diagram-slot" title={`${slot.name}: ${child?.label ?? 'volná pozice'}`}>
      {child ? <SectionDiagram item={child} items={items} depth={depth + 1} />
        : <span className="install-diagram-empty" style={{ borderColor: slot.color }} />}
      <small>{index + 1}</small>
    </div>
  })}</div>
  if (item.cable) return <span className="install-diagram-cable" style={{ background: itemColor(item) }} aria-hidden="true" />
  return <span className={`install-diagram-ring ${depth === 0 ? 'root' : ''}`}
    style={{ '--install-color': itemColor(item) } as CSSProperties} aria-hidden="true">
    {children.map(child => <SectionDiagram key={child.id} item={child} items={items} depth={depth + 1} />)}
  </span>
}

function InstallationTreeItem({ item, items, documents, routes, busy, onRename, onRemove, onAddInside }:
  { item: InstalledItem; items: InstalledItem[]; documents: RouteInstallationDocument[]; routes: UndergroundRoute[];
    busy: boolean; onRename: (id: string, label: string) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>;
    onAddInside: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const children = items.filter(child => child.parentId === item.id)
  const parent = items.find(other => other.id === item.parentId) ?? null
  const fit = installationFit(item, parent, item.slotIndex,
    items.filter(other => other.parentId === parent?.id && other.id !== item.id))
  const linkedRoutes = documents.filter(document => document.routeId !== item.routeId
    && document.items.some(other => other.runId === item.runId)).map(document => routeName(document.routeId, routes))
  const saveLabel = async (event: FormEvent) => {
    event.preventDefault()
    if (await onRename(item.id, label)) setEditing(false)
  }
  return <li className="install-tree-item">
    <div className="install-item-head">
      <span className="install-item-dot" style={{ background: itemColor(item) }} />
      <div className="install-item-text"><strong>{item.label}</strong>
        <small>{itemKind(item)} · typ: {item.duct?.name ?? item.cable?.name}
          {item.slotIndex !== null ? ` · pozice ${item.slotIndex + 1}` : ''}</small>
        {linkedRoutes.length > 0 && <small className="install-continuity">Souvislý kus pokračuje: {linkedRoutes.join(', ')}</small>}
        {parent && <small className={`install-fit ${fit}`}>{fit === 'possible' ? 'Rozměrově předběžně vyhovuje'
          : fit === 'too-small' ? 'Rozměry nevyhovují' : 'Kompatibilita neurčená'}</small>}
      </div>
      <div className="install-item-actions">
        {item.duct && <button type="button" title={`Vložit do ${item.label}`} aria-label={`Vložit do ${item.label}`}
          onClick={() => onAddInside(item.id)} disabled={busy}><Plus size={15} /></button>}
        <button type="button" title={`Přejmenovat ${item.label}`} aria-label={`Přejmenovat ${item.label}`}
          onClick={() => { setLabel(item.label); setEditing(value => !value) }} disabled={busy}><Pencil size={14} /></button>
        <button type="button" title={children.length ? 'Nejdřív odeberte obsah' : `Odebrat ${item.label}`}
          aria-label={`Odebrat ${item.label}`} disabled={busy || children.length > 0}
          onClick={() => { if (window.confirm(`Odebrat instalovaný kus „${item.label}“?`)) void onRemove(item.id) }}><Trash2 size={14} /></button>
      </div>
    </div>
    {editing && <form className="install-rename" onSubmit={saveLabel}>
      <input aria-label={`Nové označení ${item.label}`} value={label} maxLength={80}
        onChange={event => setLabel(event.target.value)} required />
      <button type="submit" disabled={busy || !label.trim()} aria-label="Uložit označení"><Check size={15} /></button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Zrušit přejmenování"><X size={15} /></button>
    </form>}
    {children.length > 0 && <ul>{children.map(child => <InstallationTreeItem key={child.id} item={child}
      items={items} documents={documents} routes={routes} busy={busy} onRename={onRename}
      onRemove={onRemove} onAddInside={onAddInside} />)}</ul>}
  </li>
}

export function RouteInstallationPanel({ route, routes, editable, installations }: {
  route: UndergroundRoute; routes: UndergroundRoute[]; editable: boolean;
  installations: ReturnType<typeof useRouteInstallations>
}) {
  const { documents, document, ducts, cables, loading, loadFailed, busy, error, refresh, add, rename, remove } = installations
  const [savedMessage, setSavedMessage] = useState('')
  const [parentId, setParentId] = useState('')
  const [slotIndex, setSlotIndex] = useState<number | null>(null)
  const [sourceMode, setSourceMode] = useState<'catalog' | 'continuation'>('catalog')
  const [catalogKey, setCatalogKey] = useState('')
  const [continuationId, setContinuationId] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const parent = document.items.find(item => item.id === parentId) ?? null
  const slots = parent?.duct?.kind === 'assembly' ? parent.duct.slots : []
  const selectedSlot = parent?.duct?.kind === 'assembly' ? slotIndex : null
  const candidates: Candidate[] = [
    ...ducts.map(duct => ({ key: `duct:${duct.id}`, label: `${kindLabel(duct.kind)} · ${duct.name}`,
      duct, cable: null })),
    ...cables.map(cable => ({ key: `cable:${cable.id}`, label: `Kabel · ${cable.name}`, duct: null, cable })),
  ].filter(candidate => canPlaceItem(parent, document.items, candidate, selectedSlot))
  const continuations = installationContinuations(route, routes, documents)
    .filter(item => canPlaceItem(parent, document.items, item, selectedSlot))
  const selectedCandidate = sourceMode === 'catalog'
    ? candidates.find(candidate => candidate.key === catalogKey) ?? null
    : continuations.find(item => item.id === continuationId) ?? null
  const fit = selectedCandidate ? installationFit(selectedCandidate, parent, selectedSlot,
    document.items.filter(item => item.parentId === parent?.id)) : null
  const roots = document.items.filter(item => item.parentId === null)
  const summary = installationSummary(document)
  const chooseParent = (id: string) => {
    setParentId(id)
    const next = document.items.find(item => item.id === id)
    setSlotIndex(next?.duct?.kind === 'assembly'
      ? next.duct.slots.findIndex((_, index) => !document.items.some(item => item.parentId === id && item.slotIndex === index))
      : null)
    setCatalogKey('')
    setContinuationId('')
  }
  const addInside = (id: string) => {
    chooseParent(id)
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSavedMessage('')
    if (!editable || !selectedCandidate) { setFormError('Vyberte typ nebo návazný kus.'); return }
    if (fit === 'too-small') { setFormError('Zvolený kus je pro toto místo příliš velký.'); return }
    const success = await add({ catalogId: sourceMode === 'catalog'
      ? catalogKey.split(':')[1] : null,
    parentId: parent?.id ?? null, slotIndex: selectedSlot, label,
    continueFromItemId: sourceMode === 'continuation' ? continuationId : null })
    if (success) {
      setSavedMessage(`Uloženo do trasy: ${label.trim() || selectedCandidate.label}.`)
      setLabel(''); setCatalogKey(''); setContinuationId(''); setFormError('')
      if (slots.length > 0) setSlotIndex(slots.findIndex((_, index) => index !== selectedSlot
        && !document.items.some(item => item.parentId === parent?.id && item.slotIndex === index)))
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
    if (success) setSavedMessage('Kus byl z úseku odebrán.')
    return success
  }
  return <section className="installation-panel" aria-label="Osazení trasy">
    <div className="installation-heading"><div><span className="section-label">Fyzická infrastruktura</span>
      <h2>Osazení úseku</h2></div><div className="installation-heading-actions">
        <button type="button" className="move-button" onClick={() => formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          disabled={!editable || loading || loadFailed}><Plus size={15} /> Přidat</button>
        <button type="button" className="icon-button" title="Načíst osazení znovu"
          aria-label="Načíst osazení znovu" onClick={refresh}><RefreshCw size={16} /></button>
      </div></div>
    {!loading && !loadFailed && <div className={`installation-overview ${summary.status}`} aria-live="polite">
      <strong>{summary.status === 'empty' ? 'Zatím bez osazení' : summary.status === 'cables' ? 'V úseku je optický kabel' : 'V úseku je potrubí'}</strong>
      <span>Potrubí a trubičky <b>{summary.ducts}</b></span><span>Optické kabely <b>{summary.cables}</b></span>
    </div>}
    {savedMessage && <p className="installation-saved" role="status"><Check size={15} /> {savedMessage}</p>}
    <p className="route-help">Níže je schematický průřez a seznam uložených kusů. Každý má vlastní identitu a kopii údajů z katalogu.</p>
    {loading ? <p className="installation-muted">Načítání osazení…</p> : <>
      {error && <div className="panel-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Načíst znovu</button></div>}
      {loadFailed ? null : roots.length === 0 ? <p className="installation-empty">Trasa je zatím prázdná. Přidejte chráničku, mikrotrubičku nebo sestavu.</p>
        : <><div className="installation-cross-sections" aria-label="Schematické průřezy instalace">
          {roots.map(root => <div className="installation-cross-section" key={root.id}>
            <div className="installation-visual"><SectionDiagram item={root} items={document.items} /></div>
            <strong>{root.label}</strong>
          </div>)}
          <small>Schéma uspořádání, nikoli měřítko nebo schválení instalace.</small>
        </div><ul className="installation-tree">{roots.map(root => <InstallationTreeItem key={root.id} item={root}
          items={document.items} documents={documents} routes={routes} busy={busy || !editable}
          onRename={renameItem} onRemove={removeItem} onAddInside={addInside} />)}</ul></>}
      {!loadFailed && <form className="installation-add" onSubmit={submit} ref={formRef}>
        <h3><Layers3 size={16} /> Vložit kus do trasy</h3>
        <label htmlFor="installation-parent">Kam vložit</label>
        <select id="installation-parent" value={parentId} onChange={event => chooseParent(event.target.value)} disabled={!editable || busy}>
          <option value="">Volně do úseku</option>
          {document.items.filter(item => item.duct).map(item => <option key={item.id} value={item.id}>
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
        <div className="installation-source-modes" role="group" aria-label="Zdroj kusu">
          <label><input type="radio" checked={sourceMode === 'catalog'} onChange={() => setSourceMode('catalog')} /> Nový z katalogu</label>
          <label><input type="radio" checked={sourceMode === 'continuation'} onChange={() => setSourceMode('continuation')} /> Pokračování</label>
        </div>
        {sourceMode === 'catalog' ? <><label htmlFor="installation-catalog">Typ z katalogu</label>
          <select id="installation-catalog" value={catalogKey} onChange={event => setCatalogKey(event.target.value)} disabled={!editable || busy}>
            <option value="">Vyberte typ…</option>
            {candidates.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select></> : <><label htmlFor="installation-continuation">Navázat na sousední úsek</label>
          <select id="installation-continuation" value={continuationId} onChange={event => setContinuationId(event.target.value)} disabled={!editable || busy}>
            <option value="">Vyberte instalovaný kus…</option>
            {continuations.map(item => <option key={item.id} value={item.id}>{item.label} · {routeName(item.routeId, routes)}</option>)}
          </select>
          {continuations.length === 0 && <p className="installation-muted">V sousedním úseku není vhodný kus k navázání.</p>}</>}
        {selectedCandidate && parent && <p className={`install-fit ${fit}`}>{fit === 'possible'
          ? 'Průměry předběžně vyhovují. Ověřte produktové podmínky a skutečné uložení.'
          : fit === 'too-small' ? 'Podle zadaných průměrů se kus nevejde.'
            : 'Rozměry chybí nebo nelze ověřit společné uložení. Kompatibilita zůstává neurčená.'}</p>}
        <label htmlFor="installation-label">Označení kusu <span>(volitelné)</span></label>
        <input id="installation-label" maxLength={80} value={label} onChange={event => setLabel(event.target.value)}
          placeholder={selectedCandidate?.label ?? 'Např. Chránička CH-01'} disabled={!editable || busy} />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="primary-button" disabled={!editable || busy || !selectedCandidate || fit === 'too-small'}>
          <Plus size={16} /> {busy ? 'Ukládání…' : 'Vložit kus'}</button>
        {!editable && <p className="installation-muted">Nejdřív dokončete a uložte úpravu průběhu trasy.</p>}
      </form>}
    </>}
  </section>
}
