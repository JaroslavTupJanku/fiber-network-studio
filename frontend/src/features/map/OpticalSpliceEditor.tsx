import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, Check, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import type { InstalledItem, RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'
import { deleteOpticalSplice, fiberEndKey, loadOpticalSplice, saveOpticalSplice,
  splitCableAtChamber, spliceCableEnds, spliceIncidentCables, type FiberEnd, type OpticalSpliceDocument,
  type OpticalSplitter, type SplitterOutput } from './opticalSplices'
import { cableFibers, connectionsFromPreview, previewConnections } from './fiberBatch'

const splitterRatios = [2, 4, 8, 16, 32, 64]
const lossFields = [
  ['loss1270Db', '1270 nm'], ['loss1310Db', '1310 nm'], ['loss1490Db', '1490 nm'],
  ['loss1550Db', '1550 nm'], ['loss1577Db', '1577 nm'],
] as const
const emptyLosses = () => ({ loss1270Db: null, loss1310Db: null, loss1490Db: null,
  loss1550Db: null, loss1577Db: null })

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
  onInstallationsUpdated, onClose, onSaved, onDeleted, onOpenRoute }: {
  pointId: string; pointName: string; routes: UndergroundRoute[]
  installations: RouteInstallationDocument[]; onInstallationsUpdated: (documents: RouteInstallationDocument[]) => void
  onClose: () => void
  onSaved: (document: OpticalSpliceDocument) => void; onDeleted: (pointId: string) => void
  onOpenRoute: (routeId: string) => void
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
  const [bulkLeftId, setBulkLeftId] = useState('')
  const [bulkRightId, setBulkRightId] = useState('')
  const [bulkLeftStart, setBulkLeftStart] = useState(0)
  const [bulkRightStart, setBulkRightStart] = useState(0)
  const [bulkCount, setBulkCount] = useState(12)
  const [splitPendingRunId, setSplitPendingRunId] = useState<string | null>(null)
  const [splitNotice, setSplitNotice] = useState('')
  const [selectedSplitterId, setSelectedSplitterId] = useState<string | null>(null)
  const [pendingOutput, setPendingOutput] = useState<FiberEnd | null>(null)
  const [pendingPosition, setPendingPosition] = useState(1)
  const [activeTab, setActiveTab] = useState<'connections' | 'splitters' | 'reserves' | 'schematic'>('connections')
  const [schematicQuery, setSchematicQuery] = useState('')
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
  const occupied = new Set([
    ...document?.connections.flatMap(connection => [fiberEndKey(connection.left), fiberEndKey(connection.right)]) ?? [],
    ...document?.splitters.flatMap(splitter => [
      ...(splitter.input ? [fiberEndKey(splitter.input)] : []),
      ...splitter.outputs.map(output => fiberEndKey(output.fiber)),
    ]) ?? [],
  ])
  const bulkLeft = cables.find(item => item.id === bulkLeftId)
  const bulkRight = cables.find(item => item.id === bulkRightId)
  const bulkPreview = previewConnections(bulkLeft, bulkRight, bulkLeftStart, bulkRightStart, bulkCount, occupied)
  const selectedSplitter = document?.splitters.find(item => item.id === selectedSplitterId) ?? null
  const byId = new Map(cables.map(item => [item.id, item]))
  const routeNames = new Map(routes.map(route => [route.id, route.name]))
  const cableLabel = (item: InstalledItem) => `${item.label} · ${routeNames.get(item.routeId) ?? 'Úsek'}`
  const describe = (end: FiberEnd) => {
    const cable = byId.get(end.itemId)
    const tube = cable?.cable?.tubes[end.tubeIndex]
    const fiber = tube?.fibers[end.fiberIndex]
    return `${cable ? cableLabel(cable) : 'Kabel'} · ${tube?.name ?? 'Tuba'} · ${fiber?.name ?? 'Vlákno'}`
  }
  const schematicTerm = schematicQuery.trim().toLocaleLowerCase('cs')
  const schematicConnections = document?.connections.filter(connection => !schematicTerm
    || `${describe(connection.left)} ${describe(connection.right)} ${connection.kind}`
      .toLocaleLowerCase('cs').includes(schematicTerm)) ?? []
  const schematicSplitters = document?.splitters.filter(splitter => !schematicTerm
    || `${splitter.name} ${splitter.input ? describe(splitter.input) : ''} ${splitter.outputs.map(output => describe(output.fiber)).join(' ')}`
      .toLocaleLowerCase('cs').includes(schematicTerm)) ?? []
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
  const addBulkConnections = () => {
    if (!document || bulkPreview.length !== bulkCount || bulkPreview.some(row => row.conflict)) return
    const connections = connectionsFromPreview(bulkPreview, kind)
    if (!connections.length || document.connections.length + connections.length > 1000) return
    setDocument({ ...document, connections: [...document.connections, ...connections] })
    setBulkLeftId(''); setBulkRightId(''); setBulkLeftStart(0); setBulkRightStart(0)
    setSaved(false); setError('')
  }
  const updateSplitter = (next: OpticalSplitter) => {
    if (!document) return
    setDocument({ ...document, splitters: document.splitters.map(item => item.id === next.id ? next : item) })
    setSaved(false); setError('')
  }
  const addSplitter = () => {
    if (!document) return
    const splitter: OpticalSplitter = { id: crypto.randomUUID(), name: `Splitter ${document.splitters.length + 1}`,
      outputCount: 8, input: null, outputs: [], lossSource: '' }
    setDocument({ ...document, splitters: [...document.splitters, splitter] })
    setSelectedSplitterId(splitter.id); setPendingOutput(null); setPendingPosition(1); setSaved(false)
  }
  const removeSplitter = (splitter: OpticalSplitter) => {
    if (!document || !window.confirm(`Odebrat ${splitter.name} a uvolnit jeho vstup a ${splitter.outputs.length} připojených výstupů?`)) return
    setDocument({ ...document, splitters: document.splitters.filter(item => item.id !== splitter.id) })
    setSelectedSplitterId(null); setPendingOutput(null); setSaved(false)
  }
  const addOutput = () => {
    const position = availablePositions.includes(pendingPosition) ? pendingPosition : availablePositions[0]
    if (!selectedSplitter || !pendingOutput || occupied.has(fiberEndKey(pendingOutput))
        || position === undefined) return
    const output: SplitterOutput = { position, fiber: pendingOutput, ...emptyLosses() }
    updateSplitter({ ...selectedSplitter, outputs: [...selectedSplitter.outputs, output]
      .sort((a, b) => a.position - b.position) })
    setPendingOutput(null)
    setPendingPosition(availablePositions.find(candidate => candidate !== position) ?? 1)
  }
  const availablePositions = selectedSplitter ? Array.from({ length: selectedSplitter.outputCount }, (_, index) => index + 1)
    .filter(position => !selectedSplitter.outputs.some(item => item.position === position)) : []
  const occupiedExcept = (end: FiberEnd | null) => {
    const result = new Set(occupied)
    if (end) result.delete(fiberEndKey(end))
    return result
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
    if (!document || !window.confirm(`Smazat spojku "${document.name || pointName}" včetně všech evidovaných spojů, splitterů a rezerv?`)) return
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
        <div className="splice-location-path" aria-label="Umístění prvků"><span>Mapa: šachta</span><span>Uvnitř: optická spojka</span><span>Uvnitř spojky: svary a splittery</span></div>
        <div className="splice-editor-intro"><label>Název spojky<input maxLength={80} value={document.name}
          placeholder={`Např. spojka v ${pointName}`} onChange={event => {
            setDocument({ ...document, name: event.target.value }); setSaved(false)
           }} /></label><p>Evidujte spojení vláken, pasivní splittery a kabelové rezervy v této spojce.</p></div>
        <div className="splice-editor-stats"><span>Konce kabelů <strong>{cables.length}</strong></span>
          <span>Spoje <strong>{document.connections.length}</strong></span>
          <span>Splittery <strong>{document.splitters.length}</strong></span>
          <span>Volná vlákna <strong>{cables.reduce((sum, item) => sum + (item.cable?.tubes.reduce((count, tube) => count + tube.fibers.length, 0) ?? 0), 0) - occupied.size}</strong></span></div>
        <div className="splice-editor-tabs" role="group" aria-label="Části optické spojky">
          <button type="button" aria-pressed={activeTab === 'connections'}
            onClick={() => setActiveTab('connections')}>Spoje a kabely</button>
          <button type="button" aria-pressed={activeTab === 'splitters'}
            onClick={() => setActiveTab('splitters')}>Splittery {document.splitters.length > 0 ? `(${document.splitters.length})` : ''}</button>
          <button type="button" aria-pressed={activeTab === 'reserves'}
            onClick={() => setActiveTab('reserves')}>Rezervy</button>
          <button type="button" aria-pressed={activeTab === 'schematic'}
            onClick={() => setActiveTab('schematic')}>Schéma</button>
        </div>
        {activeTab === 'connections' && <>
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
        {cables.length >= 2 && <section className="splice-bulk" aria-label="Hromadně spojit vlákna">
          <div><h3>Hromadné spojení</h3><p>Vyberte dva kabely a počáteční vlákna. Náhled ukáže všechna párování; při konfliktu se nepřidá žádný spoj.</p></div>
          <div className="splice-bulk-fields">
            <label>První kabel<select value={bulkLeftId} onChange={event => { setBulkLeftId(event.target.value); setBulkLeftStart(0) }}>
              <option value="">Vyberte kabel</option>{cables.map(item => <option key={item.id} value={item.id}>{cableLabel(item)}</option>)}
            </select></label>
            <label>Od vlákna<select value={bulkLeftStart} disabled={!bulkLeft} onChange={event => setBulkLeftStart(Number(event.target.value))}>
              {bulkLeft && cableFibers(bulkLeft).map((choice, index) => <option key={fiberEndKey(choice.end)} value={index}>{choice.label}</option>)}
            </select></label>
            <label>Druhý kabel<select value={bulkRightId} onChange={event => { setBulkRightId(event.target.value); setBulkRightStart(0) }}>
              <option value="">Vyberte kabel</option>{cables.map(item => <option key={item.id} value={item.id}>{cableLabel(item)}</option>)}
            </select></label>
            <label>Od vlákna<select value={bulkRightStart} disabled={!bulkRight} onChange={event => setBulkRightStart(Number(event.target.value))}>
              {bulkRight && cableFibers(bulkRight).map((choice, index) => <option key={fiberEndKey(choice.end)} value={index}>{choice.label}</option>)}
            </select></label>
            <label>Počet párů<input type="number" min="1" max="96" value={bulkCount}
              onChange={event => setBulkCount(Number(event.target.value))} /></label>
          </div>
          {bulkLeft && bulkRight && (bulkPreview.length === bulkCount ? <div className="splice-bulk-preview">
            <strong>Náhled · {bulkCount} {bulkCount === 1 ? 'spoj' : 'spojů'}</strong>
            <p>{cableLabel(bulkLeft)} ↔ {cableLabel(bulkRight)}</p>
            <ol>{bulkPreview.map((row, index) => <li key={index} className={row.conflict ? 'conflict' : ''}>
              <span>{row.left.label} ↔ {row.right.label}</span>{row.conflict && <small>{row.conflict}</small>}
            </li>)}</ol>
          </div> : <p className="form-error">Zvolený rozsah přesahuje konec kabelu nebo je počet mimo 1–96.</p>)}
          <button type="button" className="move-button" disabled={bulkPreview.length !== bulkCount || bulkPreview.some(row => row.conflict)
            || !document || document.connections.length + bulkCount > 1000} onClick={addBulkConnections}>
            <Plus size={16} /> Přidat všechna párování</button>
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
        </>}
        {activeTab === 'splitters' && <section className="splice-splitters" aria-label="Splittery v optické spojce">
          <div className="splitter-heading"><div><h3>Splittery</h3>
            <p>Pasivní rozdělení jednoho vstupního vlákna do vybraných výstupů. Na mapě zůstane pouze značka šachty.</p></div>
            <button type="button" className="move-button" onClick={addSplitter}><Plus size={16} /> Přidat splitter</button></div>
          {throughRuns.length > 0 && <p className="splitter-help">Průchozí kabel nejdřív rozdělte na dva konce v části <button type="button" className="splitter-inline-link" onClick={() => setActiveTab('connections')}>Spoje a kabely</button>.</p>}
          {document.splitters.length === 0 && <p className="splice-empty">Zatím zde není žádný splitter.</p>}
          {document.splitters.length > 0 && <div className="splitter-list">{document.splitters.map(splitter =>
            <button type="button" key={splitter.id} className={splitter.id === selectedSplitterId ? 'selected' : ''}
              onClick={() => { setSelectedSplitterId(splitter.id); setPendingOutput(null); setPendingPosition(1) }}>
              <strong>{splitter.name}</strong><small>1:{splitter.outputCount} · připojeno {splitter.outputs.length}/{splitter.outputCount}</small>
            </button>)}</div>}
          {selectedSplitter && <div className="splitter-detail">
            <div className="splitter-detail-head"><strong>{selectedSplitter.name}</strong>
              <button type="button" className="icon-button" title="Odebrat splitter" aria-label="Odebrat splitter"
                onClick={() => removeSplitter(selectedSplitter)}><Trash2 size={16} /></button></div>
            <div className="splitter-fields"><label>Název<input maxLength={80} value={selectedSplitter.name}
              onChange={event => updateSplitter({ ...selectedSplitter, name: event.target.value })} /></label>
              <label>Počet výstupů<select value={selectedSplitter.outputCount}
                onChange={event => updateSplitter({ ...selectedSplitter, outputCount: Number(event.target.value) })}>
                {splitterRatios.map(ratio => <option key={ratio} value={ratio}
                  disabled={selectedSplitter.outputs.some(output => output.position > ratio)}>1:{ratio}</option>)}</select></label></div>
            <FiberPicker label="Vstupní vlákno" cables={cables} value={selectedSplitter.input}
              onChange={input => updateSplitter({ ...selectedSplitter, input })}
              occupied={occupiedExcept(selectedSplitter.input)} cableLabel={cableLabel} />
            <label>Zdroj hodnot útlumu<input maxLength={200} value={selectedSplitter.lossSource}
              placeholder="Výrobce, typ nebo odkaz na technický list"
              onChange={event => updateSplitter({ ...selectedSplitter, lossSource: event.target.value })} /></label>
            <p className="splitter-help">Útlum zadávejte pro konkrétní cestu od vstupu k výstupu. Prázdné pole znamená neznámou hodnotu. Svary a konektory se počítají zvlášť.</p>
            <div className="splitter-output-list"><h4>Připojené výstupy</h4>
              {selectedSplitter.outputs.length === 0 && <p className="splice-empty">Zatím žádný připojený výstup.</p>}
              {selectedSplitter.outputs.map(output => <details key={output.position} className="splitter-output">
                <summary><strong>Výstup {output.position}</strong><span>{describe(output.fiber)}</span></summary>
                <div className="splitter-output-body"><div className="splitter-loss-grid">
                  {lossFields.map(([field, wavelength]) => <label key={field}>Útlum {wavelength} · dB
                    <input type="number" min="0" max="100" step="0.01" value={output[field] ?? ''}
                      placeholder="Neznámý" onChange={event => updateSplitter({ ...selectedSplitter,
                        outputs: selectedSplitter.outputs.map(item => item.position === output.position
                          ? { ...item, [field]: event.target.value === '' ? null : Number(event.target.value) } : item) })} />
                  </label>)}</div><button type="button" className="move-button"
                    onClick={() => updateSplitter({ ...selectedSplitter,
                      outputs: selectedSplitter.outputs.filter(item => item.position !== output.position) })}>
                    <Trash2 size={15} /> Odpojit výstup</button></div>
              </details>)}</div>
            {availablePositions.length > 0 && <div className="splitter-add-output"><h4>Připojit další výstup</h4>
              <label>Pozice<select value={availablePositions.includes(pendingPosition) ? pendingPosition : availablePositions[0]}
                onChange={event => setPendingPosition(Number(event.target.value))}>
                {availablePositions.map(position => <option key={position} value={position}>{position}</option>)}</select></label>
              <FiberPicker label="Vlákno výstupu" cables={cables} value={pendingOutput}
                onChange={setPendingOutput} occupied={occupied} cableLabel={cableLabel} />
              <button type="button" className="move-button" disabled={!pendingOutput}
                onClick={addOutput}><Plus size={16} /> Připojit výstup</button>
            </div>}
          </div>}
        </section>}
        {activeTab === 'reserves' && (reserveCables.length > 0 ? <section className="splice-reserves"><h3>Rezerva kabelu v šachtě</h3><p>Volná délka kabelu uložená u spojky včetně průběžných kabelů. Nejde o optický útlum.</p>
          <div>{reserveCables.map(item => <label key={item.id}>{cableLabel(item)}
            <span><input type="number" min="0" max="1000" step="0.1" value={document.reserves.find(reserve => reserve.itemId === item.id)?.lengthMeters ?? ''}
              placeholder="0" onChange={event => {
                const reserves = document.reserves.filter(reserve => reserve.itemId !== item.id)
                if (event.target.value !== '') reserves.push({ itemId: item.id, lengthMeters: Number(event.target.value) })
                setDocument({ ...document, reserves }); setSaved(false)
              }} /> m</span></label>)}</div></section>
          : <p className="splice-empty">V šachtě zatím není žádný kabel pro evidenci rezervy.</p>)}
        {activeTab === 'schematic' && <section className="splice-schematic" aria-label="Schéma optických návazností v šachtě">
          <div className="splice-schematic-head"><div><h3>Schéma spojky</h3>
            <p>Fyzické návaznosti v této šachtě. Vyberte kabel a otevřete jeho úsek na mapě.</p></div>
            <span>{document.connections.length} spojů · {document.splitters.length} splitterů</span></div>
          {(document.connections.length + document.splitters.length > 8) && <label className="splice-schematic-search">Najít vlákno nebo kabel
            <input type="search" value={schematicQuery} onChange={event => setSchematicQuery(event.target.value)}
              placeholder="Tuba, vlákno, trasa…" /></label>}
          {document.connections.length === 0 && document.splitters.length === 0
            && <p className="splice-empty">Zatím zde nejsou evidované optické návaznosti.</p>}
          {schematicTerm && schematicConnections.length + schematicSplitters.length === 0
            && <p className="splice-empty">Žádné spojení neodpovídá hledání.</p>}
          <div className="splice-schematic-list">
            {schematicConnections.map(connection => <div className="splice-schematic-link" key={connection.id}>
              <button type="button" onClick={() => {
                const routeId = byId.get(connection.left.itemId)?.routeId
                if (routeId) onOpenRoute(routeId)
              }}>{describe(connection.left)}<small>Otevřít úsek na mapě</small></button>
              <span>{connection.kind === 'fusion' ? 'Svar' : 'Konektor'} ↔</span>
              <button type="button" onClick={() => {
                const routeId = byId.get(connection.right.itemId)?.routeId
                if (routeId) onOpenRoute(routeId)
              }}>{describe(connection.right)}<small>Otevřít úsek na mapě</small></button>
            </div>)}
            {schematicSplitters.map(splitter => <div className="splice-schematic-splitter" key={splitter.id}>
              <strong>{splitter.name} · 1:{splitter.outputCount}</strong>
              <div className="splice-schematic-branches"><span>{splitter.input ? describe(splitter.input) : 'Vstup nepřipojen'}</span>
                <span>→</span><div>{splitter.outputs.length ? splitter.outputs.map(output =>
                  <span key={output.position}>Výstup {output.position} · {describe(output.fiber)}</span>)
                  : <span>Výstupy nepřipojeny</span>}</div></div>
            </div>)}
          </div>
        </section>}
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
