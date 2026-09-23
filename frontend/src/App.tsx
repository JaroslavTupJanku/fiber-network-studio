import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, MapPin, Network, X } from 'lucide-react'
import { Map, Marker, NavigationControl, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

type Coordinates = { latitude: number; longitude: number }

setWorkerUrl(workerUrl)

function MapCanvas({ selected, onSelect }: {
  selected: Coordinates | null
  onSelect: (location: Coordinates) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  useEffect(() => {
    if (!container.current) return

    const map = new Map({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [14.421, 50.088],
      zoom: 12,
    })
    mapRef.current = map

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const handleClick = (event: MapMouseEvent) => {
      onSelect({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
    }
    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
      map.remove()
      mapRef.current = null
    }
  }, [onSelect])

  useEffect(() => {
    if (!selected || !mapRef.current) return

    const marker = new Marker({ color: '#26766b' })
      .setLngLat([selected.longitude, selected.latitude])
      .addTo(mapRef.current)

    return () => {
      marker.remove()
    }
  }, [selected])

  return <div className="map-canvas" ref={container} aria-label="Mapa" />
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
