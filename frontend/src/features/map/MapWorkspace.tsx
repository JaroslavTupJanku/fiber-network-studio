import { useEffect } from 'react'
import { CircleDot, Copy, Crosshair, House, MapPin, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { MapCanvas } from './MapCanvas'
import { useMapWorkspace } from './useMapWorkspace'
import type { NetworkPointKind } from './networkPoints'

const kindLabel = (kind: NetworkPointKind) => kind === 'building' ? 'Budova' : 'Šachta'

export function MapWorkspace({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) window.dispatchEvent(new Event('resize'))
  }, [active])
  const {
    points, loading, loadError, actionError, saving, activeTool, moving, editor,
    selectedLocation, selectedParcel, parcelStatus, query, visiblePoints,
    buildings, chambers, preview, setQuery, setEditor, setSelectedLocation,
    setMoving, setActiveTool, setLoading, setReloadVersion, setActionError,
    clearParcel, handleToolChange, handleLocationClick, handlePointSelect,
    handleToolDrop, savePoint, removePoint, copyCoordinates, startDraft,
  } = useMapWorkspace()

  return (
  <main className="workspace" hidden={!active}>
    <section className="map-region" aria-label="Mapa sítě">
      <MapCanvas
        points={points}
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
        onCadastreDisable={clearParcel}
      />
    </section>

    <aside className="details-panel" aria-label="Objekty sítě">
      <div className="panel-heading">
        <div>
          <span className="section-label">{selectedLocation && selectedParcel ? 'Katastr' : 'Infrastruktura'}</span>
          <h1>{editor ? editor.id ? kindLabel(editor.kind) : `Nová ${editor.kind === 'building' ? 'budova' : 'šachta'}` : selectedLocation ? selectedParcel ? `Parcela ${selectedParcel.number}` : 'Detail místa' : 'Objekty sítě'}</h1>
        </div>
        {(editor || selectedLocation) && (
          <button className="icon-button" type="button" onClick={() => {
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
      </div>

      {loadError && (
        <div className="panel-error" role="alert">
          <span>API není dostupné. Objekty se nenačetly.</span>
          <button type="button" className="icon-button" title="Načíst znovu" aria-label="Načíst objekty znovu" onClick={() => {
            setLoading(true)
            setReloadVersion((value) => value + 1)
          }}><RefreshCw size={16} /></button>
        </div>
      )}

      {editor && (
        <form className="point-form" onSubmit={savePoint}>
          <label htmlFor="point-name">Název</label>
          <input id="point-name" autoFocus required maxLength={80} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder={editor.kind === 'building' ? 'Např. Dům 12' : 'Např. Šachta S-01'} />
          <div className="point-kind"><span className={`kind-dot ${editor.kind}`} />{kindLabel(editor.kind)}</div>
          <div className="coordinates-row">
            <span>{editor.latitude.toFixed(6)}°, {editor.longitude.toFixed(6)}°</span>
            <button type="button" className="icon-button" onClick={() => copyCoordinates(editor)} title="Kopírovat souřadnice" aria-label="Kopírovat souřadnice"><Copy size={16} /></button>
          </div>
          <button type="button" className={moving ? 'move-button active' : 'move-button'} onClick={() => {
            setMoving((value) => !value)
            setActiveTool(null)
          }}><Crosshair size={16} aria-hidden="true" /> {moving ? 'Přesouvání' : 'Přesunout na mapě'}</button>
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving || !editor.name.trim()}><Save size={16} aria-hidden="true" /> {saving ? 'Ukládání…' : 'Uložit'}</button>
            {editor.id && <button className="danger-button" type="button" disabled={saving} onClick={removePoint} title="Smazat objekt"><Trash2 size={16} aria-hidden="true" /> Smazat</button>}
          </div>
        </form>
      )}

      {!editor && selectedLocation && (
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

      {!editor && !selectedLocation && !loadError && (
        <div className="point-list">
          <label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat objekt" aria-label="Hledat objekt" /></label>
          {loading ? <p className="empty-selection">Načítání objektů…</p> : visiblePoints.length === 0 ? <p className="empty-selection">{query ? 'Nic nenalezeno.' : 'Zatím žádné objekty.'}</p> : (
            <ul>{visiblePoints.map((point) => <li key={point.id}><button type="button" onClick={() => handlePointSelect(point.id)}><span className={`kind-dot ${point.kind}`} /><span className="point-list-text"><strong>{point.name}</strong><small>{kindLabel(point.kind)}</small></span></button></li>)}</ul>
          )}
        </div>
      )}
    </aside>
  </main>
  )
}
