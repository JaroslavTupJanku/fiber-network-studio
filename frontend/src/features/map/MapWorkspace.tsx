import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, ChevronRight, MoreHorizontal, Box, Building2, Cable, ChevronDown, CircleDot, UtilityPole, Copy, Crosshair, FileDown, House, MapPin, Network, PanelRightClose, PanelRightOpen, Calculator, RefreshCw, Route as RouteIcon, Save, Search, Trash2, Undo2, X } from 'lucide-react'
import { BuildingOverview } from './BuildingOverview'
import { MapCanvas, type MapSnapshot } from './MapCanvas'
import { NetworkSchematicDialog } from './NetworkSchematicDialog'
import { FiberTraceDialog } from './FiberTraceDialog'
import { InfrastructureSchematic } from './InfrastructureSchematic'
import { NetworkExportDialog } from './NetworkExportDialog'
import type { SchemeView } from './networkSchematic'
import { RouteInstallationPanel } from './RouteInstallationPanel'
import { OpticalSpliceEditor } from './OpticalSpliceEditor'
import { BuildingEquipmentEditor } from './BuildingEquipmentEditor'
import { BuildingDistributionEditor } from './BuildingDistributionEditor'
import { listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
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
import { aerialSplitPreview, type AerialSplitOptions, routeKind, routeKindLabel, acceptsRouteEndpoint, routeCoordinates, routeLengthMeters, splitUndergroundRoute, type RouteSplitPosition } from './undergroundRoutes'
import { acceptExampleOnArrowRight } from '../../shared/acceptExample'

const kindLabel = (kind: NetworkPointKind) => kind === 'cabinet' ? 'Optická skříň' : kind === 'building' ? 'Budova' : kind === 'pole' ? 'Sloup' : 'Šachta'
const pointKindLabel = (point: Pick<NetworkPoint, 'kind' | 'buildingType'>) =>
  point.kind === 'building' && point.buildingType === 'apartment' ? 'Bytový dům' : kindLabel(point.kind)
const countLabel = (count: number, one: string, few: string, many: string) =>
  `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`

export function MapWorkspace({ active, customerMapFocus, onOpenCustomers, onOpenBudget, onOpenCalculator, onInteractionChange }: {
  active: boolean
  onInteractionChange: (active: boolean) => void
  onOpenCalculator: () => void
  customerMapFocus: { id: string; sequence: number } | null
  onOpenCustomers: (buildingId: string | null, customerId?: string) => void
  onOpenBudget: (scenario: Scenario) => void
}) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [sideTab, setSideTab] = useState<'infrastructure' | 'objects' | 'routes' | 'outputs'>('objects')
  const [spliceOpen, setSpliceOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [overviewPremiseId, setOverviewPremiseId] = useState<string>()
  const [overviewShelfId, setOverviewShelfId] = useState<string>()
  const closeEquipmentOverview = () => { setEquipmentOpen(false); setOverviewShelfId(undefined) }
  const closeDistributionOverview = () => { setDistributionOpen(false); setOverviewPremiseId(undefined) }
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [fiberTrace, setFiberTrace] = useState<{ routeId?: string; pointId?: string } | null>(null)
  const [exportInitialOutput, setExportInitialOutput] = useState<'map' | 'scheme'>('map')
  const [exportInitialScheme, setExportInitialScheme] = useState<SchemeView | undefined>()
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
  const [expandedLists, setExpandedLists] = useState({ building: true, chamber: true, pole: true, cabinet: true, route: true })
  const [splitActive, setSplitActive] = useState(false)
  const [splitSelection, setSplitSelection] = useState<RouteSplitPosition | null>(null)
  const [splitName, setSplitName] = useState('')
  const [splitMode, setSplitMode] = useState<'map' | 'count' | 'distance'>('map')
  const [splitCount, setSplitCount] = useState(2)
  const [splitDistance, setSplitDistance] = useState(50)
  const [splitBusy, setSplitBusy] = useState(false)
  const [splitError, setSplitError] = useState('')
  const detailsPanelRef = useRef<HTMLElement>(null)
  const panelScroll = useRef<Record<string, number>>({})
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
    points, loading, loadError, actionError, moveNotice, saving, activeTool, moving, editor, route,
    selectedLocation, selectedParcel, parcelStatus, query, visiblePoints,
    buildings, chambers, poles, preview, setQuery, setEditor, setSelectedLocation,
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
  const interactionActive = route.drawing || !!activeTool || moving || !!editor && !editor.id || splitActive || splitBusy
  useEffect(() => { onInteractionChange(interactionActive) }, [interactionActive, onInteractionChange])
  useEffect(() => {
    if (editor?.kind) detailsPanelRef.current?.scrollTo({ top: 0 })
  }, [editor?.id, editor?.kind])
  useEffect(() => {
    const id = routeDraft?.id ?? null
    if (id && id !== lastRouteId.current) {
      setRouteTab(route.drawing ? 'route' : 'installations')
      detailsPanelRef.current?.scrollTo({ top: 0 })
    }
    if (id !== lastRouteId.current) {
      setSplitActive(false)
      setSplitSelection(null)
      setSplitError('')
    }
    lastRouteId.current = id
  }, [routeDraft?.id, route.drawing])
  const selectedSavedRoute = routeDraft?.id ? route.routes.find(item => item.id === routeDraft.id) : null
  const splitOptions = useMemo<AerialSplitOptions | undefined>(() => splitMode === 'count' ? { poleCount: splitCount }
    : splitMode === 'distance' ? { maxSpanMeters: splitDistance } : undefined, [splitMode, splitCount, splitDistance])
  const uniformPreview = useMemo(() => selectedSavedRoute && splitOptions
    ? aerialSplitPreview(selectedSavedRoute, points, splitOptions) : null,
    [selectedSavedRoute, points, splitOptions])
  const splitValid = splitMode === 'map' ? !!splitSelection : !!uniformPreview
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
    setSideTab('infrastructure')
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
    setSplitMode('map')
    setSplitSelection(null)
    setSplitName(routeKind(selectedSavedRoute) === 'aerial' ? 'Nový sloup' : 'Nová šachta')
    setSplitError('')
    selectRouteTab('route')
  }
  const cancelSplit = () => { setSplitActive(false); setSplitSelection(null); setSplitError('') }
  const finishSplit = async () => {
    if (!selectedSavedRoute || !splitValid || !splitName.trim() || splitBusy) return
    setSplitBusy(true)
    setSplitError('')
    try {
      const outcome = await splitUndergroundRoute(selectedSavedRoute, installations.document.version,
        splitSelection, splitName, splitOptions)
      route.setRoutes(current => [...current.filter(item => item.id !== selectedSavedRoute.id), ...outcome.routes])
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
    if (!route.drawing && !splitActive) { selectSideTab(routeDraft && !editor ? 'routes' : 'objects'); return }
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
    setSideTab(route.drawing ? 'infrastructure' : routeDraft ? 'routes' : 'objects')
  }
  const filteredRoutes = route.visibleRoutes.filter(item => item.name.toLocaleLowerCase('cs').includes(query.toLocaleLowerCase('cs')))
  const visibleBuildings = visiblePoints.filter(point => point.kind === 'building')
  const visibleChambers = visiblePoints.filter(point => point.kind === 'chamber')
  const visibleCabinets = visiblePoints.filter(point => point.kind === 'cabinet')
  const visiblePoles = visiblePoints.filter(point => point.kind === 'pole')
  const activeSideTab = sideTab === 'infrastructure' && !editor && !routeDraft && !selectedLocation && !activeTool ? 'objects' : sideTab
  const navigationSection = activeSideTab === 'infrastructure' ? routeDraft && !editor ? 'routes' : 'objects' : activeSideTab
  const selectSideTab = (next: typeof sideTab) => {
    panelScroll.current[activeSideTab] = detailsPanelRef.current?.scrollTop ?? 0
    setSideTab(next)
    requestAnimationFrame(() => detailsPanelRef.current?.scrollTo({ top: panelScroll.current[next] ?? 0 }))
    setListHoveredPointId(null)
    setListHoveredRouteId(null)
  }

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
          routeSplitSelection={splitMode === 'map' ? splitSelection : null}
          routeSplitPreview={splitActive ? uniformPreview?.positions ?? [] : []}
          onRouteSplitPick={position => { if (splitMode === 'map') setSplitSelection(position) }}
          onRouteSplitCancel={cancelSplit}
          routeBuildingCrossings={route.buildingCrossings}
          routeNearbyBuildings={route.nearbyBuildings}
          routeCheckingBuildings={route.checkingBuildings}
          pointMoveError={actionError}
          onRouteToolChange={kind => { setPanelOpen(true); setSideTab('infrastructure'); selectRouteTab('route'); handleRouteToolChange(kind) }}
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
          placementActive={activeTool !== null || moving || !!editor && !editor.id}
          toolsDisabled={loading || loadError || splitActive || splitBusy || Boolean(editor && !editor.id)}
          onToolChange={kind => { setPanelOpen(true); setSideTab('infrastructure'); handleToolChange(kind) }}
          onToolDrop={(kind, location) => { setPanelOpen(true); setSideTab('infrastructure'); handleToolDrop(kind, location) }}
          onLocationClick={(location, lookupParcel) => { setPanelOpen(true); setSideTab('infrastructure'); handleLocationClick(location, lookupParcel) }}
          onPointSelect={id => { setPanelOpen(true); setSideTab('infrastructure'); handlePointSelect(id) }}
          onPointMove={(id, location) => { setPanelOpen(true); return relocatePoint(id, location) }}
          onDraftMove={moveDraft}
          onCadastreDisable={clearParcel}
          snapshotRequest={snapshotRequest}
          onMapSnapshot={setMapSnapshot}
        />
      </section>

      <aside className={`details-panel${panelOpen ? '' : ' collapsed'}`} aria-label="Boční panel" ref={detailsPanelRef}>
        {!panelOpen && <div className="details-rail-tabs">
          <button className="details-rail-toggle" type="button" onClick={() => setPanelOpen(true)}
            aria-label="Rozbalit panel sítě" title="Rozbalit panel sítě">
            <PanelRightOpen size={19} aria-hidden="true" /><span>Panel sítě</span></button>
        </div>}
        {panelOpen && <div className="side-workspace-bar"><nav className="side-workspace-tabs" aria-label="Panel sítě">
          <button type="button" disabled={interactionActive} aria-pressed={navigationSection === 'objects'} onClick={() => selectSideTab('objects')}><Box size={15} />Objekty</button>
          <button type="button" disabled={interactionActive} aria-pressed={navigationSection === 'routes'} onClick={() => selectSideTab('routes')}><RouteIcon size={15} />Trasy</button>
          <button type="button" disabled={interactionActive} aria-pressed={navigationSection === 'outputs'} onClick={() => selectSideTab('outputs')}><FileDown size={15} />Výstupy</button>
        </nav><button type="button" className="side-workspace-collapse" title="Sbalit panel" aria-label="Sbalit panel" onClick={togglePanel}>
            <PanelRightClose size={17} /></button>
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

        <div hidden={activeSideTab !== 'infrastructure'}>
        {!editor && !routeDraft && !selectedLocation && <p className="empty-selection">Vyberte místo na mapě pro nový objekt.</p>}
        <div className="panel-heading">
          <div>
            {(editor?.id || selectedLocation || routeDraft) && <button className="panel-back-button" type="button" onClick={backFromDetail}>
              <ArrowLeft size={16} aria-hidden="true" /> {editor && route.drawing ? 'Zpět k trase' : route.drawing && routeDraft?.id ? 'Zpět k trase' : routeDraft && !editor ? 'Zpět na trasy' : 'Zpět na objekty'}
            </button>}
            <span className="section-label">{editor && route.drawing ? 'Přidat během kreslení' : routeDraft?.id && !editor ? routeKindLabel(routeDraft) : selectedLocation && selectedParcel ? 'Katastr' : editor?.id ? pointKindLabel(editor) : 'Infrastruktura'}</span>
            <h1>{editor ? editor.id ? editor.name || pointKindLabel(editor) : editor.kind === 'cabinet' ? 'Nová optická skříň' : editor.kind === 'pole' ? 'Nový sloup' : `Nová ${editor.kind === 'building' ? 'budova' : 'šachta'}` : routeDraft ? routeDraft.id ? routeDraft.name || routeKindLabel(routeDraft) : `Nová ${routeKind(routeDraft) === 'aerial' ? 'nadzemní' : 'podzemní'} trasa` : selectedLocation ? selectedParcel ? `Parcela ${selectedParcel.number}` : 'Detail místa' : 'Objekty sítě'}</h1>
          </div>
        </div>

        {!routeDraft && !editor && <div className="point-counts" aria-label="Počet objektů">
          <span><Box size={15} /> Skříně <strong>{points.filter(point => point.kind === 'cabinet').length}</strong></span>
          <span><House size={15} aria-hidden="true" /> Budovy <strong>{buildings}</strong></span>
          <span><UtilityPole size={15} aria-hidden="true" /> Sloupy <strong>{poles}</strong></span>
          <span><CircleDot size={15} aria-hidden="true" /> Šachty <strong>{chambers}</strong></span>
          <span><RouteIcon size={15} aria-hidden="true" /> Trasy <strong>{route.routes.length}</strong></span>
        </div>}

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
          <div className="route-detail-tabs" role="tablist" aria-label="Detail trasy sítě" onKeyDown={handleRouteTabKeyDown}>
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
              onTraceFiber={() => setFiberTrace({ routeId: selectedSavedRoute.id })}
              routes={route.routes} editable={!route.drawing && route.preview === null} installations={installations} />
          </div>
        </>}

        {routeDraft && !editor && (
          <div className="route-tab-panel" id={selectedSavedRoute ? 'route-panel-route' : undefined}
            role={selectedSavedRoute ? 'tabpanel' : undefined} aria-labelledby={selectedSavedRoute ? 'route-tab-route' : undefined}
            hidden={!!selectedSavedRoute && activeRouteTab !== 'route'}>
          <form className="point-form route-form" onSubmit={event => { if (splitActive || splitBusy) event.preventDefault(); else void route.save(event) }}>
            {routeDraft.id && <h2 className="route-detail-title">{routeKindLabel(routeDraft)}</h2>}
            <p className="route-help">{route.drawing
              ? routeDraft.endPointId
                ? 'Kliknutím na úsek přidáte lomový bod. Bod můžete přetáhnout nebo kliknutím vybrat k odebrání (funguje i Delete). Síťový objekt také přesunete tažením. Potom úpravu dokončete a uložte.'
                : routeDraft.startPointId
                ? `Trasa začíná v objektu ${pointName(routeDraft.startPointId)}. Klikněte na další vhodný objekt v mapě; kliknutím mimo objekty přidáte lomový bod.`
                : 'Klikněte na výchozí síťový objekt v mapě. Konec můžete vybrat i v polích níže.'
              : routeDraft.id
                ? routeKind(routeDraft) === 'aerial' ? 'Nadzemní vedení mezi budovami a sloupy. Kabel vložte přímo v záložce Osazení; spojku lze evidovat na sloupu.' : 'Trasa v mapě ukazuje průběh podzemního vedení mezi dvěma body. Chráničky a kabely najdete na záložce Osazení; svary patří do spojky v šachtě.'
                : 'Trasa spojuje dva body sítě. Nejdřív ji uložte, potom do ní můžete vložit chráničky a kabely.'}</p>
            {route.drawing ? <div className="route-endpoint-fields">
              <label htmlFor="route-start">Začátek trasy
                <select id="route-start" value={routeDraft.startPointId ?? ''}
                  onChange={event => route.setEndpoint('startPointId', event.target.value || null)}>
                  <option value="">Vyberte objekt</option>
                  {endpointPoints.filter(point => acceptsRouteEndpoint(routeDraft, point)).map(point => <option key={point.id} value={point.id} disabled={point.id === routeDraft.endPointId}>{point.name} · {kindLabel(point.kind)}</option>)}
                </select>
              </label>
              <label htmlFor="route-end">Konec trasy
                <select id="route-end" value={routeDraft.endPointId ?? ''}
                  onChange={event => route.setEndpoint('endPointId', event.target.value || null)}>
                  <option value="">Vyberte objekt</option>
                  {endpointPoints.filter(point => acceptsRouteEndpoint(routeDraft, point)).map(point => <option key={point.id} value={point.id} disabled={point.id === routeDraft.startPointId}>{point.name} · {kindLabel(point.kind)}</option>)}
                </select>
              </label>
            </div> : <div className="route-endpoints">
              <span><strong>Od</strong>{pointName(routeDraft.startPointId)}</span>
              <span><strong>Do</strong>{pointName(routeDraft.endPointId)}</span>
            </div>}
            {selectedSavedRoute && !route.drawing && <div className="route-continuation">
              <strong>Navázat další úsek</strong>
              <p>Každý úsek spojuje dva objekty. Chcete-li vést trasu přes další objekt, začněte nový úsek z jejího bodu. Osazení nového úseku pak navážete zvlášť.</p>
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
              <strong>{routeKind(routeDraft) === 'aerial' ? 'Vložit sloup do této trasy' : 'Vložit šachtu do této trasy'}</strong>
              <p>{routeKind(routeDraft) === 'aerial' ? 'Zvolte jedno místo nebo rovnoměrné rozmístění sloupů. Náhled ukáže nové pozice před potvrzením. Kabel zůstane průchozí.' : 'Vyberte místo přímo na trase. Vzniknou dva navazující úseky; průchozí chráničky a kabely zůstanou propojené.'}</p>
              {!splitActive ? <button type="button" className="move-button" disabled={route.saving || splitBusy}
                onClick={beginSplit}><MapPin size={16} /> {routeKind(routeDraft) === 'aerial' ? 'Vložit sloupy…' : 'Vybrat místo na mapě'}</button> : <>
                {routeKind(routeDraft) === 'aerial' && <>
                  <label htmlFor="split-mode">Jak rozmístit sloupy</label>
                  <select id="split-mode" value={splitMode} disabled={splitBusy}
                    onChange={event => { setSplitMode(event.target.value as typeof splitMode); setSplitError('') }}>
                    <option value="map">Jeden sloup kliknutím na mapu</option>
                    <option value="count">Rovnoměrně podle počtu sloupů</option>
                    <option value="distance">Rovnoměrně podle největší rozteče</option>
                  </select>
                  {splitMode === 'count' && <label>Počet nových sloupů
                    <input type="number" min={1} max={100} step={1} value={splitCount} disabled={splitBusy}
                      onChange={event => setSplitCount(Number(event.target.value))} /></label>}
                  {splitMode === 'distance' && <label>Největší rozteč v mapě (m)
                    <input type="number" min={2} step="any" value={splitDistance} disabled={splitBusy}
                      onChange={event => setSplitDistance(Number(event.target.value))} /></label>}
                  {splitMode !== 'map' && (uniformPreview
                    ? <p role="status">Náhled: {uniformPreview.positions.length} nových sloupů,
                      {' '}{uniformPreview.positions.length + 1} úseků, rozteč přibližně {uniformPreview.spanMeters.toFixed(1)} m.
                      Pozice jsou vyznačené v mapě. Potvrďte až po jejich kontrole.</p>
                    : <p className="form-error" role="alert">Zvolte 1–100 sloupů s roztečí alespoň 2 m;
                      rozteč musí být menší než délka trasy.</p>)}
                </>}
                <label htmlFor="split-chamber-name">{routeKind(routeDraft) === 'aerial' ? 'Název nového sloupu' : 'Název nové šachty'}</label>
                <input id="split-chamber-name" maxLength={80} disabled={splitBusy} value={splitName}
                  onChange={event => setSplitName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void finishSplit() } }} />
                {splitMode === 'map' && (splitSelection ? <p>Vybrané místo: {splitSelection.location.latitude.toFixed(6)}°,
                  {' '}{splitSelection.location.longitude.toFixed(6)}°. Kliknutím na trasu ho můžete změnit.</p>
                  : <p className="route-help">Klikněte na některý úsek vybrané trasy v mapě.</p>)}
                {installations.document.items.some(item => item.cable?.name && item.actualLengthMeters != null)
                  && <p className="route-help">Původní délka kabelu zůstane v evidenci jako údaj před rozdělením.
                    Délky nových úseků bude potřeba doplnit zvlášť.</p>}
                {splitError && <p className="form-error" role="alert">{splitError}</p>}
                <div className="route-continuation-actions">
                  <button type="button" className="primary-button" disabled={!splitValid || !splitName.trim() || splitBusy}
                    onClick={() => void finishSplit()}>{splitBusy ? 'Rozděluji…' : routeKind(routeDraft) === 'aerial' ? 'Potvrdit sloupy a rozdělit' : 'Vložit šachtu a rozdělit'}</button>
                  <button type="button" className="move-button" disabled={splitBusy} onClick={cancelSplit}>Zrušit</button>
                </div>
              </>}
              {!splitActive && splitError && <p className="form-error" role="alert">{splitError}</p>}
            </div>}
            {routeLength !== null && <p className="route-length">Přibližná délka z mapy: <strong>{Math.round(routeLength).toLocaleString('cs-CZ')} m</strong><small>{routeKind(routeDraft) === 'aerial' ? 'Skutečná délka kabelu zahrnuje průvěs a rezervy; doplňte ji u kabelu.' : 'Není to délka instalovaného kabelu.'}</small></p>}
            {route.drawing && <>
              <div className="route-drawing-actions">
                <button type="button" className="move-button" onClick={route.undo} disabled={!routeDraft.startPointId}><Undo2 size={16} /> Zpět</button>
                <button type="button" className="move-button" onClick={route.resetGeometry}>Začít znovu</button>
              </div>
              <p className="route-help">Klikněte nebo táhněte přímo za úsek trasy. Lomový bod můžete později znovu přetáhnout; mění jen průběh trasy, není samostatným objektem sítě. {routeKind(routeDraft) === 'aerial' ? 'Lom nenahrazuje sloup. Mapová čára neověřuje průvěs, výšku zavěšení ani únosnost.' : 'Dotčené budovy se při úpravě zvýrazní červeně. Při dokončení průchod znovu ověříme podle RÚIAN.'}</p>
              {routeDraft.waypoints.length > 0 && <div className="route-waypoints"><strong>Lomové body</strong>{routeDraft.waypoints.map((point, index) =>
                <div key={index}><span>{index + 1}. {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span>
                  <button type="button" className="icon-button" onClick={() => route.removeWaypoint(index)} aria-label={`Odebrat lomový bod ${index + 1}`}><X size={14} /></button></div>)}</div>}
              <button type="button" className="primary-button" onClick={route.finish} disabled={!routeDraft.endPointId}>Dokončit kreslení</button>
            </>}
            <label htmlFor="route-name">Název trasy</label>
            <input id="route-name" maxLength={80} required disabled={splitActive || splitBusy} value={routeDraft.name}
              onChange={event => route.setDraft(current => current ? { ...current, name: event.target.value } : current)}
              onKeyDown={event => acceptExampleOnArrowRight(event, name => route.setDraft(current => current ? { ...current, name } : current))}
              title="Šipka doprava převezme šedý příklad"
              placeholder={routeKind(routeDraft) === 'aerial' ? 'Např. Sloup S-01 – Dům 12' : 'Např. Šachta S-01 – Dům 12'} />
            {route.drawing && <p className="route-help">Před uložením zvolte Dokončit kreslení. Trasa se uloží až tlačítkem Uložit.</p>}
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
          <form className="point-form point-detail-form" onSubmit={savePoint}>
            <fieldset className="point-basics"><legend>Základní údaje</legend>
            <label htmlFor="point-name">Název</label>
            <input id="point-name" autoFocus={!editor.id} required maxLength={80} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              onKeyDown={event => acceptExampleOnArrowRight(event, name => setEditor(current => current ? { ...current, name } : current))}
              title="Šipka doprava převezme šedý příklad" placeholder={editor.kind === 'building' ? 'Např. Dům 12' : editor.kind === 'cabinet' ? 'Např. Skříň R-01' : editor.kind === 'pole' ? 'Např. Sloup P-01' : 'Např. Šachta S-01'} />
            <div className="point-kind">{editor.kind === 'building' && editor.buildingType === 'apartment'
              ? <Building2 size={16} aria-hidden="true" /> : <span className={`kind-dot ${editor.kind}`} />}{pointKindLabel(editor)}</div>
            {editor.kind === 'building' && <label className="building-type-field" htmlFor="building-type">Typ budovy
              <select id="building-type" value={editor.buildingType ?? 'standard'}
                onChange={event => setEditor({ ...editor, buildingType: event.target.value as 'standard' | 'apartment' })}>
                <option value="standard">Běžná budova</option><option value="apartment">Bytový dům</option>
              </select><small>Ikona bytového domu usnadní orientaci na mapě. Domovní rozvod lze evidovat u obou typů.</small></label>}
            </fieldset>
            <div className="form-actions">
              {!editor.id && <button type="button" className="move-button" onClick={() => handleToolChange(null)}>Zrušit přidání</button>}
              <button className="primary-button" type="submit" disabled={saving || !editor.name.trim()}><Save size={16} aria-hidden="true" /> {saving ? 'Ukládání…' : 'Uložit'}</button>

            {editor.id && <details className="point-extra-actions" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}><summary aria-label="Další akce" title="Další akce"><MoreHorizontal size={18} /></summary><div>
            {editor.id && <button type="button" className="move-button" disabled={saving || editor.name !== points.find(point => point.id === editor.id)?.name} title="Trasování používá uloženou síť. Nejprve uložte změny objektu." onClick={() => setFiberTrace({ pointId: editor.id! })}><Cable size={16} /> Sledovat vlákno</button>}
            {editor.id && <button className="danger-button" type="button" disabled={saving} onClick={removePoint} title="Smazat objekt"><Trash2 size={16} aria-hidden="true" /> Smazat</button>}
            {tracedPath && <button type="button" className="move-button" onClick={() => setTracedPath(null)}>Skrýt zvýraznění cesty</button>}
            </div></details>}
            </div>
            {editor.id && <button type="button" className={moving ? 'move-button active' : 'move-button'} disabled={saving || route.drawing} onClick={() => {
              setMoving((value) => !value)
              setActiveTool(null)
            }}><Crosshair size={16} aria-hidden="true" /> {moving ? 'Zrušit přesun' : 'Přesunout objekt na mapě'}</button>}
            {moveNotice && <p className="point-move-notice" role="status">{moveNotice}</p>}
            <details className="point-position" open={!editor.id || moving}><summary>Poloha na mapě</summary>
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
            </details>
            <div className="point-section-label">Zapojení a návaznosti</div>

            {editor.id && editor.kind === 'chamber' && <ChamberConduitPanel key={editor.id}
              pointId={editor.id} routes={route.routes} documents={installations.documents}
              onUpdated={installations.replaceDocuments} onOpenRoute={selectSavedRoute} />}
            {editor.id && ['cabinet', 'chamber'].includes(editor.kind) && <button type="button" className="point-related-link" onClick={() => setEquipmentOpen(true)}>
              <span className="point-related-icon"><Cable size={17} aria-hidden="true" /></span>
              <span><strong>Optické vybavení</strong><small>{selectedEquipment ? `${countLabel(selectedEquipment.racks.length, 'stojan', 'stojany', 'stojanů')} · ${countLabel(selectedEquipment.ports.length, 'port', 'porty', 'portů')}` : 'Přidat vybavení objektu'}</small></span><ChevronRight size={16} aria-hidden="true" />
            </button>}
            {editor.id && editor.kind === 'cabinet' && <section className="chamber-conduit-card">
              <p className="chamber-conduit-intro">Skříň ukončuje kabely v optickém rozvaděči ODF. Připojte trasu, osaďte kabel a přiřaďte jeho vlákno k portu ODF.</p>
              <div className="chamber-splice-actions">{(['underground', 'aerial'] as const).map(kind => <button type="button" className="move-button" key={kind} disabled={saving || editor.name !== points.find(point => point.id === editor.id)?.name}
                onClick={() => { const pointId = editor.id!; selectRouteTab('route'); handleRouteToolChange(kind); route.setDraft({ kind, name: '', startPointId: pointId, endPointId: null, waypoints: [] }) }}>
                {kind === 'aerial' ? 'Připojit nadzemní trasou' : 'Připojit podzemní trasou'}</button>)}</div>
              <InfrastructureSchematic pointId={editor.id} pointName={editor.name} pointNames={Object.fromEntries(points.map(point => [point.id, point.name]))}
                routes={route.routes} installations={installations.documents} tracedRouteIds={tracedPath?.routeIds ?? []} onOpenRoute={selectSavedRoute} />
            </section>}
            {editor.id && editor.kind === 'building' && <BuildingOverview key={editor.id} pointId={editor.id} pointName={editor.name} active={active}
              equipmentVersion={selectedEquipment?.version} distributionVersion={selectedDistribution?.version}
              onEquipment={id => { setOverviewShelfId(id); setEquipmentOpen(true) }} onDistribution={id => { setOverviewPremiseId(id); setDistributionOpen(true) }}
              onCustomers={customerId => onOpenCustomers(editor.id!, customerId)} />}
            {editor.id && (editor.kind === 'chamber' || editor.kind === 'pole') && <button type="button" className="point-related-link" onClick={() => setSpliceOpen(true)}>
              <span className="point-related-icon"><Cable size={17} aria-hidden="true" /></span>
              <span><strong>Optická spojka</strong><small>{selectedSplice ? `${selectedSplice.name} · ${spliceConnectionsLabel}` : splicesLoadError ? 'Zkusit načíst spojku' : 'Přidat spojku'}</small></span><ChevronRight size={16} aria-hidden="true" />
            </button>}
            {actionError && <p className="form-error" role="alert">{actionError}</p>}
            {attachedRoutes.length > 0 && <div className="point-dependencies"><strong>Navazující trasy ({attachedRoutes.length})</strong>
              <p>Před smazáním objektu odstraňte nebo přepojte tyto trasy a jejich osazení.</p>
              {attachedRoutes.map(item => <button type="button" key={item.id} onClick={() => selectSavedRoute(item.id)}>{item.name} →</button>)}
            </div>}

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
              <button type="button" onClick={() => startDraft('cabinet', selectedLocation)}><Box size={16} /> Optická skříň</button>
              <button type="button" onClick={() => startDraft('building', selectedLocation)}><House size={16} aria-hidden="true" /> Budova</button>
              <button type="button" onClick={() => startDraft('chamber', selectedLocation)}><CircleDot size={16} aria-hidden="true" /> Šachta</button>
            </div>
          </div>
        )}

        </div>
        {(activeSideTab === 'objects' || activeSideTab === 'routes') && <header className="network-panel-heading">
          <span className="section-label">Síť na mapě</span>
          <h1>{activeSideTab === 'objects' ? 'Objekty sítě' : 'Trasy sítě'}</h1>
          <p>{activeSideTab === 'objects' ? 'Vyberte objekt ze seznamu nebo přímo v mapě.' : 'Vyberte trasu a prohlédněte si její kabely a chráničky.'}</p>
        </header>}
        {(activeSideTab === 'objects' || activeSideTab === 'routes') && !loadError && (
          <div className="point-list">
            <label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => {
              setQuery(event.target.value)
              if (event.target.value.trim()) setExpandedLists({ building: true, chamber: true, pole: true, cabinet: true, route: true })
            }} placeholder="Hledat objekt nebo trasu" aria-label="Hledat objekt nebo trasu" /></label>
            {loading ? <p className="empty-selection">Načítání objektů…</p> : query && (activeSideTab === 'objects' ? visiblePoints.length : filteredRoutes.length) === 0
              ? <p className="empty-selection">Nic nenalezeno.</p> : <>
              {activeSideTab === 'objects' && ([{ key: 'building', title: 'Budovy', items: visibleBuildings },
                { key: 'chamber', title: 'Šachty', items: visibleChambers },
                { key: 'cabinet', title: 'Optické skříně', items: visibleCabinets },
                { key: 'pole', title: 'Sloupy', items: visiblePoles }] as const).map(group => {
                const expanded = expandedLists[group.key]
                return (!query || group.items.length > 0) && <section className="network-list-group" key={group.key}>
                  <button type="button" className="network-list-toggle" aria-expanded={expanded}
                    aria-controls={`network-list-${group.key}`} onClick={() => setExpandedLists(current => ({ ...current, [group.key]: !current[group.key] }))}>
                    <span>{group.title}</span><span className="network-list-count">{group.items.length}</span>
                    <ChevronDown size={16} className={expanded ? 'open' : ''} aria-hidden="true" />
                  </button>
                  <div id={`network-list-${group.key}`} className="network-list-content" hidden={!expanded}>
                    {group.items.length === 0 ? <p className="network-list-empty">Zatím žádné {group.key === 'cabinet' ? 'optické skříně' : group.key === 'building' ? 'budovy' : group.key === 'pole' ? 'sloupy' : 'šachty'}.</p>
                      : <ul>{group.items.map(point => <li key={point.id}><button type="button" className={mapHoveredPointId === point.id ? 'map-linked-hover' : undefined} aria-current={editor?.id === point.id ? 'true' : undefined}
                        onMouseEnter={() => setListHoveredPointId(point.id)} onMouseLeave={() => setListHoveredPointId(null)}
                        onFocus={() => setListHoveredPointId(point.id)} onBlur={() => setListHoveredPointId(null)}
                        onClick={() => { setListHoveredPointId(null); setSideTab('infrastructure'); if (editor?.id !== point.id) handlePointSelect(point.id) }}>{point.kind === 'building' && point.buildingType === 'apartment'
                          ? <Building2 className="point-list-building-icon" size={17} aria-hidden="true" /> : <span className={`kind-dot ${point.kind}`} />}
                          <span className="point-list-text"><strong>{point.name}</strong><small>{pointKindLabel(point)}{splices.some(splice => splice.pointId === point.id) ? ' · optická spojka' : ''}</small></span></button></li>)}</ul>}
                  </div>
                </section>
              })}
              {activeSideTab === 'routes' && (!query || filteredRoutes.length > 0) && <section className="network-list-group route-list">
                <button type="button" className="network-list-toggle" aria-expanded={expandedLists.route}
                  aria-controls="network-list-route" onClick={() => setExpandedLists(current => ({ ...current, route: !current.route }))}>
                  <span>Trasy sítě</span><span className="network-list-count">{filteredRoutes.length}</span>
                  <ChevronDown size={16} className={expandedLists.route ? 'open' : ''} aria-hidden="true" />
                </button>
                <div id="network-list-route" className="network-list-content" hidden={!expandedLists.route}>
                  {filteredRoutes.length === 0 ? <p className="network-list-empty">Zatím žádné trasy.</p>
                    : <ul>{filteredRoutes.map(item => {
              const summary = installationSummary(installationByRoute.get(item.id))
              const status = installations.loading || installations.loadFailed ? 'unknown' : summary.status
              return <li key={item.id}><button type="button" className={mapHoveredRouteId === item.id ? 'map-linked-hover' : undefined} aria-current={routeDraft?.id === item.id ? 'true' : undefined}
                onMouseEnter={() => setListHoveredRouteId(item.id)} onMouseLeave={() => setListHoveredRouteId(null)}
                onFocus={() => setListHoveredRouteId(item.id)} onBlur={() => setListHoveredRouteId(null)}
                onClick={() => {
                  setListHoveredRouteId(null)
                  if (routeDraft?.id === item.id && !editor) setSideTab('infrastructure')
                  else selectSavedRoute(item.id)
                  setRouteFocusRequest(current => ({ id: item.id, sequence: (current?.sequence ?? 0) + 1 }))
                }}><RouteIcon className={`route-list-icon ${status}`} size={17} /><span className="route-list-text"><strong>{item.name}</strong><small>{routeKindLabel(item)} ·
                  {installations.loading ? 'Načítání osazení…' : installations.loadFailed ? 'Osazení se nenačetlo'
                    : summary.items ? routeKind(item) === 'aerial' ? `Optické kabely ${summary.cables}` : `Chráničky, trubičky a sestavy ${summary.ducts} · kabely ${summary.cables}` : 'Bez osazení'}
                </small></span></button></li>
                    })}</ul>}
                </div>
              </section>}
            </>}
          </div>
        )}
        {activeSideTab === 'outputs' && <section className="network-panel-tools" aria-label="Výstupy a nástroje sítě">
          <header className="network-panel-heading"><span className="section-label">Přehledy a výpočty</span><h1>Výstupy sítě</h1><p>Prohlédněte si zapojení, připravte výstup nebo spočítejte optickou cestu.</p></header>
          <button type="button" disabled={interactionActive || saving || !!editor && (!editor.id || editor.name !== points.find(point => point.id === editor.id)?.name)} onClick={() => setSchemeOpen(true)}><Network size={20} /><span><strong>Schéma sítě</strong><small>Body, trasy a propojení jednotlivých vláken</small></span></button>
          <button type="button" disabled={interactionActive} onClick={() => { setExportInitialOutput('map'); setMapSnapshot(null); setSnapshotRequest(value => value + 1); setExportOpen(true) }}><FileDown size={20} /><span><strong>Tisk a export</strong><small>Mapa, schémata a tabulky celé sítě</small></span></button>
          <button type="button" disabled={interactionActive} onClick={onOpenCalculator}><Calculator size={20} /><span><strong>Výpočet optických ztrát</strong><small>Ověření útlumu a rezervy optické cesty</small></span></button>
        </section>}
      </aside>
      <NetworkSchematicDialog onPrint={view => { setSchemeOpen(false); setExportInitialScheme(view); setExportInitialOutput('scheme'); setExportOpen(true) }} open={schemeOpen} points={points} routes={route.routes} installations={installations.documents}
        equipment={equipment} splices={splices} distributions={distributions} onClose={() => setSchemeOpen(false)}
        onOpenPoint={id => { setSchemeOpen(false); setPanelOpen(true); setSideTab('infrastructure'); handlePointSelect(id); setPointFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onMovePoint={id => { setSchemeOpen(false); setPanelOpen(true); setSideTab('infrastructure'); handlePointSelect(id); setActiveTool(null); setMoving(true); setPointFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onEditRoute={id => { setSchemeOpen(false); editSavedRoute(id); setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onOpenRoute={id => { setSchemeOpen(false); selectSavedRoute(id); setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }} />
      {fiberTrace && <FiberTraceDialog points={points} routes={route.routes} installations={installations.documents}
        initialPointId={fiberTrace.pointId} initialRouteId={fiberTrace.routeId} onTrace={setTracedPath}
        onClose={() => { setFiberTrace(null); setTracedPath(null) }}
        onViewMap={() => { setFiberTrace(null); setSpliceOpen(false) }}
        onOpenRoute={id => { setFiberTrace(null); setSpliceOpen(false); selectSavedRoute(id); setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }} />}
      {spliceOpen && editor?.id && (editor.kind === 'chamber' || editor.kind === 'pole') && <OpticalSpliceEditor key={editor.id}
        pointId={editor.id} pointName={editor.name}
        pointNames={Object.fromEntries(points.map(point => [point.id, point.name]))} routes={route.routes}
        tracedPath={tracedPath}
        installations={installations.documents} onInstallationsUpdated={installations.replaceDocuments}
        onTraceFiber={() => setFiberTrace({ pointId: editor.id! })}
        onClose={() => setSpliceOpen(false)}
        onOpenRoute={id => { setSpliceOpen(false); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onSaved={document => setSplices(current => [...current.filter(item => item.pointId !== document.pointId), document])}
        onDeleted={pointId => setSplices(current => current.filter(item => item.pointId !== pointId))} />}
      {equipmentOpen && editor?.id && ['building', 'cabinet', 'chamber'].includes(editor.kind) && <BuildingEquipmentEditor key={editor.id} initialShelfId={overviewShelfId}
        pointKindLabel={kindLabel(editor.kind)} pointId={editor.id} pointName={editor.name}
        pointNames={Object.fromEntries(points.map(point => [point.id, point.name]))}
        routes={route.routes} installations={installations.documents}
        onClose={() => closeEquipmentOverview()}
        onSaved={document => setEquipment(current => [...current.filter(item => item.pointId !== document.pointId),
          ...(document.racks.length ? [document] : [])])}
        onTrace={path => setTracedPath(path)}
        onOpenRoute={id => { closeEquipmentOverview(); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onViewMap={() => closeEquipmentOverview()}
        onBudget={path => { onOpenBudget(scenarioFromOpticalPath(path, installations.documents)); closeEquipmentOverview() }} />}
      {distributionOpen && editor?.id && editor.kind === 'building' && <BuildingDistributionEditor key={editor.id} initialPremiseId={overviewPremiseId}
        pointId={editor.id} pointName={editor.name} routes={route.routes} installations={installations.documents}
        onClose={() => closeDistributionOverview()}
        onSaved={document => setDistributions(current => [...current.filter(item => item.pointId !== document.pointId),
          ...(document.risers.length || document.premises.length ? [document] : [])])}
        onTrace={path => setTracedPath(path)}
        onOpenRoute={id => { closeDistributionOverview(); selectSavedRoute(id)
          setRouteFocusRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })) }}
        onViewMap={() => closeDistributionOverview()}
        onBudget={path => { onOpenBudget(scenarioFromOpticalPath(path, installations.documents)); closeDistributionOverview() }} />}
      {exportOpen && <NetworkExportDialog initialScheme={exportInitialScheme} initialOutput={exportInitialOutput} onClose={() => setExportOpen(false)}
        onRefreshMap={() => { setMapSnapshot(null); setSnapshotRequest(value => value + 1) }} snapshot={mapSnapshot}
        points={points} routes={route.routes} installations={installations.documents} splices={splices}
        tracedPath={tracedPath} initialRouteId={selectedSavedRoute?.id ?? null} initialPointId={editor?.id ?? null} />}
    </main>
  )
}
