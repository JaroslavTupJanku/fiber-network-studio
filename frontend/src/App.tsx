import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CircleDot, Copy, Crosshair, House, MapPin, Network, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { MapCanvas } from './MapCanvas'
import { findParcelAt, type Parcel } from './parcels'
import {
  createNetworkPoint,
  deleteNetworkPoint,
  listNetworkPoints,
  updateNetworkPoint,
  type Coordinates,
  type NetworkPoint,
  type NetworkPointInput,
  type NetworkPointKind,
} from './networkPoints'
import './App.css'

type PointEditor = NetworkPointInput & { id?: string }
type ParcelStatus = 'idle' | 'loading' | 'not-found' | 'error'

const kindLabel = (kind: NetworkPointKind) => kind === 'building' ? 'Budova' : 'Šachta'

function App() {
  const [points, setPoints] = useState<NetworkPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [activeTool, setActiveTool] = useState<NetworkPointKind | null>(null)
  const [moving, setMoving] = useState(false)
  const [editor, setEditor] = useState<PointEditor | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null)
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null)
  const [parcelStatus, setParcelStatus] = useState<ParcelStatus>('idle')
  const parcelRequest = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => () => parcelRequest.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    listNetworkPoints(controller.signal)
      .then((data) => {
        setPoints(data)
        setLoadError(false)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadVersion])

  const clearParcel = useCallback(() => {
    parcelRequest.current?.abort()
    parcelRequest.current = null
    setSelectedParcel(null)
    setParcelStatus('idle')
  }, [])

  const handleToolChange = useCallback((kind: NetworkPointKind | null) => {
    setActiveTool(kind)
    setMoving(false)
    setActionError('')
    if (kind) {
      clearParcel()
      setEditor(null)
      setSelectedLocation(null)
    }
  }, [clearParcel])

  const handleLocationClick = useCallback((location: Coordinates, lookupParcel: boolean) => {
    clearParcel()
    setActionError('')
    if (activeTool) {
      setEditor({ kind: activeTool, name: '', ...location })
      setActiveTool(null)
    } else if (moving && editor) {
      setEditor({ ...editor, ...location })
      setMoving(false)
    } else {
      setEditor(null)
      setSelectedLocation(location)
      if (lookupParcel) {
        const controller = new AbortController()
        parcelRequest.current = controller
        setParcelStatus('loading')
        findParcelAt(location, controller.signal)
          .then((parcel) => {
            if (controller.signal.aborted) return
            setSelectedParcel(parcel)
            setParcelStatus(parcel ? 'idle' : 'not-found')
          })
          .catch((error: unknown) => {
            if (!(error instanceof Error && error.name === 'AbortError')) setParcelStatus('error')
          })
      }
    }
  }, [activeTool, moving, editor, clearParcel])

  const handlePointSelect = useCallback((id: string, location?: Coordinates) => {
    const point = points.find((item) => item.id === id)
    if (!point) return
    clearParcel()
    setEditor({ ...point, ...location })
    setSelectedLocation(null)
    setActiveTool(null)
    setMoving(false)
    setActionError('')
  }, [points, clearParcel])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (activeTool || moving)) handleToolChange(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, moving, handleToolChange])

  const startDraft = (kind: NetworkPointKind, location: Coordinates) => {
    setEditor({ kind, name: '', ...location })
    setSelectedLocation(null)
    setActionError('')
  }

  const handleToolDrop = (kind: NetworkPointKind, location: Coordinates) => {
    clearParcel()
    setEditor({ kind, name: '', ...location })
    setSelectedLocation(null)
    setActiveTool(null)
    setMoving(false)
    setActionError('')
  }

  const savePoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor || !editor.name.trim() || saving) return
    setSaving(true)
    setActionError('')
    try {
      const saved = editor.id
        ? await updateNetworkPoint({ ...editor, id: editor.id, name: editor.name.trim() })
        : await createNetworkPoint({ ...editor, name: editor.name.trim() })
      setPoints((current) => editor.id
        ? current.map((point) => point.id === saved.id ? saved : point)
        : [...current, saved])
      setEditor(saved)
      clearParcel()
      setMoving(false)
    } catch {
      setActionError('Uložení se nezdařilo. Zkontrolujte, zda běží API.')
    } finally {
      setSaving(false)
    }
  }

  const removePoint = async () => {
    if (!editor?.id || saving || !window.confirm(`Smazat objekt „${editor.name}“?`)) return
    setSaving(true)
    setActionError('')
    try {
      await deleteNetworkPoint(editor.id)
      setPoints((current) => current.filter((point) => point.id !== editor.id))
      setEditor(null)
      setMoving(false)
    } catch {
      setActionError('Objekt se nepodařilo smazat. Zkontrolujte API.')
    } finally {
      setSaving(false)
    }
  }

  const copyCoordinates = async (location: Coordinates) => {
    await navigator.clipboard.writeText(
      `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
    )
  }

  const visiblePoints = useMemo(() => points
    .filter((point) => point.name.toLocaleLowerCase('cs').includes(query.toLocaleLowerCase('cs')))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs')), [points, query])
  const buildings = points.filter((point) => point.kind === 'building').length
  const chambers = points.length - buildings
  const originalPoint = points.find((point) => point.id === editor?.id)
  const preview = editor && (!editor.id || (originalPoint && (editor.latitude !== originalPoint.latitude || editor.longitude !== originalPoint.longitude)))
    ? editor : selectedLocation

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand"><Network size={21} strokeWidth={2} aria-hidden="true" /><span>Fiber Network Studio</span></div>
        <span className="header-section">Mapa</span>
      </header>

      <main className="workspace">
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
    </div>
  )
}

export default App
