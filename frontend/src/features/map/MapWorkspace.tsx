import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Building2, Cable, ChevronDown, CircleDot, Copy, Crosshair, FileDown, House, MapPin, Network, PanelRightClose, PanelRightOpen, RefreshCw, Route as RouteIcon, Save, Search, Trash2, Undo2, Users, X } from 'lucide-react'
import { CustomerQuickPanel } from '../customers/CustomerQuickPanel'
import { MapCanvas, type MapSnapshot } from './MapCanvas'
import { NetworkExportDialog } from './NetworkExportDialog'
import { RouteInstallationPanel } from './RouteInstallationPanel'
import { OpticalSpliceEditor } from './OpticalSpliceEditor'
import { BuildingEquipmentEditor } from './BuildingEquipmentEditor'
import { BuildingDistributionEditor } from './BuildingDistributionEditor'
import { isConnectedPremise, listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { listBuildingEquipment, type BuildingEquipmentDocument } from './buildingEquipment'
import type { OpticalPath } from './traceOpticalPath'
import type { Scenario } from '../optical-budget/model'
import { scenarioFromOpticalPath } from './pathScenario'
import { ChamberConduitPanel } from './ChamberConduitPanel'
import { listOpticalSplices, type OpticalSpliceDocument } from './opticalSplices'
import { installationSummary } from './routeInstallations'
import { useRouteInstallations } from './useRouteInstallations'
import { useMapWorkspace } from './useMapWorkspace'
import type { NetworkPoint, NetworkPointKind } from './networkPoints'
import { routeCoordinates, routeLengthMeters, splitUndergroundRoute, type RouteSplitPosition } from './undergroundRoutes'
import { acceptExampleOnArrowRight } from '../../shared/acceptExample'

const kindLabel = (kind: NetworkPointKind) => kind === 'building' ? 'Budova' : 'Šachta'
const pointKindLabel = (point: Pick<NetworkPoint, 'kind' | 'buildingType'>) =>
  point.kind === 'building' && point.buildingType === 'apartment' ? 'Bytový dům' : kindLabel(point.kind)
const countLabel = (count: number, one: string, few: string, many: string) =>
  `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`

export function MapWorkspace({ active, customerMapFocus, onOpenCustomers, onOpenBudget }: {
  active: boolean
  customerMapFocus: { id: string; sequence: number } | null
  onOpenCustomers: (buildingId: string | null) => void
  onOpenBudget: (scenario: Scenario) => void
}) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [sideTab, setSideTab] = useState<'infrastructure' | 'customers'>('infrastructure')
  const [spliceOpen, setSpliceOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [snapshotRequest, setSnapshotRequest] = useState(0)
  const [mapSnapshot, setMapSnapshot] = useState<MapSnapshot | null>(null)
  const [distributions, setDistributions] = useState<BuildingDistributionDocument[]>([])
  useEffect(() => { void listBuildingDistribution().then(setDistributions).catch(() => {}) }, [])
  const [equipment, setEquipment] = useState<BuildingEquipmentDocument[]>([])
  const [tracedPath, setTracedPath] = useState<OpticalPath | null>(null)
  useEffect(() => { void listBuildingEquipment().then(setEquipment).catch(() => {}) }, [])
  const [splices, setSplices] = useState<OpticalSpliceDocument[]>([])
  const [splicesLoadError, setSplicesLoadError] = useState(false)
  useEffect(() => {
    let live = true
    listOpticalSplices().then(documents => { if (live) { setSplices(documents); setSplicesLoadError(false) } })
      .catch(() => { if (live) setSplicesLoadError(true) })
    return () => { live = false }
  }, [])
  const [routeTab, setRouteTab] = useState<'installations' | 'route'>('installations')
  const [expandedLists, setExpandedLists] = useState({ building: true, chamber: true, route: true })
  const [splitActive, setSplitActive] = useState(false)
  const [splitSelection, setSplitSelection] = useState<RouteSplitPosition | null>(null)
  const [splitName, setSplitName] = useState('')
  const [splitBusy, setSplitBusy] = useState(false)
  const [splitError, setSplitError] = useState('')
  const detailsPanelRef = useRef<HTMLElement>(null)
  const lastRouteId = useRef<string | null>(null)
  const lastCustomerFocusSequence = useRef(0)
  const [listHoveredPointId, setListHoveredPointId] = useState<string | null>(null)
  const [listHoveredRouteId, setListHoveredRouteId] = useState<string | null>(null)
  const [mapHoveredPointId, setMapHoveredPointId] = useState<string | null>(null)
  const [mapHoveredRouteId, setMapHoveredRouteId] = useState<string | null>(null)
  const [routeFocusRequest, setRouteFocusRequest] = useState<{ id: string, sequence: number } | null>(null)
  const [pointFocusRequest, setPointFocusRequest] = useState<{ id: string, sequence: number } | null>(null)
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(frame)
  }, [active, panelOpen])
  const {
    points, loading, loadError, actionError, saving, activeTool, moving, editor, route,
    selectedLocation, selectedParcel, parcelStatus, query, visiblePoints,
    buildings, chambers, preview, setQuery, setEditor, setSelectedLocation,
    setMoving, setActiveTool, setLoading, setReloadVersion, setActionError,
    clearParcel, handleToolChange, handleRouteToolChange, handleRouteSelect, handleRouteEdit,
    handleLocationClick, handlePointSelect, relocatePoint,
    handleToolDrop, moveDraft, savePoint, removePoint, copyCoordinates, startDraft,
  } = useMapWorkspace()
  useEffect(() => {
    if (!active || !customerMapFocus || customerMapFocus.sequence === lastCustomerFocusSequence.current) return
    const frame = requestAnimationFrame(() => {
      lastCustomerFocusSequence.current = customerMapFocus.sequence
      handlePointSelect(customerMapFocus.id)
      setPointFocusRequest(current => ({ id: customerMapFocus.id, sequence: (current?.sequence ?? 0) + 1 }))
      setSideTab('infrastructure')
      setPanelOpen(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [active, customerMapFocus, handlePointSelect])
  const routeDraft = route.draft
  useEffect(() => {
    const id = routeDraft?.id ?? null
    if (id && id !== lastRouteId.current) {
      setRouteTab('installations')
      detailsPanelRef.current?.scrollTo({ top: 0 })
    }
    if (id !== lastRouteId.current) {
      setSplitActive(false)
      setSplitSelection(null)
      setSplitError('')
    }
    lastRouteId.current = id
  }, [routeDraft?.id])
  const selectedSavedRoute = routeDraft?.id ? route.routes.find(item => item.id === routeDraft.id) : null
  const activeRouteTab = route.drawing || splitActive ? 'route' : routeTab
  const installations = useRouteInstallations(routeDraft?.id ?? null)
  const installationByRoute = new Map(installations.documents.map(document => [document.routeId, document]))
  const routeLength = routeDraft?.endPointId
    ? routeLengthMeters(routeCoordinates(routeDraft, points)) : null
  const pointName = (id: string | null) => points.find(point => point.id === id)?.name ?? 'Vyberte na mapě'
  const endpointPoints = points.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  const attachedRoutes = editor?.id ? route.routes.filter(item => item.startPointId === editor.id || item.endPointId === editor.id) : []
  const selectedSplice = editor?.id ? splices.find(item => item.pointId === editor.id) : null
  const selectedEquipment = editor?.id ? equipment.find(item => item.pointId === editor.id) : null
  const selectedDistribution = editor?.id ? distributions.find(item => item.pointId === editor.id) : null
  const fusionCount = selectedSplice?.connections.filter(item => item.kind === 'fusion').length ?? 0
  const connectorCount = selectedSplice?.connections.filter(item => item.kind === 'connector').length ?? 0
  const splitterCount = selectedSplice?.splitters.length ?? 0
  const spliceConnectionsLabel = [
    fusionCount ? countLabel(fusionCount, 'svar', 'svary', 'svarů') : null,
    connectorCount ? countLabel(connectorCount, 'konektorové spojení', 'konektorová spojení', 'konektorových spojení') : null,
    splitterCount ? countLabel(splitterCount, 'splitter', 'splittery', 'splitterů') : null,
  ].filter(Boolean).join(' · ') || 'Zatím bez propojených vláken'
  const togglePanel = () => {
    setPanelOpen(value => !value)
    setListHoveredPointId(null)
    setListHoveredRouteId(null)
  }
  const selectRouteTab = (tab: 'installations' | 'route') => {
    setRouteTab(tab)
    detailsPanelRef.current?.scrollTo({ top: 0 })
  }
  const selectSavedRoute = (id: string) => {
    setSplitActive(false)
    setSplitSelection(null)
    setSideTab('infrastructure')
    selectRouteTab('installations')
    setPanelOpen(true)
    handleRouteSelect(id)
  }
  const editSavedRoute = (id: string) => {
    if (splitActive || splitBusy) return
    setSideTab('infrastructure')
    selectRouteTab('route')
    setPanelOpen(true)
    handleRouteEdit(id)
  }
  const beginRouteContinuation = (pointId: string) => {
    const started = route.continueFrom(pointId)
    selectRouteTab('route')
    if (started) setPointFocusRequest(current => ({ id: pointId, sequence: (current?.sequence ?? 0) + 1 }))
  }
  const beginSplit = () => {
    if (!selectedSavedRoute || !routeDraft || route.drawing || splitBusy) return
    if (routeDraft.name !== selectedSavedRoute.name
      || routeDraft.startPointId !== selectedSavedRoute.startPointId
      || routeDraft.endPointId !== selectedSavedRoute.endPointId
      || JSON.stringify(routeDraft.waypoints) !== JSON.stringify(selectedSavedRoute.waypoints)) {
      setSplitError('Nejdřív uložte změny trasy. Potom ji můžete rozdělit.')
      return
    }
    setSplitActive(true)
    setSplitSelection(null)
    setSplitName('Nová šachta')
    setSplitError('')
    selectRouteTab('route')
  }
  const cancelSplit = () => { setSplitActive(false); setSplitSelection(null); setSplitError('') }
  const finishSplit = async () => {
    if (!selectedSavedRoute || !splitSelection || !splitName.trim() || splitBusy) return
    setSplitBusy(true)
    setSplitError('')
    try {
      const outcome = await splitUndergroundRoute(selectedSavedRoute, installations.document.version,
        splitSelection, splitName)
      route.setRoutes(current => [...current.map(item => item.id === outcome.firstRoute.id ? outcome.firstRoute : item),
        outcome.secondRoute])
      route.setDraft({ ...outcome.firstRoute })
      setReloadVersion(value => value + 1)
      installations.refresh()
      void listOpticalSplices().then(setSplices).catch(() => {})
      void listBuildingEquipment().then(setEquipment).catch(() => {})
      void listBuildingDistribution().then(setDistributions).catch(() => {})
      cancelSplit()
    } catch (reason) {
      setSplitError(reason instanceof Error ? reason.message : 'Trasu se nepodařilo rozdělit.')
    } finally { setSplitBusy(false) }
  }
  useEffect(() => {
    if (!splitActive) return
    const onEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') cancelSplit() }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [splitActive])
  const handleRouteTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (route.drawing || splitActive || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 'installations' : event.key === 'End' ? 'route'
      : activeRouteTab === 'installations' ? 'route' : 'installations'
    selectRouteTab(next)
    document.getElementById(`route-tab-${next}`)?.focus()
  }
  const backFromDetail = () => {
    cancelSplit()
    if (editor && route.drawing) setEditor(null)
    else if (route.drawing) route.cancelDrawing()
    else route.cancel()
    if (!route.drawing) setEditor(null)
    setSelectedLocation(null)
    clearParcel()
    setMoving(false)
    setActiveTool(null)
    setActionError('')
  }
  const filteredRoutes = route.visibleRoutes.filter(item => item.name.toLocaleLowerCase('cs').includes(query.toLocaleLowerCase('cs')))
  const visibleBuildings = visiblePoints.filter(point => point.kind === 'building')
  const visibleChambers = visiblePoints.filter(point => point.kind === 'chamber')

  return (
    <main className={`workspace${panelOpen ? '' : ' panel-collapsed'}`} hidden={!active}>
      <section className={`map-region${activeTool || moving ? ' point-placement-mode' : route.drawing || splitActive ? ' route-drawing-mode' : ''}`} aria-label="Mapa sítě">
        <MapCanvas
          points={points}
          routes={route.routes}
          installations={installations.loading || installations.loadFailed ? null : installations.documents}
          splices={splices}
          installationLoading={installations.loading}
          selectedRouteId={routeDraft?.id ?? null}
          tracedRouteIds={tracedPath?.routeIds ?? []}
          hoveredRouteId={mapHoveredRouteId ?? listHoveredRouteId}
          onMapRouteHoverChange={setMapHoveredRouteId}
          routeFocusRequest={routeFocusRequest}
          pointFocusRequest={pointFocusRequest}
          routeDraft={splitActive ? selectedSavedRoute ?? null : route.preview}
          drawingRoute={route.drawing && !editor && !activeTool}
          routePaused={route.drawing && Boolean(activeTool)}
          routeError={route.error}
          routeSplitActive={splitActive}
          routeSplitSelection={splitSelection}
          onRouteSplitPick={setSplitSelection}
          onRouteSplitCancel={cancelSplit}
          routeBuildingCrossings={route.buildingCrossings}
          routeNearbyBuildings={route.nearbyBuildings}
          routeCheckingBuildings={route.checkingBuildings}
          pointMoveError={actionError}
          onRouteToolChange={() => { selectRouteTab('route'); handleRouteToolChange() }}
          onRouteSelect={selectSavedRoute}
          onRouteEdit={editSavedRoute}
          onRouteWaypointInsert={route.insertWaypoint}
          onRouteWaypointMove={route.moveWaypoint}
          onRouteWaypointRemove={route.removeWaypoint}
          onRouteUndo={route.undo}
          onRouteFinish={route.finish}
          onRouteCancel={route.cancelDrawing}
          selectedPointId={editor?.id ?? null}
          hoveredPointId={mapHoveredPointId ?? listHoveredPointId}
          onMapPointHoverChange={setMapHoveredPointId}
          selectedParcel={selectedParcel}
          preview={preview}
          activeTool={activeTool}
          placementActive={activeTool !== null || moving}
          toolsDisabled={loading || loadError || splitActive || splitBusy || Boolean(editor && !editor.id)}
          onToolChange={handleToolChange}
          onToolDrop={(kind, location) => { setPanelOpen(true); setSideTab('infrastructure'); handleToolDrop(kind, location) }}
          onLocationClick={(location, lookupParcel) => { setPanelOpen(true); setSideTab('infrastructure'); handleLocationClick(location, lookupParcel) }}
          onPointSelect={id => { setPanelOpen(true); if (points.find(point => point.id === id)?.kind !== 'building') setSideTab('infrastructure'); handlePointSelect(id) }}
          onPointMove={(id, location) => { setPanelOpen(true); return relocatePoint(id, location) }}
          onDraftMove={moveDraft}
          onCadastreDisable={clearParcel}
          snapshotRequest={snapshotRequest}
          onMapSnapshot={setMapSnapshot}
        />
      </section>

      <aside className={`details-panel${panelOpen ? '' : ' collapsed'}`} aria-label="Boční panel" ref={detailsPanelRef}>
        {!panelOpen && <div className="details-rail-tabs">
          <button className="details-rail-toggle" type="button" onClick={() => { setSideTab('infrastructure'); setPanelOpen(true) }}
            aria-label="Rozbalit Infrastrukturu" title="Rozbalit Infrastrukturu">
            <PanelRightOpen size={19} aria-hidden="true" /><span>Infrastruktura</span></button>
          <button className="details-rail-toggle" type="button" onClick={() => { setSideTab('customers'); setPanelOpen(true) }}
            aria-label="Rozbalit Zákazníky" title="Rozbalit Zákazníky">
            <Users size={19} aria-hidden="true" /><span>Zákazníci</span></button>
        </div>}
        {panelOpen && <nav className="side-workspace-tabs" aria-label="Boční pracovní plocha">
          <button type="button" aria-pressed={sideTab === 'infrastructure'} onClick={() => { setSideTab('infrastructure'); detailsPanelRef.current?.scrollTo({ top: 0 }) }}>
            <Network size={15} /> Infrastruktura</button>
          <button type="button" aria-pressed={sideTab === 'customers'} onClick={() => { setSideTab('customers'); detailsPanelRef.current?.scrollTo({ top: 0 }) }}>
            <Users size={15} /> Zákazníci</button>
          <button type="button" className="side-workspace-collapse" title="Sbalit panel" aria-label="Sbalit panel" onClick={togglePanel}>
            <PanelRightClose size={17} /></button>
        </nav>}
        <div hidden={sideTab !== 'infrastructure'}>
        <div className="panel-heading">
          <div>
            {(editor || selectedLocation || routeDraft) && <button className="panel-back-button" type="button" onClick={backFromDetail}>
              <ArrowLeft size={16} aria-hidden="true" /> {editor && route.drawing ? 'Zpět k trase' : route.drawing && routeDraft?.id ? 'Zpět k trase' : 'Zpět na přehled'}
            </button>}
            <span className="section-label">{editor && route.drawing ? 'Přidat během kreslení' : routeDraft?.id && !editor ? 'Podzemní trasa' : selectedLocation && selectedParcel ? 'Katastr' : 'Infrastruktura'}</span>
            <h1>{editor ? editor.id ? pointKindLabel(editor) : `Nová ${editor.kind === 'building' ? 'budova' : 'šachta'}` : routeDraft ? routeDraft.id ? routeDraft.name || 'Podzemní trasa' : 'Nová podzemní trasa' : selectedLocation ? selectedParcel ? `Parcela ${selectedParcel.number}` : 'Detail místa' : 'Objekty sítě'}</h1>
          </div>
          <button type="button" className="panel-export-button move-button" title="Tisk a export mapy, schémat a přehledů"
            onClick={() => { setMapSnapshot(null); setSnapshotRequest(value => value + 1); setExportOpen(true) }}>
            <FileDown size={16} /> Výstupy</button>
        </div>

        {!routeDraft && <div className="point-counts" aria-label="Počet objektů">
          <span><House size={15} aria-hidden="true" /> Budovy <strong>{buildings}</strong></span>
          <span><CircleDot size={15} aria-hidden="true" /> Šachty <strong>{chambers}</strong></span>
          <span><RouteIcon size={15} aria-hidden="true" /> Trasy <strong>{route.routes.length}</strong></span>
        </div>}

        {route.loadError && (
          <div className="panel-error" role="alert"><span>Trasy se nenačetly.</span>
            <button type="button" className="icon-button" title="Načíst trasy znovu" aria-label="Načíst trasy znovu" onClick={() => {
              route.setLoading(true)
              route.setReloadVersion(value => value + 1)
            }}><RefreshCw size={16} /></button></div>
        )}

        {loadError && (
          <div className="panel-error" role="alert">
            <span>API není dostupné. Objekty se nenačetly.</span>
            <button type="button" className="icon-button" title="Načíst znovu" aria-label="Načíst objekty znovu" onClick={() => {
              setLoading(true)
              setReloadVersion((value) => value + 1)
            }}><RefreshCw size={16} /></button>
          </div>
        )}

        {selectedSavedRoute && !editor && <>
          <div className="route-tab-context">
            <span>{pointName(selectedSavedRoute.startPointId)} → {pointName(selectedSavedRoute.endPointId)}</span>
            {!route.drawing && <div className="route-context-actions"><button type="button" className="route-continue-quick route-edit-quick"
              disabled={route.saving || splitActive || splitBusy} onClick={() => { selectRouteTab('route'); route.startEditing() }}>
              <RouteIcon size={14} /> Upravit průběh trasy
            </button><button type="button" className="route-continue-quick" disabled={route.saving || splitActive || splitBusy}
              onClick={() => beginRouteContinuation(selectedSavedRoute.endPointId)}>
              <RouteIcon size={14} /> Navázat od konce
            </button></div>}
          </div>
          <div className="route-detail-tabs" role="tablist" aria-label="Detail podzemní trasy" onKeyDown={handleRouteTabKeyDown}>
            <button type="button" id="route-tab-installations" role="tab" aria-controls="route-panel-installations"
              aria-selected={activeRouteTab === 'installations'} tabIndex={activeRouteTab === 'installations' ? 0 : -1}
              disabled={route.drawing || splitActive} onClick={() => selectRouteTab('installations')}>Osazení</button>
            <button type="button" id="route-tab-route" role="tab" aria-controls="route-panel-route"
              aria-selected={activeRouteTab === 'route'} tabIndex={activeRouteTab === 'route' ? 0 : -1}
              onClick={() => selectRouteTab('route')}>Trasa</button>
          </div>
          <div className="route-tab-panel" id="route-panel-installations" role="tabpanel"
            aria-labelledby="route-tab-installations" hidden={activeRouteTab !== 'installations'}>
            <RouteInstallationPanel key={selectedSavedRoute.id} route={selectedSavedRoute}
              routes={route.routes} editable={!route.drawing && route.preview === null} installations={installations} />
          </div>
        </>}

        {routeDraft && !editor && (
          <div className="route-tab-panel" id={selectedSavedRoute ? 'route-panel-route' : undefined}
            role={selectedSavedRoute ? 'tabpanel' : undefined} aria-labelledby={selectedSavedRoute ? 'route-tab-route' : undefined}
            hidden={!!selectedSavedRoute && activeRouteTab !== 'route'}>
          <form className="point-form route-form" onSubmit={route.save}>
            {routeDraft.id && <h2 className="route-detail-title">Údaje trasy</h2>}
            <p className="route-help">{route.drawing
              ? routeDraft.endPointId
                ? 'Kliknutím na úsek přidáte lomový bod. Bod můžete přetáhnout nebo kliknutím vybrat k odebrání (funguje i Delete). Budovu či šachtu také přesunete tažením. Potom úpravu dokončete a uložte.'
                : routeDraft.startPointId
                ? `Trasa začíná v objektu ${pointName(routeDraft.startPointId)}. Klikněte na další budovu nebo šachtu v mapě; kliknutím mimo objekty přidáte lomový bod.`
                : 'Klikněte na výchozí budovu nebo šachtu v mapě. Konec můžete vybrat i v polích níže.'
              : routeDraft.id
                ? 'Trasa v mapě ukazuje průběh podzemního vedení mezi dvěma body. Chráničky a kabely najdete na záložce Osazení; svary patří do spojky v šachtě.'
                : 'Trasa spojuje dva body sítě. Nejdřív ji uložte, potom do ní můžete vložit chráničky a kabely.'}</p>
            {route.drawing ? <div className="route-endpoint-fields">
              <label htmlFor="route-start">Začátek trasy
                <select id="route-start" value={routeDraft.startPointId ?? ''}
                  onChange={event => route.setEndpoint('startPointId', event.target.value || null)}>
                  <option value="">Vyberte objekt</option>
                  {endpointPoints.map(point => <option key={point.id} value={point.id} disabled={point.id === routeDraft.endPointId}>{point.name} · {kindLabel(point.kind)}</option>)}
                </select>
              </label>
              <label htmlFor="route-end">Konec trasy
                <select id="route-end" value={routeDraft.endPointId ?? ''}
                  onChange={event => route.setEndpoint('endPointId', event.target.value || null)}>
                  <option value="">Vyberte objekt</option>
                  {endpointPoints.map(point => <option key={point.id} value={point.id} disabled={point.id === routeDraft.startPointId}>{point.name} · {kindLabel(point.kind)}</option>)}
                </select>
              </label>
            </div> : <div className="route-endpoints">
              <span><strong>Od</strong>{pointName(routeDraft.startPointId)}</span>
              <span><strong>Do</strong>{pointName(routeDraft.endPointId)}</span>
            </div>}
            {selectedSavedRoute && !route.drawing && <div className="route-continuation">
              <strong>Navázat další úsek</strong>
              <p>Každý úsek spojuje dva objekty. Chcete-li vést trasu přes šachtu dál, začněte nový úsek z jejího bodu. Osazení nového úseku pak navážete zvlášť.</p>
              <div className="route-continuation-actions">
                <button type="button" className="move-button" disabled={route.saving}
                  onClick={() => beginRouteContinuation(selectedSavedRoute.startPointId)}>
                  <RouteIcon size={15} /> Od: {pointName(selectedSavedRoute.startPointId)}
                </button>
                <button type="button" className="move-button" disabled={route.saving}
                  onClick={() => beginRouteContinuation(selectedSavedRoute.endPointId)}>
                  <RouteIcon size={15} /> Od: {pointName(selectedSavedRoute.endPointId)}
                </button>
              </div>
            </div>}
            {selectedSavedRoute && !route.drawing && <div className="route-split-card">
              <strong>Vložit šachtu do této trasy</strong>
              <p>Vyberte místo přímo na trase. Vzniknou dva navazující úseky; průchozí chráničky a kabely zůstanou propojené.</p>
              {!splitActive ? <button type="button" className="move-button" disabled={route.saving || splitBusy}
                onClick={beginSplit}><MapPin size={16} /> Vybrat místo na mapě</button> : <>
                <label htmlFor="split-chamber-name">Název nové šachty</label>
                <input id="split-chamber-name" maxLength={80} value={splitName}
                  onChange={event => setSplitName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void finishSplit() } }} />
                {splitSelection ? <p>Vybrané místo: {splitSelection.location.latitude.toFixed(6)}°,
                  {' '}{splitSelection.location.longitude.toFixed(6)}°. Kliknutím na trasu ho můžete změnit.</p>
                  : <p className="route-help">Klikněte na některý úsek vybrané trasy v mapě.</p>}
                {installations.document.items.some(item => item.cable?.name && item.actualLengthMeters != null)
                  && <p className="route-help">Původní délka kabelu zůstane v evidenci jako údaj před rozdělením.
                    Délky nových úseků bude potřeba doplnit zvlášť.</p>}
                {splitError && <p className="form-error" role="alert">{splitError}</p>}
                <div className="route-continuation-actions">
                  <button type="button" className="primary-button" disabled={!splitSelection || !splitName.trim() || splitBusy}
                    onClick={() => void finishSplit()}>{splitBusy ? 'Rozděluji…' : 'Vložit šachtu a rozdělit'}</button>
                  <button type="button" className="move-button" disabled={splitBusy} onClick={cancelSplit}>Zrušit</button>
                </div>
              </>}
              {!splitActive && splitError && <p className="form-error" role="alert">{splitError}</p>}
            </div>}
            {routeLength !== null && <p className="route-length">Přibližná délka z mapy: <strong>{Math.round(routeLength).toLocaleString('cs-CZ')} m</strong><small>Není to délka instalovaného kabelu.</small></p>}
            {route.drawing && <>
              <div className="route-drawing-actions">
                <button type="button" className="move-button" onClick={route.undo} disabled={!routeDraft.startPointId}><Undo2 size={16} /> Zpět</button>
                <button type="button" className="move-button" onClick={route.resetGeometry}>Začít znovu</button>
              </div>
              <p className="route-help">Klikněte nebo táhněte přímo za úsek trasy. Lomový bod můžete později znovu přetáhnout; mění jen průběh trasy, není samostatným objektem sítě. Dotčené budovy se při úpravě zvýrazní červeně. Při dokončení průchod znovu ověříme podle RÚIAN.</p>
              {routeDraft.waypoints.length > 0 && <div className="route-waypoints"><strong>Lomové body</strong>{routeDraft.waypoints.map((point, index) =>
                <div key={index}><span>{index + 1}. {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span>
                  <button type="button" className="icon-button" onClick={() => route.removeWaypoint(index)} aria-label={`Odebrat lomový bod ${index + 1}`}><X size={14} /></button></div>)}</div>}
              <button type="button" className="primary-button" onClick={route.finish} disabled={!routeDraft.endPointId}>Dokončit kreslení</button>
            </>}
            <label htmlFor="route-name">Název trasy</label>
            <input id="route-name" maxLength={80} required value={routeDraft.name}
              onChange={event => route.setDraft(current => current ? { ...current, name: event.target.value } : current)}
              onKeyDown={event => acceptExampleOnArrowRight(event, name => route.setDraft(current => current ? { ...current, name } : current))}
              title="Šipka doprava převezme šedý příklad"
              placeholder="Např. Šachta S-01 – Dům 12" />
            {!route.drawing && routeDraft.id && <button type="button" className="move-button"
              disabled={splitActive || splitBusy} onClick={route.startEditing}><RouteIcon size={16} /> Upravit průběh trasy</button>}
            {route.error && <p className="form-error" role="alert">{route.error}</p>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={route.drawing || route.saving || splitActive || splitBusy || !routeDraft.name.trim() || !routeDraft.endPointId}><Save size={16} /> {route.saving ? 'Ukládání…' : 'Uložit'}</button>
              {routeDraft.id && <button className="danger-button" type="button" disabled={route.saving || splitActive || splitBusy} onClick={route.remove}><Trash2 size={16} /> Smazat</button>}
            </div>
          </form>
          </div>
        )}

        {editor && (
          <form className="point-form" onSubmit={savePoint}>
            <label htmlFor="point-name">Název</label>
            <input id="point-name" autoFocus required maxLength={80} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              onKeyDown={event => acceptExampleOnArrowRight(event, name => setEditor(current => current ? { ...current, name } : current))}
              title="Šipka doprava převezme šedý příklad" placeholder={editor.kind === 'building' ? 'Např. Dům 12' : 'Např. Šachta S-01'} />
            <div className="point-kind">{editor.kind === 'building' && editor.buildingType === 'apartment'
              ? <Building2 size={16} aria-hidden="true" /> : <span className={`kind-dot ${editor.kind}`} />}{pointKindLabel(editor)}</div>
            {editor.kind === 'building' && <label className="building-type-field" htmlFor="building-type">Typ budovy
              <select id="building-type" value={editor.buildingType ?? 'standard'}
                onChange={event => setEditor({ ...editor, buildingType: event.target.value as 'standard' | 'apartment' })}>
                <option value="standard">Běžná budova</option><option value="apartment">Bytový dům</option>
              </select><small>Ikona bytového domu usnadní orientaci na mapě. Domovní rozvod lze evidovat u obou typů.</small></label>}
            <div className="coordinates-row">
              <span>{editor.latitude.toFixed(6)}°, {editor.longitude.toFixed(6)}°</span>
              <button type="button" className="icon-button" onClick={() => copyCoordinates(editor)} title="Kopírovat souřadnice" aria-label="Kopírovat souřadnice"><Copy size={16} /></button>
            </div>
            <p className="point-placement-hint">{route.drawing && !editor.id
              ? routeDraft?.endPointId ? 'Po uložení se vrátíte k rozkreslené trase.'
                : routeDraft?.startPointId ? 'Po uložení bude tento objekt koncem rozkreslené trasy.'
                  : 'Po uložení bude tento objekt začátkem rozkreslené trasy.' : editor.id
              ? `Přetažením nebo kliknutím na nové místo se poloha uloží hned. Přilehlý průběh trasy se plynule přizpůsobí. ${editor.kind === 'building' ? 'Název a typ budovy' : 'Název'} uložíte tlačítkem Uložit.`
              : 'Polohu doladíte přetažením značky na mapě.'}</p>
            <button type="button" className={moving ? 'move-button active' : 'move-button'} onClick={() => {
              setMoving((value) => !value)
              setActiveTool(null)
            }}><Crosshair size={16} aria-hidden="true" /> {moving ? 'Klikněte na nové místo' : 'Změnit polohu kliknutím'}</button>
            {editor.id && editor.kind === 'chamber' && <ChamberConduitPanel key={editor.id}
              pointId={editor.id} routes={route.routes} documents={installations.documents}
              onUpdated={installations.replaceDocuments} onOpenRoute={selectSavedRoute} />}
            {editor.id && editor.kind === 'building' && <section className="chamber-splice-card" aria-labelledby="building-equipment-heading">
              <div className="chamber-splice-heading"><span className="chamber-splice-icon"><Cable size={17} aria-hidden="true" /></span>
                <div><h2 id="building-equipment-heading">Optické vybavení</h2><p>{selectedEquipment
                  ? `${countLabel(selectedEquipment.racks.length, 'stojan', 'stojany', 'stojanů')} · ${countLabel(selectedEquipment.ports.length, 'port', 'porty', 'portů')}`
                  : 'V budově zatím není evidováno'}</p></div></div>
              <div className="chamber-splice-actions"><button type="button" className="move-button" onClick={() => setEquipmentOpen(true)}>
                {selectedEquipment ? 'Otevřít vybavení' : 'Přidat stojan, ODF a OLT'}</button>
                {tracedPath && <button type="button" className="move-button" onClick={() => setTracedPath(null)}>Skrýt zvýraznění cesty</button>}</div>
            </section>}
            {editor.id && editor.kind === 'building' && <section className="chamber-splice-card" aria-labelledby="building-distribution-heading">
              <div className="chamber-splice-heading"><span className="chamber-splice-icon"><Building2 size={17} aria-hidden="true" /></span>
                <div><h2 id="building-distribution-heading">Domovní FTTH rozvody</h2><p>{selectedDistribution
                  ? `${countLabel(selectedDistribution.risers.length, 'stoupačka', 'stoupačky', 'stoupaček')} · ${selectedDistribution.premises.filter(isConnectedPremise).length}/${selectedDistribution.premises.length} připojených míst`
                  : 'Zatím bez stoupaček a přípojných míst'}</p></div></div>
              <div className="chamber-splice-actions"><button type="button" className="move-button" onClick={() => setDistributionOpen(true)}>
                {selectedDistribution ? 'Otevřít rozvod' : 'Navrhnout domovní rozvod'}</button></div>
            </section>}
            {editor.id && editor.kind === 'chamber' && <section className="chamber-splice-card" aria-labelledby="chamber-splice-heading">
              <div className="chamber-splice-heading">
                <span className="chamber-splice-icon"><Cable size={17} aria-hidden="true" /></span>
                <div><h2 id="chamber-splice-heading">Optická spojka</h2>
                  <p>{selectedSplice?.name ?? (splicesLoadError ? 'Údaje se nenačetly' : 'V šachtě zatím není evidována')}</p></div>
                {selectedSplice && <p className="chamber-splice-count">{spliceConnectionsLabel}</p>}
              </div>
              <div className="chamber-splice-actions">
                <button type="button" className="move-button" onClick={() => setSpliceOpen(true)}>
                  {selectedSplice ? 'Otevřít spojku' : splicesLoadError ? 'Zkusit otevřít spojku' : 'Přidat spojku'}
                </button>
                <details className="chamber-splice-help"><summary>Co je spojka v šachtě?</summary>
                  <p>Šachta je přístupný podzemní prostor. Kabel jí může jen procházet; spojka je samostatné pouzdro pro propojení vláken.</p>
                </details>
              </div>
            </section>}
            {actionError && <p className="form-error" role="alert">{actionError}</p>}
            {attachedRoutes.length > 0 && <div className="point-dependencies"><strong>Navazující trasy ({attachedRoutes.length})</strong>
              <p>Před smazáním objektu odstraňte nebo přepojte tyto trasy a jejich osazení.</p>
              {attachedRoutes.map(item => <button type="button" key={item.id} onClick={() => selectSavedRoute(item.id)}>{item.name} →</button>)}
            </div>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving || !editor.name.trim()}><Save size={16} aria-hidden="true" /> {saving ? 'Ukládání…' : 'Uložit'}</button>
              {editor.id && <button className="danger-button" type="button" disabled={saving} onClick={removePoint} title="Smazat objekt"><Trash2 size={16} aria-hidden="true" /> Smazat</button>}
            </div>
          </form>
        )}

        {!routeDraft && !editor && selectedLocation && (
          <div className="location-details">
            <div className="location-heading">{selectedParcel ? <MapPin size={18} aria-hidden="true" /> : <Crosshair size={18} aria-hidden="true" />}{selectedParcel ? 'Vybraná parcela' : 'Vybrané místo'}</div>
            {parcelStatus === 'loading' && <p className="parcel-message" role="status">Načítání parcely…</p>}
            {parcelStatus === 'not-found' && <p className="parcel-message" role="status">Na tomto místě není parcela dostupná.</p>}
            {parcelStatus === 'error' && <div className="panel-error" role="alert"><span>Parcela se nenačetla.</span><button type="button" className="icon-button" onClick={() => handleLocationClick(selectedLocation, true)} title="Načíst parcelu znovu" aria-label="Načíst parcelu znovu"><RefreshCw size={16} /></button></div>}
            {selectedParcel && <dl className="parcel-facts"><div><dt>Katastrální území</dt><dd>{selectedParcel.cadastralAreaName ?? selectedParcel.cadastralAreaCode}</dd></div><div><dt>Výměra</dt><dd>{selectedParcel.areaSquareMeters?.toLocaleString('cs-CZ') ?? '–'} m²</dd></div></dl>}
            <div className="coordinates-row"><span>{selectedLocation.latitude.toFixed(6)}°, {selectedLocation.longitude.toFixed(6)}°</span><button type="button" className="icon-button" onClick={() => copyCoordinates(selectedLocation)} title="Kopírovat souřadnice" aria-label="Kopírovat souřadnice"><Copy size={16} /></button></div>
            <div className="quick-add">
              <button type="button" onClick={() => startDraft('building', selectedLocation)}><House size={16} aria-hidden="true" /> Budova</button>
              <button type="button" onClick={() => startDraft('chamber', selectedLocation)}><CircleDot size={16} aria-hidden="true" /> Šachta</button>
            </div>
          </div>
        )}

        {!routeDraft && !editor && !selectedLocation && !loadError && (
          <div className="point-list">
            <label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => {
              setQuery(event.target.value)
              if (event.target.value.trim()) setExpandedLists({ building: true, chamber: true, route: true })
            }} placeholder="Hledat objekt nebo trasu" aria-label="Hledat objekt nebo trasu" /></label>
            {loading ? <p className="empty-selection">Načítání objektů…</p> : query && visiblePoints.length + filteredRoutes.length === 0
              ? <p className="empty-selection">Nic nenalezeno.</p> : <>
              {([{ key: 'building', title: 'Budovy', items: visibleBuildings },
                { key: 'chamber', title: 'Šachty', items: visibleChambers }] as const).map(group => {
                const expanded = expandedLists[group.key]
                return (!query || group.items.length > 0) && <section className="network-list-group" key={group.key}>
                  <button type="button" className="network-list-toggle" aria-expanded={expanded}
                    aria-controls={`network-list-${group.key}`} onClick={() => setExpandedLists(current => ({ ...current, [group.key]: !current[group.key] }))}>
                    <span>{group.title}</span><span className="network-list-count">{group.items.length}</span>
                    <ChevronDown size={16} className={expanded ? 'open' : ''} aria-hidden="true" />
                  </button>
                  <div id={`network-list-${group.key}`} className="network-list-content" hidden={!expanded}>
                    {group.items.length === 0 ? <p className="network-list-empty">Zatím žádné {group.key === 'building' ? 'budovy' : 'šachty'}.</p>
                      : <ul>{group.items.map(point => <li key={point.id}><button type="button" className={mapHoveredPointId === point.id ? 'map-linked-hover' : undefined}
                        onMouseEnter={() => setListHoveredPointId(point.id)} onMouseLeave={() => setListHoveredPointId(null)}
                        onFocus={() => setListHoveredPointId(point.id)} onBlur={() => setListHoveredPointId(null)}
                        onClick={() => { setListHoveredPointId(null); handlePointSelect(point.id) }}>{point.kind === 'building' && point.buildingType === 'apartment'
                          ? <Building2 className="point-list-building-icon" size={17} aria-hidden="true" /> : <span className={`kind-dot ${point.kind}`} />}
                          <span className="point-list-text"><strong>{point.name}</strong><small>{pointKindLabel(point)}{splices.some(splice => splice.pointId === point.id) ? ' · optická spojka' : ''}</small></span></button></li>)}</ul>}
                  </div>
                </section>
              })}
              {(!query || filteredRoutes.length > 0) && <section className="network-list-group route-list">
                <button type="button" className="network-list-toggle" aria-expanded={expandedLists.route}
                  aria-controls="network-list-route" onClick={() => setExpandedLists(current => ({ ...current, route: !current.route }))}>
                  <span>Podzemní trasy</span><span className="network-list-count">{filteredRoutes.length}</span>
                  <ChevronDown size={16} className={expandedLists.route ? 'open' : ''} aria-hidden="true" />
                </button>
                <div id="network-list-route" className="network-list-content" hidden={!expandedLists.route}>
                  {filteredRoutes.length === 0 ? <p className="network-list-empty">Zatím žádné trasy.</p>
                    : <ul>{filteredRoutes.map(item => {
              const summary = installationSummary(installationByRoute.get(item.id))
              const status = installations.loading || installations.loadFailed ? 'unknown' : summary.status
              return <li key={item.id}><button type="button" className={mapHoveredRouteId === item.id ? 'map-linked-hover' : undefined}
                onMouseEnter={() => setListHoveredRouteId(item.id)} onMouseLeave={() => setListHoveredRouteId(null)}
                onFocus={() => setListHoveredRouteId(item.id)} onBlur={() => setListHoveredRouteId(null)}
                onClick={() => {
                  setListHoveredRouteId(null)
                  selectSavedRoute(item.id)
                  setRouteFocusRequest(current => ({ id: item.id, sequence: (current?.sequence ?? 0) + 1 }))
                }}><RouteIcon className={`route-list-icon ${status}`} size={17} /><span className="route-list-text"><strong>{item.name}</strong><small>
                  {installations.loading ? 'Načítání osazení…' : installations.loadFailed ? 'Osazení se nenačetlo'
                    : summary.items ? `Chráničky, trubičky a sestavy ${summary.ducts} · kabely ${summary.cables}` : 'Bez osazení'}
                </small></span></button></li>
                    })}</ul>}
                </div>
              </section>}
            </>}
          </div>
        )}
        </div>
        <div hidden={sideTab !== 'customers'}><CustomerQuickPanel active={active && sideTab === 'customers'}
          buildingId={editor?.id && editor.kind === 'building' ? editor.id : null}
          buildingName={editor?.id && editor.kind === 'building' ? editor.name : null}
          buildings={points.filter(point => point.kind === 'building').map(point => ({ id: point.id, name: point.name }))}
          onOpenCustomers={onOpenCustomers} />
        </div>
      </aside>
      {spliceOpen && editor?.id && editor.kind === 'chamber' && <OpticalSpliceEditor key={editor.id}
        pointId={editor.id} pointName={editor.name}
        pointNames={Object.fromEntries(points.map(point => [point.id, point.name]))} routes={route.routes}
        tracedPath={tracedPath}
        installations={installations.documents} onInstallationsUpdated={installations.replaceDocuments}
        onClose={() => setSpliceOpen(false)}
        onOpenRoute={id => { setSpliceOpen(false); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onSaved={document => setSplices(current => [...current.filter(item => item.pointId !== document.pointId), document])}
        onDeleted={pointId => setSplices(current => current.filter(item => item.pointId !== pointId))} />}
      {equipmentOpen && editor?.id && editor.kind === 'building' && <BuildingEquipmentEditor key={editor.id}
        pointId={editor.id} pointName={editor.name}
        pointNames={Object.fromEntries(points.map(point => [point.id, point.name]))}
        routes={route.routes} installations={installations.documents}
        onClose={() => setEquipmentOpen(false)}
        onSaved={document => setEquipment(current => [...current.filter(item => item.pointId !== document.pointId),
          ...(document.racks.length ? [document] : [])])}
        onTrace={path => setTracedPath(path)}
        onOpenRoute={id => { setEquipmentOpen(false); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onViewMap={() => setEquipmentOpen(false)}
        onBudget={path => { onOpenBudget(scenarioFromOpticalPath(path, installations.documents)); setEquipmentOpen(false) }} />}
      {distributionOpen && editor?.id && editor.kind === 'building' && <BuildingDistributionEditor key={editor.id}
        pointId={editor.id} pointName={editor.name} routes={route.routes} installations={installations.documents}
        onClose={() => setDistributionOpen(false)}
        onSaved={document => setDistributions(current => [...current.filter(item => item.pointId !== document.pointId),
          ...(document.risers.length ? [document] : [])])}
        onTrace={path => setTracedPath(path)}
        onOpenRoute={id => { setDistributionOpen(false); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onViewMap={() => setDistributionOpen(false)}
        onBudget={path => { onOpenBudget(scenarioFromOpticalPath(path, installations.documents)); setDistributionOpen(false) }} />}
      {exportOpen && <NetworkExportDialog onClose={() => setExportOpen(false)}
        onRefreshMap={() => { setMapSnapshot(null); setSnapshotRequest(value => value + 1) }} snapshot={mapSnapshot}
        points={points} routes={route.routes} installations={installations.documents} splices={splices}
        tracedPath={tracedPath} initialRouteId={selectedSavedRoute?.id ?? null} initialPointId={editor?.id ?? null} />}
    </main>
  )
}
