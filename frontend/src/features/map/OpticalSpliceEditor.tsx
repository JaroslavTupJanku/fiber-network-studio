import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, Check, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import type { InstalledItem, RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'
import { deleteOpticalSplice, fiberEndKey, loadOpticalSplice, saveOpticalSplice,
  splitCableAtChamber, spliceCableEnds, spliceIncidentCables, type FiberEnd, type OpticalSpliceDocument } from './opticalSplices'

function FiberPicker({ label, cables, value, onChange, occupied, cableLabel }: {
  label: string; cables: InstalledItem[]; value: FiberEnd | null
  onChange: (end: FiberEnd | null) => void; occupied: Set<string>
  cableLabel: (item: InstalledItem) => string
}) {
  const cable = cables.find(item => item.id === value?.itemId)
  const tube = cable?.cable?.tubes[value?.tubeIndex ?? 0]
  const firstFree = (item: InstalledItem, tubeIndex?: number): FiberEnd | null => {
    const tubes = item.cable?.tubes ?? []
    for (let index = 0; index < tubes.length; index++) {
      if (tubeIndex !== undefined && index !== tubeIndex) continue
      for (let fiberIndex = 0; fiberIndex < tubes[index].fibers.length; fiberIndex++) {
        const end = { itemId: item.id, tubeIndex: index, fiberIndex }
        if (!occupied.has(fiberEndKey(end))) return end
      }
    }
    return null
  }
  return <div className="splice-fiber-picker">
    <strong>{label}</strong>
    <label>Kabel<select value={value?.itemId ?? ''} onChange={event => {
      const next = cables.find(item => item.id === event.target.value)
      onChange(next ? firstFree(next) : null)
    }}>
      <option value="">Vyberte kabel</option>
      {cables.map(item => <option key={item.id} value={item.id} disabled={!firstFree(item)}>{cableLabel(item)}</option>)}
    </select></label>
    <label>Tuba<select disabled={!cable} value={value?.tubeIndex ?? 0}
      onChange={event => cable && onChange(firstFree(cable, Number(event.target.value)))}>
      {cable?.cable?.tubes.map((item, index) => <option key={index} value={index} disabled={!firstFree(cable, index)}>{index + 1}. {item.name}</option>)}
    </select></label>
    <label>Vlákno<select disabled={!tube} value={value?.fiberIndex ?? 0}
      onChange={event => value && onChange({ ...value, fiberIndex: Number(event.target.value) })}>
      {tube?.fibers.map((fiber, index) => <option key={index} value={index}
        disabled={value ? occupied.has(fiberEndKey({ ...value, fiberIndex: index })) : false}>
        {index + 1}. {fiber.name}{value && occupied.has(fiberEndKey({ ...value, fiberIndex: index })) ? ' · obsazené' : ''}
      </option>)}
    </select></label>
  </div>
}

export function OpticalSpliceEditor({ pointId, pointName, routes, installations,
  onInstallationsUpdated, onClose, onSaved, onDeleted }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]
  installations: RouteInstallationDocument[]; onInstallationsUpdated: (documents: RouteInstallationDocument[]) => void
  onClose: () => void
  onSaved: (document: OpticalSpliceDocument) => void; onDeleted: (pointId: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [document, setDocument] = useState<OpticalSpliceDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [left, setLeft] = useState<FiberEnd | null>(null)
  const [right, setRight] = useState<FiberEnd | null>(null)
  const [kind, setKind] = useState<'fusion' | 'connector'>('fusion')
  const [splitPendingRunId, setSplitPendingRunId] = useState<string | null>(null)
  const [splitNotice, setSplitNotice] = useState('')
  const cables = useMemo(() => spliceCableEnds(pointId, routes, installations), [pointId, routes, installations])
  const incidentCables = useMemo(() => spliceIncidentCables(pointId, routes, installations),
    [pointId, routes, installations])
  const incidentByRun = new Map<string, InstalledItem[]>()
  for (const item of incidentCables) incidentByRun.set(item.runId, [...(incidentByRun.get(item.runId) ?? []), item])
  const throughRuns = [...incidentByRun.entries()].filter(([, items]) => items.length === 2)
  const reserveIds = new Set(document?.reserves.map(reserve => reserve.itemId) ?? [])
  const reserveRuns = new Map<string, InstalledItem>()
  for (const item of incidentCables) {
    if (!reserveRuns.has(item.runId) || reserveIds.has(item.id)) reserveRuns.set(item.runId, item)
  }
  const reserveCables = [...reserveRuns.values()]
  const occupied = new Set(document?.connections.flatMap(connection => [fiberEndKey(connection.left), fiberEndKey(connection.right)]) ?? [])
  const byId = new Map(cables.map(item => [item.id, item]))
  const routeNames = new Map(routes.map(route => [route.id, route.name]))
  const cableLabel = (item: InstalledItem) => `${item.label} · ${routeNames.get(item.routeId) ?? 'Úsek'}`
  const describe = (end: FiberEnd) => {
    const cable = byId.get(end.itemId)
    const tube = cable?.cable?.tubes[end.tubeIndex]
    const fiber = tube?.fibers[end.fiberIndex]
    return `${cable ? cableLabel(cable) : 'Kabel'} · ${tube?.name ?? 'Tuba'} · ${fiber?.name ?? 'Vlákno'}`
  }
  const refresh = () => {
    setLoading(true)
    setError('')
    loadOpticalSplice(pointId).then(value => setDocument(value))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Spojku se nepodařilo načíst.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => {
    let active = true
    loadOpticalSplice(pointId).then(value => { if (active) setDocument(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Spojku se nepodařilo načíst.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [pointId])
  const addConnection = () => {
    if (!document || !left || !right) return
    if (fiberEndKey(left) === fiberEndKey(right) || occupied.has(fiberEndKey(left)) || occupied.has(fiberEndKey(right))) {
      setError('Každý konec vlákna lze použít jen jednou. Vyberte dvě volná vlákna.')
      return
    }
    if (byId.get(left.itemId)?.runId === byId.get(right.itemId)?.runId) {
      setError('Vlákna stejného kabelového běhu se zde znovu nespojují.')
      return
    }
    setDocument({ ...document, connections: [...document.connections,
      { id: crypto.randomUUID(), left, right, kind }] })
    setLeft(null); setRight(null); setError(''); setSaved(false)
  }
  const splitCable = async (item: InstalledItem) => {
    const version = installations.find(document => document.routeId === item.routeId)?.version
    if (version === undefined || busy) return
    setBusy(true); setError(''); setSplitNotice('')
    try {
      const updated = await splitCableAtChamber(pointId, item.id, version)
      onInstallationsUpdated(updated)
      setSplitPendingRunId(null)
      setSplitNotice('Kabel je v této šachtě rozdělený. Níže můžete vybrat jeho dva konce a spojit vlákna.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kabel se nepodařilo rozdělit.') }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!document || busy) return
    setBusy(true); setError('')
    try { const savedDocument = await saveOpticalSplice(document); setDocument(savedDocument); onSaved(savedDocument); setSaved(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Spojku se nepodařilo uložit.') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!document || !window.confirm(`Smazat spojku „${document.name || pointName}“ včetně všech evidovaných spojů a rezerv?`)) return
    setBusy(true); setError('')
    try { await deleteOpticalSplice(pointId); onDeleted(pointId); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Spojku se nepodařilo smazat.') }
    finally { setBusy(false) }
  }
  return createPortal(<dialog ref={dialogRef} className="splice-editor-dialog" aria-labelledby="splice-editor-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="splice-editor-header"><span className="splice-editor-emblem"><Cable size={23} /></span>
      <div><small>Šachta · {pointName}</small><h2 id="splice-editor-title">Optická spojka</h2></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít editor"><X size={19} /></button>
    </header>
    <div className="splice-editor-body">
      {loading ? <p>Načítání spojky…</p> : document && <>
        <div className="splice-location-path" aria-label="Umístění svarů"><span>Mapa: šachta</span><span>Uvnitř: optická spojka</span><span>Uvnitř spojky: svary vláken</span></div>
        <div className="splice-editor-intro"><label>Název spojky<input maxLength={80} value={document.name}
          placeholder={`Např. spojka v ${pointName}`} onChange={event => {
            setDocument({ ...document, name: event.target.value }); setSaved(false)
          }} /></label><p>Spojte konkrétní vlákna kabelů přivedených do této šachty. Tuba je uvnitř kabelu, svar uvnitř spojky. Průchozí kabel nejdřív rozdělte na dva konce; teprve potom vyberte vlákna ke spojení.</p></div>
        <div className="splice-editor-stats"><span><strong>{cables.length}</strong> konců kabelů</span>
          <span><strong>{document.connections.length}</strong> spojů</span>
          <span><strong>{cables.reduce((sum, item) => sum + (item.cable?.tubes.reduce((count, tube) => count + tube.fibers.length, 0) ?? 0), 0) - occupied.size}</strong> volných vláken</span></div>
        {throughRuns.length > 0 && <section className="splice-through-runs" aria-label="Průchozí kabely">
          <h3>Průchozí kabely v šachtě</h3>
          <p>Kabel vede přes tuto šachtu bez ukončení. Chcete-li jeho vlákna spojovat nebo odbočit, rozdělte jej zde na dva konce.</p>
          <div className="splice-through-list">{throughRuns.map(([runId, items]) => <div className="splice-through-item" key={runId}>
            <div><strong>{items[0].label}</strong><small>{items.map(item => routeNames.get(item.routeId) ?? 'Úsek').join(' · ')}</small></div>
            {splitPendingRunId === runId ? <div className="splice-split-confirm">
              <span>Vzniknou dva samostatně evidované konce kabelu. Chránička se tímto krokem nemění; rozdělit ji můžete v detailu šachty.</span>
              <div><button type="button" className="move-button" onClick={() => setSplitPendingRunId(null)}>Zpět</button>
                <button type="button" className="primary-button" disabled={busy} onClick={() => void splitCable(items[0])}>
                  {busy ? 'Rozděluji…' : 'Potvrdit rozdělení'}</button></div>
            </div> : <button type="button" className="move-button" disabled={busy}
              onClick={() => setSplitPendingRunId(runId)}>Rozdělit kabel</button>}
          </div>)}</div>
        </section>}
        {splitNotice && <p className="installation-saved" role="status"><Check size={15} /> {splitNotice}</p>}
        {cables.length < 2 ? throughRuns.length === 0
          ? <p className="splice-empty">Ke spojování potřebujete dva dostupné konce kabelů. Přiveďte do šachty další kabel.</p>
          : null : <section className="splice-connection-form" aria-label="Přidat propojení">
          <h3>Nové propojení</h3><div className="splice-pickers">
            <FiberPicker label="První konec" cables={cables} value={left} onChange={setLeft} occupied={occupied} cableLabel={cableLabel} />
            <FiberPicker label="Druhý konec" cables={cables} value={right} onChange={setRight} occupied={occupied} cableLabel={cableLabel} />
          </div><div className="splice-add-row"><label>Typ propojení<select value={kind}
            onChange={event => setKind(event.target.value as 'fusion' | 'connector')}>
            <option value="fusion">Svar</option><option value="connector">Konektorové spojení</option>
          </select></label><button type="button" className="move-button" disabled={!left || !right}
            onClick={addConnection}><Plus size={16} /> Přidat spoj</button></div>
        </section>}
        <section className="splice-connections"><h3>Evidované spoje</h3>
          {document.connections.length === 0 ? <p className="splice-empty">Zatím žádné propojení. Vlákna zůstávají volná.</p>
            : <ul>{document.connections.map(connection => <li key={connection.id}>
              <span><strong>{connection.kind === 'fusion' ? 'Svar' : 'Konektor'}</strong>
                <small>{describe(connection.left)}<br />↔ {describe(connection.right)}</small></span>
              <button type="button" className="icon-button" title="Odebrat spoj" aria-label="Odebrat spoj"
                onClick={() => { setDocument({ ...document, connections: document.connections.filter(item => item.id !== connection.id) }); setSaved(false) }}><Trash2 size={16} /></button>
            </li>)}</ul>}
        </section>
        {reserveCables.length > 0 && <section className="splice-reserves"><h3>Rezerva kabelu v šachtě</h3><p>Volná délka kabelu uložená u spojky včetně průběžných kabelů. Nejde o optický útlum.</p>
          <div>{reserveCables.map(item => <label key={item.id}>{cableLabel(item)}
            <span><input type="number" min="0" max="1000" step="0.1" value={document.reserves.find(reserve => reserve.itemId === item.id)?.lengthMeters ?? ''}
              placeholder="0" onChange={event => {
                const reserves = document.reserves.filter(reserve => reserve.itemId !== item.id)
                if (event.target.value !== '') reserves.push({ itemId: item.id, lengthMeters: Number(event.target.value) })
                setDocument({ ...document, reserves }); setSaved(false)
              }} /> m</span></label>)}</div></section>}
      </>}
      {error && <p className="form-error" role="alert">{error} <button type="button" onClick={refresh}><RefreshCw size={14} /> Načíst znovu</button></p>}
      {saved && <p className="installation-saved" role="status"><Check size={15} /> Spojka uložena.</p>}
    </div>
    <footer className="splice-editor-footer"><div>{document && document.version > 0 && <button type="button" className="danger-button"
      disabled={busy} onClick={() => void remove()}><Trash2 size={16} /> Smazat spojku</button>}</div>
      <div><button type="button" className="move-button" onClick={onClose}>Zavřít</button>
        <button type="button" className="primary-button" disabled={!document?.name.trim() || busy}
          onClick={() => void save()}><Save size={16} /> {busy ? 'Ukládání…' : 'Uložit spojku'}</button></div>
    </footer>
  </dialog>, globalThis.document.body)
}
