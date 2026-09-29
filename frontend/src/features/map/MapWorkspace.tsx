import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Cable, CircleDot, Copy, Crosshair, House, MapPin, PanelRightClose, PanelRightOpen, RefreshCw, Route as RouteIcon, Save, Search, Trash2, Undo2, X } from 'lucide-react'
import { MapCanvas } from './MapCanvas'
import { RouteInstallationPanel } from './RouteInstallationPanel'
import { OpticalSpliceEditor } from './OpticalSpliceEditor'
import { listOpticalSplices, type OpticalSpliceDocument } from './opticalSplices'
import { installationSummary } from './routeInstallations'
import { useRouteInstallations } from './useRouteInstallations'
import { useMapWorkspace } from './useMapWorkspace'
import type { NetworkPointKind } from './networkPoints'
import { routeCoordinates, routeLengthMeters } from './undergroundRoutes'
import { acceptExampleOnArrowRight } from '../../shared/acceptExample'

const kindLabel = (kind: NetworkPointKind) => kind === 'building' ? 'Budova' : 'Šachta'
const countLabel = (count: number, one: string, few: string, many: string) =>
  `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`

export function MapWorkspace({ active }: { active: boolean }) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [spliceOpen, setSpliceOpen] = useState(false)
  const [splices, setSplices] = useState<OpticalSpliceDocument[]>([])
  const [splicesLoadError, setSplicesLoadError] = useState(false)
  useEffect(() => {
    let live = true
    listOpticalSplices().then(documents => { if (live) { setSplices(documents); setSplicesLoadError(false) } })
      .catch(() => { if (live) setSplicesLoadError(true) })
    return () => { live = false }
  }, [])
  const [routeTab, setRouteTab] = useState<'installations' | 'route'>('installations')
  const detailsPanelRef = useRef<HTMLElement>(null)
  const lastRouteId = useRef<string | null>(null)
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
    clearParcel, handleToolChange, handleRouteToolChange, handleRouteSelect,
    handleLocationClick, handlePointSelect, relocatePoint,
    handleToolDrop, moveDraft, savePoint, removePoint, copyCoordinates, startDraft,
  } = useMapWorkspace()
  const routeDraft = route.draft
  useEffect(() => {
    const id = routeDraft?.id ?? null
    if (id && id !== lastRouteId.current) {
      setRouteTab('installations')
      detailsPanelRef.current?.scrollTo({ top: 0 })
    }
    lastRouteId.current = id
  }, [routeDraft?.id])
  const selectedSavedRoute = routeDraft?.id ? route.routes.find(item => item.id === routeDraft.id) : null
  const activeRouteTab = route.drawing ? 'route' : routeTab
  const installations = useRouteInstallations(routeDraft?.id ?? null)
  const installationByRoute = new Map(installations.documents.map(document => [document.routeId, document]))
  const routeLength = routeDraft?.endPointId
    ? routeLengthMeters(routeCoordinates(routeDraft, points)) : null
  const pointName = (id: string | null) => points.find(point => point.id === id)?.name ?? 'Vyberte na mapě'
  const endpointPoints = points.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  const attachedRoutes = editor?.id ? route.routes.filter(item => item.startPointId === editor.id || item.endPointId === editor.id) : []
  const selectedSplice = editor?.id ? splices.find(item => item.pointId === editor.id) : null
  const fusionCount = selectedSplice?.connections.filter(item => item.kind === 'fusion').length ?? 0
  const connectorCount = selectedSplice?.connections.filter(item => item.kind === 'connector').length ?? 0
  const spliceConnectionsLabel = [
    fusionCount ? countLabel(fusionCount, 'svar', 'svary', 'svarů') : null,
    connectorCount ? countLabel(connectorCount, 'konektorové spojení', 'konektorová spojení', 'konektorových spojení') : null,
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
    selectRouteTab('installations')
    setPanelOpen(true)
    handleRouteSelect(id)
  }
  const beginRouteContinuation = (pointId: string) => {
    const started = route.continueFrom(pointId)
    selectRouteTab('route')
    if (started) setPointFocusRequest(current => ({ id: pointId, sequence: (current?.sequence ?? 0) + 1 }))
  }
  const handleRouteTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (route.drawing || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 'installations' : event.key === 'End' ? 'route'
      : activeRouteTab === 'installations' ? 'route' : 'installations'
    selectRouteTab(next)
    document.getElementById(`route-tab-${next}`)?.focus()
  }

  return (
    <main className={`workspace${panelOpen ? '' : ' panel-collapsed'}`} hidden={!active}>
      <section className={`map-region${route.drawing ? ' route-drawing-mode' : activeTool || moving ? ' point-placement-mode' : ''}`} aria-label="Mapa sítě">
        <MapCanvas
          points={points}
          routes={route.routes}
          installations={installations.loading || installations.loadFailed ? null : installations.documents}
          splices={splices}
          installationLoading={installations.loading}
          selectedRouteId={routeDraft?.id ?? null}
          hoveredRouteId={mapHoveredRouteId ?? listHoveredRouteId}
          onMapRouteHoverChange={setMapHoveredRouteId}
          routeFocusRequest={routeFocusRequest}
          pointFocusRequest={pointFocusRequest}
          routeDraft={route.preview}
          drawingRoute={route.drawing}
          routeError={route.error}
          onRouteToolChange={() => { selectRouteTab('route'); handleRouteToolChange() }}
          onRouteSelect={selectSavedRoute}
          onRouteWaypointMove={route.moveWaypoint}
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
          toolsDisabled={loading || loadError}
          onToolChange={handleToolChange}
          onToolDrop={(kind, location) => { setPanelOpen(true); handleToolDrop(kind, location) }}
          onLocationClick={(location, lookupParcel) => { setPanelOpen(true); handleLocationClick(location, lookupParcel) }}
          onPointSelect={id => { setPanelOpen(true); handlePointSelect(id) }}
          onPointMove={(id, location) => { setPanelOpen(true); void relocatePoint(id, location) }}
          onDraftMove={moveDraft}
          onCadastreDisable={clearParcel}
        />
      </section>

      <aside className={`details-panel${panelOpen ? '' : ' collapsed'}`} aria-label="Objekty sítě" ref={detailsPanelRef}>
        {!panelOpen && <button className="details-rail-toggle" type="button" onClick={togglePanel}
          aria-label="Rozbalit panel Infrastruktura" title="Rozbalit panel Infrastruktura">
          <PanelRightOpen size={19} aria-hidden="true" /><span>Infrastruktura</span>
        </button>}
        <div className="panel-heading">
          <div>
            <span className="section-label">{routeDraft?.id ? 'Podzemní trasa' : selectedLocation && selectedParcel ? 'Katastr' : 'Infrastruktura'}</span>
            <h1>{routeDraft ? routeDraft.id ? routeDraft.name || 'Podzemní trasa' : 'Nová podzemní trasa' : editor ? editor.id ? kindLabel(editor.kind) : `Nová ${editor.kind === 'building' ? 'budova' : 'šachta'}` : selectedLocation ? selectedParcel ? `Parcela ${selectedParcel.number}` : 'Detail místa' : 'Objekty sítě'}</h1>
          </div>
          <div className="panel-heading-actions">
            {(editor || selectedLocation || routeDraft) && (
              <button className="icon-button" type="button" onClick={() => {
                route.cancel()
                setEditor(null)
                setSelectedLocation(null)
                clearParcel()
                setMoving(false)
                setActionError('')
              }} title="Zavřít detail" aria-label="Zavřít detail"><X size={18} /></button>
            )}
            <button className="icon-button" type="button" onClick={togglePanel}
              title="Sbalit panel Infrastruktura" aria-label="Sbalit panel Infrastruktura"><PanelRightClose size={18} /></button>
          </div>
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

        {selectedSavedRoute && <>
          <div className="route-tab-context">
            <span>{pointName(selectedSavedRoute.startPointId)} → {pointName(selectedSavedRoute.endPointId)}</span>
            {!route.drawing && <button type="button" className="route-continue-quick" disabled={route.saving}
              onClick={() => beginRouteContinuation(selectedSavedRoute.endPointId)}>
              <RouteIcon size={14} /> Navázat od konce
            </button>}
          </div>
          <div className="route-detail-tabs" role="tablist" aria-label="Detail podzemní trasy" onKeyDown={handleRouteTabKeyDown}>
            <button type="button" id="route-tab-installations" role="tab" aria-controls="route-panel-installations"
              aria-selected={activeRouteTab === 'installations'} tabIndex={activeRouteTab === 'installations' ? 0 : -1}
              disabled={route.drawing} onClick={() => selectRouteTab('installations')}>Osazení</button>
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

        {routeDraft && (
          <div className="route-tab-panel" id={selectedSavedRoute ? 'route-panel-route' : undefined}
            role={selectedSavedRoute ? 'tabpanel' : undefined} aria-labelledby={selectedSavedRoute ? 'route-tab-route' : undefined}
            hidden={!!selectedSavedRoute && activeRouteTab !== 'route'}>
          <form className="point-form route-form" onSubmit={route.save}>
            {routeDraft.id && <h2 className="route-detail-title">Údaje trasy</h2>}
            <p className="route-help">{route.drawing
              ? routeDraft.endPointId
                ? 'Konec úseku je vybraný. Dokončete kreslení, pojmenujte a uložte úsek. Konec případně změníte v poli níže. Po uložení můžete na záložce Osazení navázat chráničky, mikrotrubičky a kabely ze sousedního úseku.'
                : routeDraft.startPointId
                ? `Trasa začíná v objektu ${pointName(routeDraft.startPointId)}. Klikněte na další budovu nebo šachtu v mapě; kliknutím mimo objekty přidáte jen ohyb čáry.`
                : 'Klikněte na výchozí budovu nebo šachtu v mapě. Konec můžete vybrat i v polích níže.'
              : routeDraft.id
                ? 'Čára v mapě ukazuje průběh podzemního vedení mezi dvěma body. Chráničky a kabely najdete na záložce Osazení; svary patří do spojky v šachtě.'
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
            {routeLength !== null && <p className="route-length">Přibližná délka z mapy: <strong>{Math.round(routeLength).toLocaleString('cs-CZ')} m</strong><small>Není to délka instalovaného kabelu.</small></p>}
            {route.drawing && <>
              <div className="route-drawing-actions">
                <button type="button" className="move-button" onClick={route.undo} disabled={!routeDraft.startPointId}><Undo2 size={16} /> Zpět</button>
                <button type="button" className="move-button" onClick={route.resetGeometry}>Začít znovu</button>
              </div>
              <p className="route-help">Lomový bod je ohyb čáry, nikoli samostatný objekt sítě. Přetáhněte jej v mapě, pokud chcete změnit průběh trasy.</p>
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
            {!route.drawing && routeDraft.id && <button type="button" className="move-button" onClick={route.startEditing}><RouteIcon size={16} /> Upravit průběh</button>}
            {route.error && <p className="form-error" role="alert">{route.error}</p>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={route.drawing || route.saving || !routeDraft.name.trim() || !routeDraft.endPointId}><Save size={16} /> {route.saving ? 'Ukládání…' : 'Uložit'}</button>
              {routeDraft.id && <button className="danger-button" type="button" disabled={route.saving} onClick={route.remove}><Trash2 size={16} /> Smazat</button>}
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
            <div className="point-kind"><span className={`kind-dot ${editor.kind}`} />{kindLabel(editor.kind)}</div>
            <div className="coordinates-row">
              <span>{editor.latitude.toFixed(6)}°, {editor.longitude.toFixed(6)}°</span>
              <button type="button" className="icon-button" onClick={() => copyCoordinates(editor)} title="Kopírovat souřadnice" aria-label="Kopírovat souřadnice"><Copy size={16} /></button>
            </div>
            <p className="point-placement-hint">{editor.id ? 'Přetažením nebo kliknutím na nové místo se poloha uloží hned. Přilehlý průběh trasy se plynule přizpůsobí. Tlačítko Uložit slouží ke změně názvu.' : 'Polohu doladíte přetažením značky na mapě.'}</p>
            <button type="button" className={moving ? 'move-button active' : 'move-button'} onClick={() => {
              setMoving((value) => !value)
              setActiveTool(null)
            }}><Crosshair size={16} aria-hidden="true" /> {moving ? 'Klikněte na nové místo' : 'Změnit polohu kliknutím'}</button>
            {editor.id && editor.kind === 'chamber' && <section className="chamber-splice-card" aria-labelledby="chamber-splice-heading">
              <div className="chamber-splice-heading">
                <span className="chamber-splice-icon"><Cable size={17} aria-hidden="true" /></span>
                <div><h2 id="chamber-splice-heading">Optická spojka</h2>
                  <p>{selectedSplice?.name ?? (splicesLoadError ? 'Údaje se nenačetly' : 'V šachtě zatím není evidována')}</p></div>
                {selectedSplice && <p className="chamber-splice-count">{spliceConnectionsLabel}</p>}
              </div>
              <div className="chamber-splice-actions">
                <button type="button" className="move-button" onClick={() => setSpliceOpen(true)}>
                  {selectedSplice ? 'Otevřít spojku a svary' : splicesLoadError ? 'Zkusit otevřít spojku' : 'Přidat spojku'}
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
            <label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat objekt" aria-label="Hledat objekt" /></label>
            {loading ? <p className="empty-selection">Načítání objektů…</p> : visiblePoints.length === 0 ? <p className="empty-selection">{query ? 'Nic nenalezeno.' : 'Zatím žádné objekty.'}</p> : (
              <ul>{visiblePoints.map((point) => <li key={point.id}><button type="button" className={mapHoveredPointId === point.id ? 'map-linked-hover' : undefined}
                onMouseEnter={() => setListHoveredPointId(point.id)} onMouseLeave={() => setListHoveredPointId(null)}
                onFocus={() => setListHoveredPointId(point.id)} onBlur={() => setListHoveredPointId(null)}
                onClick={() => { setListHoveredPointId(null); handlePointSelect(point.id) }}><span className={`kind-dot ${point.kind}`} /><span className="point-list-text"><strong>{point.name}</strong><small>{kindLabel(point.kind)}{splices.some(splice => splice.pointId === point.id) ? ' · optická spojka' : ''}</small></span></button></li>)}</ul>
            )}
            {route.visibleRoutes.length > 0 && <div className="route-list"><h2>Podzemní trasy</h2><ul>{route.visibleRoutes.map(item => {
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
            })}</ul></div>}
          </div>
        )}
      </aside>
      {spliceOpen && editor?.id && editor.kind === 'chamber' && <OpticalSpliceEditor key={editor.id}
        pointId={editor.id} pointName={editor.name} routes={route.routes}
        installations={installations.documents} onClose={() => setSpliceOpen(false)}
        onSaved={document => setSplices(current => [...current.filter(item => item.pointId !== document.pointId), document])}
        onDeleted={pointId => setSplices(current => current.filter(item => item.pointId !== pointId))} />}
    </main>
  )
}
