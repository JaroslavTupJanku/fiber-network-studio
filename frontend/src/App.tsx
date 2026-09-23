import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Copy, Layers3, LoaderCircle, MapPin, Network, RefreshCw, X, ZoomIn } from 'lucide-react'
import { Map, Marker, NavigationControl, setWorkerUrl, type ErrorEvent, type MapMouseEvent, type MapSourceDataEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addCadastreLayer, CADASTRE_MIN_ZOOM, CADASTRE_SOURCE_ID, removeCadastreLayer } from './cadastre'
import './App.css'

type Coordinates = { latitude: number; longitude: number }
type CadastreStatus = 'loading' | 'ready' | 'error'

setWorkerUrl(workerUrl)

function MapCanvas({ selected, onSelect }: {
  selected: Coordinates | null
  onSelect: (location: Coordinates) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const readyMapRef = useRef<Map | null>(null)
  const cadastreActive = useRef(false)
  const cadastreFailed = useRef(false)
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapGeneration, setMapGeneration] = useState(0)
  const [zoom, setZoom] = useState(12)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreStatus, setCadastreStatus] = useState<CadastreStatus>('loading')
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    if (!container.current) return

    const map = new Map({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [14.421, 50.088],
      zoom: 12,
    })
    mapRef.current = map
    readyMapRef.current = null

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const clearLoadTimeout = () => {
      if (loadTimeout.current) clearTimeout(loadTimeout.current)
      loadTimeout.current = null
    }
    const handleClick = (event: MapMouseEvent) => {
      onSelect({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
    }
    const handleSourceLoading = (event: MapSourceDataEvent) => {
      if (!cadastreActive.current || event.sourceId !== CADASTRE_SOURCE_ID || !event.tile) return
      if (cadastreFailed.current) return
      setCadastreStatus('loading')
      clearLoadTimeout()
      loadTimeout.current = setTimeout(() => {
        cadastreFailed.current = true
        setCadastreStatus('error')
      }, 15000)
    }
    const handleSourceData = (event: MapSourceDataEvent) => {
      if (!cadastreActive.current || event.sourceId !== CADASTRE_SOURCE_ID || !event.tile || !event.isSourceLoaded) return
      clearLoadTimeout()
      if (!cadastreFailed.current) setCadastreStatus('ready')
    }
    const handleError = (event: ErrorEvent) => {
      const sourceId = (event as ErrorEvent & { sourceId?: string }).sourceId
      if (!cadastreActive.current || sourceId !== CADASTRE_SOURCE_ID) return
      clearLoadTimeout()
      cadastreFailed.current = true
      setCadastreStatus('error')
    }
    map.on('load', () => {
      readyMapRef.current = map
      setZoom(map.getZoom())
      setMapGeneration((value) => value + 1)
    })
    map.on('zoomend', () => setZoom(map.getZoom()))
    map.on('click', handleClick)
    map.on('sourcedataloading', handleSourceLoading)
    map.on('sourcedata', handleSourceData)
    map.on('error', handleError)

    return () => {
      clearLoadTimeout()
      map.off('click', handleClick)
      map.remove()
      mapRef.current = null
      readyMapRef.current = null
    }
  }, [onSelect])

  const canShowCadastre = zoom >= CADASTRE_MIN_ZOOM

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return

    if (!cadastreEnabled || !canShowCadastre) {
      cadastreActive.current = false
      if (loadTimeout.current) clearTimeout(loadTimeout.current)
      loadTimeout.current = null
      removeCadastreLayer(map)
      return
    }

    cadastreActive.current = true
    cadastreFailed.current = false
    removeCadastreLayer(map)
    addCadastreLayer(map)
  }, [mapGeneration, cadastreEnabled, canShowCadastre, retryVersion])

  useEffect(() => {
    if (!selected || !mapRef.current) return

    const marker = new Marker({ color: '#26766b' })
      .setLngLat([selected.longitude, selected.latitude])
      .addTo(mapRef.current)

    return () => {
      marker.remove()
    }
  }, [selected, mapGeneration])

  const needsZoom = cadastreEnabled && !canShowCadastre

  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Mapa" />
      <div className="map-layer-control">
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={cadastreEnabled}
            onChange={(event) => {
              setCadastreStatus('loading')
              setCadastreEnabled(event.target.checked)
            }}
          />
          <Layers3 size={17} aria-hidden="true" />
          <span>Katastr</span>
        </label>
        {cadastreEnabled && (
          <div className={`layer-status ${cadastreStatus === 'error' && !needsZoom ? 'layer-status-error' : ''}`} role="status" aria-live="polite">
            {needsZoom ? (
              <>
                <ZoomIn size={15} aria-hidden="true" />
                <span>Přibližte mapu</span>
                <button type="button" className="layer-action" onClick={() => mapRef.current?.easeTo({ zoom: CADASTRE_MIN_ZOOM, duration: 400 })} title="Přiblížit na parcely" aria-label="Přiblížit na parcely">
                  <ZoomIn size={16} />
                </button>
              </>
            ) : cadastreStatus === 'error' ? (
              <>
                <AlertCircle size={15} aria-hidden="true" />
                <span>ČÚZK se nenačetl</span>
                <button type="button" className="layer-action" onClick={() => {
                  setCadastreStatus('loading')
                  setRetryVersion((value) => value + 1)
                }} title="Zkusit načíst znovu" aria-label="Zkusit načíst katastr znovu">
                  <RefreshCw size={15} />
                </button>
              </>
            ) : cadastreStatus === 'ready' ? (
              <><CheckCircle2 size={15} aria-hidden="true" /><span>Katastr načten</span></>
            ) : (
              <><LoaderCircle size={15} className="spin" aria-hidden="true" /><span>Načítání ČÚZK</span></>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function App() {
  const [selected, setSelected] = useState<Coordinates | null>(null)
  const [copied, setCopied] = useState(false)
  const handleSelect = useCallback((location: Coordinates) => {
    setSelected(location)
    setCopied(false)
  }, [])

  const copyCoordinates = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(
      `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`,
    )
    setCopied(true)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <Network size={21} strokeWidth={2} aria-hidden="true" />
          <span>Fiber Network Studio</span>
        </div>
        <span className="header-section">Mapa</span>
      </header>

      <main className="workspace">
        <section className="map-region" aria-label="Mapa sítě">
          <MapCanvas selected={selected} onSelect={handleSelect} />
        </section>

        <aside className="details-panel" aria-label="Detail výběru">
          <div className="panel-heading">
            <div>
              <span className="section-label">Pracovní plocha</span>
              <h1>Detail místa</h1>
            </div>
            {selected && (
              <button
                className="icon-button"
                type="button"
                onClick={() => setSelected(null)}
                title="Zrušit výběr"
                aria-label="Zrušit výběr"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {selected ? (
            <div className="location-details">
              <div className="location-heading">
                <MapPin size={19} aria-hidden="true" />
                <span>Vybrané místo</span>
              </div>
              <dl>
                <div>
                  <dt>Zeměpisná šířka</dt>
                  <dd>{selected.latitude.toFixed(6)}°</dd>
                </div>
                <div>
                  <dt>Zeměpisná délka</dt>
                  <dd>{selected.longitude.toFixed(6)}°</dd>
                </div>
              </dl>
              <button className="copy-button" type="button" onClick={copyCoordinates}>
                <Copy size={16} aria-hidden="true" />
                {copied ? 'Zkopírováno' : 'Kopírovat souřadnice'}
              </button>
            </div>
          ) : (
            <p className="empty-selection">Žádné místo není vybráno.</p>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
