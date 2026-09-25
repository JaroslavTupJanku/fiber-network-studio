import { useEffect } from 'react'
import { CircleDot, Copy, Crosshair, House, MapPin, RefreshCw, Route as RouteIcon, Save, Search, Trash2, Undo2, X } from 'lucide-react'
import { MapCanvas } from './MapCanvas'
import { RouteInstallationPanel } from './RouteInstallationPanel'
import { useMapWorkspace } from './useMapWorkspace'
import type { NetworkPointKind } from './networkPoints'
import { routeCoordinates, routeLengthMeters } from './undergroundRoutes'

const kindLabel = (kind: NetworkPointKind) => kind === 'building' ? 'Budova' : 'Šachta'

export function MapWorkspace({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) window.dispatchEvent(new Event('resize'))
  }, [active])
  const {
    points, loading, loadError, actionError, saving, activeTool, moving, editor, route,
    selectedLocation, selectedParcel, parcelStatus, query, visiblePoints,
    buildings, chambers, preview, setQuery, setEditor, setSelectedLocation,
    setMoving, setActiveTool, setLoading, setReloadVersion, setActionError,
    clearParcel, handleToolChange, handleRouteToolChange, handleRouteSelect,
    handleLocationClick, handlePointSelect,
    handleToolDrop, moveDraft, savePoint, removePoint, copyCoordinates, startDraft,
  } = useMapWorkspace()
  const routeDraft = route.draft
  const routeLength = routeDraft?.endPointId
    ? routeLengthMeters(routeCoordinates(routeDraft, points)) : null
  const pointName = (id: string | null) => points.find(point => point.id === id)?.name ?? 'Vyberte na mapě'
  const endpointPoints = points.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))

  return (
    <main className="workspace" hidden={!active}>
      <section className="map-region" aria-label="Mapa sítě">
        <MapCanvas
          points={points}
          routes={route.routes}
          selectedRouteId={routeDraft?.id ?? null}
          routeDraft={route.preview}
          drawingRoute={route.drawing}
          onRouteToolChange={handleRouteToolChange}
          onRouteSelect={handleRouteSelect}
          onRouteWaypointMove={route.moveWaypoint}
          onRouteUndo={route.undo}
          onRouteFinish={route.finish}
          onRouteCancel={route.cancelDrawing}
          selectedPointId={editor?.id ?? null}
          selectedParcel={selectedParcel}
          preview={preview}
          activeTool={activeTool}
          placementActive={activeTool !== null || moving}
          toolsDisabled={loading || loadError}
          onToolChange={handleToolChange}
          onToolDrop={handleToolDrop}
          onLocationClick={handleLocationClick}
          onPointSelect={handlePointSelect}
          onPointMove={handlePointSelect}
          onDraftMove={moveDraft}
          onCadastreDisable={clearParcel}
        />
      </section>

      <aside className="details-panel" aria-label="Objekty sítě">
        <div className="panel-heading">
          <div>
            <span className="section-label">{selectedLocation && selectedParcel ? 'Katastr' : 'Infrastruktura'}</span>
            <h1>{routeDraft ? routeDraft.id ? 'Podzemní trasa' : 'Nová podzemní trasa' : editor ? editor.id ? kindLabel(editor.kind) : `Nová ${editor.kind === 'building' ? 'budova' : 'šachta'}` : selectedLocation ? selectedParcel ? `Parcela ${selectedParcel.number}` : 'Detail místa' : 'Objekty sítě'}</h1>
          </div>
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
        </div>

        <div className="point-counts" aria-label="Počet objektů">
          <span><House size={15} aria-hidden="true" /> Budovy <strong>{buildings}</strong></span>
          <span><CircleDot size={15} aria-hidden="true" /> Šachty <strong>{chambers}</strong></span>
          <span><RouteIcon size={15} aria-hidden="true" /> Trasy <strong>{route.routes.length}</strong></span>
        </div>

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

        {routeDraft && (
          <form className="point-form route-form" onSubmit={route.save}>
            <p className="route-help">{route.drawing
              ? 'Začátek a konec vyberte níže nebo kliknutím na objekty v mapě. Tvar trasy upravte klikáním do mapy. Pak stiskněte Dokončit.'
              : 'Trasa spojuje dva body sítě. Konkrétní chráničky a kabely vložíte níže do jejího úseku.'}</p>
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
              placeholder="Např. Šachta S-01 – Dům 12" />
            {!route.drawing && routeDraft.id && <button type="button" className="move-button" onClick={route.startEditing}><RouteIcon size={16} /> Upravit průběh</button>}
            {route.error && <p className="form-error" role="alert">{route.error}</p>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={route.drawing || route.saving || !routeDraft.name.trim() || !routeDraft.endPointId}><Save size={16} /> {route.saving ? 'Ukládání…' : 'Uložit'}</button>
              {routeDraft.id && <button className="danger-button" type="button" disabled={route.saving} onClick={route.remove}><Trash2 size={16} /> Smazat</button>}
            </div>
          </form>
        )}

        {routeDraft?.id && route.routes.find(item => item.id === routeDraft.id) &&
          <RouteInstallationPanel key={routeDraft.id} route={route.routes.find(item => item.id === routeDraft.id)!}
            routes={route.routes} editable={!route.drawing && route.preview === null} />}

        {editor && (
          <form className="point-form" onSubmit={savePoint}>
            <label htmlFor="point-name">Název</label>
            <input id="point-name" autoFocus required maxLength={80} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder={editor.kind === 'building' ? 'Např. Dům 12' : 'Např. Šachta S-01'} />
            <div className="point-kind"><span className={`kind-dot ${editor.kind}`} />{kindLabel(editor.kind)}</div>
            <div className="coordinates-row">
              <span>{editor.latitude.toFixed(6)}°, {editor.longitude.toFixed(6)}°</span>
              <button type="button" className="icon-button" onClick={() => copyCoordinates(editor)} title="Kopírovat souřadnice" aria-label="Kopírovat souřadnice"><Copy size={16} /></button>
            </div>
            <p className="point-placement-hint">{editor.id ? 'Objekt můžete uchopit a přetáhnout přímo v mapě. Novou polohu pak uložte.' : 'Polohu doladíte přetažením značky na mapě.'}</p>
            <button type="button" className={moving ? 'move-button active' : 'move-button'} onClick={() => {
              setMoving((value) => !value)
              setActiveTool(null)
            }}><Crosshair size={16} aria-hidden="true" /> {moving ? 'Klikněte na nové místo' : 'Změnit polohu kliknutím'}</button>
            {actionError && <p className="form-error" role="alert">{actionError}</p>}
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
              <ul>{visiblePoints.map((point) => <li key={point.id}><button type="button" onClick={() => handlePointSelect(point.id)}><span className={`kind-dot ${point.kind}`} /><span className="point-list-text"><strong>{point.name}</strong><small>{kindLabel(point.kind)}</small></span></button></li>)}</ul>
            )}
            {route.visibleRoutes.length > 0 && <div className="route-list"><h2>Podzemní trasy</h2><ul>{route.visibleRoutes.map(item =>
              <li key={item.id}><button type="button" onClick={() => handleRouteSelect(item.id)}><RouteIcon size={17} /><span>{item.name}</span></button></li>)}</ul></div>}
          </div>
        )}
      </aside>
    </main>
  )
}
