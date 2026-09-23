import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleDot, HousePlus, Layers3, LoaderCircle, RefreshCw, X, ZoomIn } from 'lucide-react'
import { GeoJSONSource, Map, Marker, NavigationControl, setWorkerUrl, type ErrorEvent, type MapMouseEvent, type MapSourceDataEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addCadastreLayer, CADASTRE_MIN_ZOOM, CADASTRE_SOURCE_ID, removeCadastreLayer } from './cadastre'
import type { Coordinates, NetworkPoint, NetworkPointKind } from './networkPoints'
import type { Parcel } from './parcels'

const POINT_SOURCE_ID = 'network-points'
const POINT_LAYER_ID = 'network-point-dots'
const SELECTED_LAYER_ID = 'network-point-selected'
const PARCEL_SOURCE_ID = 'selected-parcel'
const PARCEL_FILL_LAYER_ID = 'selected-parcel-fill'

type MapCanvasProps = {
  points: NetworkPoint[]
  selectedPointId: string | null
  selectedParcel: Parcel | null
  preview: (Coordinates & { kind?: NetworkPointKind }) | null
  activeTool: NetworkPointKind | null
  placementActive: boolean
  toolsDisabled: boolean
  onToolChange: (kind: NetworkPointKind | null) => void
  onLocationClick: (location: Coordinates, lookupParcel: boolean) => void
  onPointSelect: (id: string) => void
  onCadastreDisable: () => void
}

type CadastreStatus = 'loading' | 'ready' | 'error'

setWorkerUrl(workerUrl)

export function MapCanvas({ points, selectedPointId, selectedParcel, preview, activeTool, placementActive, toolsDisabled, onToolChange, onLocationClick, onPointSelect, onCadastreDisable }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const readyMapRef = useRef<Map | null>(null)
  const interactionRef = useRef({ placementActive, onLocationClick, onPointSelect })
  const cadastreActive = useRef(false)
  const cadastreFailed = useRef(false)
  const refreshCursor = useRef<(() => void) | null>(null)
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapGeneration, setMapGeneration] = useState(0)
  const [zoom, setZoom] = useState(12)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreStatus, setCadastreStatus] = useState<CadastreStatus>('loading')
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    interactionRef.current = { placementActive, onLocationClick, onPointSelect }
  }, [placementActive, onLocationClick, onPointSelect])

  useEffect(() => {
    if (!container.current) return

    const map = new Map({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [14.421, 50.088],
      zoom: 12,
      locale: {
        'Map.Title': 'Mapa',
        'NavigationControl.ZoomIn': 'Přiblížit',
        'NavigationControl.ZoomOut': 'Oddálit',
      },
    })
    mapRef.current = map
    readyMapRef.current = null
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const canvas = map.getCanvas()
    let overPoint = false
    let dragging = false
    const updateCursor = () => {
      if (dragging) canvas.style.cursor = 'grabbing'
      else if (interactionRef.current.placementActive) canvas.style.cursor = 'crosshair'
      else if (overPoint) canvas.style.cursor = 'pointer'
      else canvas.style.cursor = 'grab'
    }
    refreshCursor.current = updateCursor
    updateCursor()

    const clearLoadTimeout = () => {
      if (loadTimeout.current) clearTimeout(loadTimeout.current)
      loadTimeout.current = null
    }
    const handleClick = (event: MapMouseEvent) => {
      const { placementActive, onLocationClick, onPointSelect } = interactionRef.current
      if (!placementActive && map.getLayer(POINT_LAYER_ID)) {
        const feature = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] })[0]
        if (feature?.properties?.id) {
          onPointSelect(String(feature.properties.id))
          return
        }
      }
      onLocationClick(
        { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
        !placementActive && cadastreActive.current && !cadastreFailed.current && map.getZoom() >= CADASTRE_MIN_ZOOM,
      )
    }
    const handleMouseMove = (event: MapMouseEvent) => {
      overPoint = !interactionRef.current.placementActive
        && Boolean(map.getLayer(POINT_LAYER_ID))
        && Boolean(map.getLayer(PARCEL_FILL_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID, PARCEL_FILL_LAYER_ID] }).length > 0
      updateCursor()
    }
    const handleMouseLeave = () => { overPoint = false; updateCursor() }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const offsets: Record<string, [number, number]> = {
        w: [0, -100], a: [-100, 0], s: [0, 100], d: [100, 0],
      }
      const offset = offsets[event.key.toLowerCase()]
      if (!offset) return
      event.preventDefault()
      map.panBy(offset, { duration: 300 })
    }
    const handleSourceLoading = (event: MapSourceDataEvent) => {
      if (!cadastreActive.current || event.sourceId !== CADASTRE_SOURCE_ID || !event.tile || cadastreFailed.current) return
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
      map.addSource(POINT_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: POINT_LAYER_ID,
        type: 'circle',
        source: POINT_SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'kind'], 'building', '#24796d', 'chamber', '#b8613e', '#64716d'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: 'circle',
        source: POINT_SOURCE_ID,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 12,
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-stroke-color': '#183c35',
          'circle-stroke-width': 3,
        },
      })
      map.addLayer({
        id: 'network-point-labels',
        type: 'symbol',
        source: POINT_SOURCE_ID,
        minzoom: 15,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#233b35',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })
      map.addSource(PARCEL_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: PARCEL_FILL_LAYER_ID,
        type: 'fill',
        source: PARCEL_SOURCE_ID,
        paint: { 'fill-color': '#3b82d6', 'fill-opacity': 0.24 },
      }, POINT_LAYER_ID)
      map.addLayer({
        id: 'selected-parcel-outline',
        type: 'line',
        source: PARCEL_SOURCE_ID,
        paint: { 'line-color': '#1769b8', 'line-width': 3 },
      }, POINT_LAYER_ID)
      readyMapRef.current = map
      setZoom(map.getZoom())
      setMapGeneration((value) => value + 1)
    })
    map.on('zoomend', () => setZoom(map.getZoom()))
    map.on('click', handleClick)
    map.on('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    map.on('dragstart', () => { dragging = true; updateCursor() })
    map.on('dragend', () => { dragging = false; updateCursor() })
    canvas.addEventListener('keydown', handleKeyDown)
    map.on('sourcedataloading', handleSourceLoading)
    map.on('sourcedata', handleSourceData)
    map.on('error', handleError)

    return () => {
      clearLoadTimeout()
      canvas.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      refreshCursor.current = null
      map.remove()
      mapRef.current = null
      readyMapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    map.getSource<GeoJSONSource>(POINT_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: points.map((point) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
        properties: { id: point.id, kind: point.kind, name: point.name },
      })),
    })
  }, [points, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    map.getSource<GeoJSONSource>(PARCEL_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: selectedParcel ? [{
        type: 'Feature',
        geometry: selectedParcel.geometry,
        properties: { id: selectedParcel.id },
      }] : [],
    })
  }, [selectedParcel, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(SELECTED_LAYER_ID)) {
      map.setFilter(SELECTED_LAYER_ID, ['==', ['get', 'id'], selectedPointId ?? ''])
    }
  }, [selectedPointId, mapGeneration])

  useEffect(() => {
    const point = points.find((item) => item.id === selectedPointId)
    const map = mapRef.current
    if (point && map && readyMapRef.current === map) {
      map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 15), duration: 350 })
    }
  }, [selectedPointId, points, mapGeneration])

  useEffect(() => {
    refreshCursor.current?.()
  }, [placementActive, mapGeneration])

  useEffect(() => {
    if (!preview || !mapRef.current) return
    const marker = new Marker({ color: preview.kind === 'chamber' ? '#b8613e' : '#24796d' })
      .setLngLat([preview.longitude, preview.latitude])
      .addTo(mapRef.current)
    return () => { marker.remove() }
  }, [preview, mapGeneration])

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
    addCadastreLayer(map, PARCEL_FILL_LAYER_ID)
  }, [mapGeneration, cadastreEnabled, canShowCadastre, retryVersion])

  const needsZoom = cadastreEnabled && !canShowCadastre

  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Mapa" />
      <div className="map-toolbar">
        <div className="map-tool-actions" role="group" aria-label="Přidat objekt">
          <button type="button" className={activeTool === 'building' ? 'map-tool active' : 'map-tool'} aria-pressed={activeTool === 'building'} disabled={toolsDisabled} onClick={() => onToolChange(activeTool === 'building' ? null : 'building')} title="Přidat budovu">
            <HousePlus size={17} aria-hidden="true" /> Budova
          </button>
          <button type="button" className={activeTool === 'chamber' ? 'map-tool active' : 'map-tool'} aria-pressed={activeTool === 'chamber'} disabled={toolsDisabled} onClick={() => onToolChange(activeTool === 'chamber' ? null : 'chamber')} title="Přidat šachtu">
            <CircleDot size={17} aria-hidden="true" /> Šachta
          </button>
        </div>
        {placementActive && (
          <div className="placement-state">
            <span>{activeTool === 'building' ? 'Umístit budovu' : activeTool === 'chamber' ? 'Umístit šachtu' : 'Přesunout bod'}</span>
            <button type="button" className="layer-action" onClick={() => onToolChange(null)} title="Zrušit umístění" aria-label="Zrušit umístění"><X size={15} /></button>
          </div>
        )}
        <label className="layer-toggle">
          <input type="checkbox" checked={cadastreEnabled} onChange={(event) => {
            setCadastreStatus('loading')
            setCadastreEnabled(event.target.checked)
            if (!event.target.checked) onCadastreDisable()
          }} />
          <Layers3 size={17} aria-hidden="true" />
          <span>Katastr</span>
        </label>
        {cadastreEnabled && (
          <div className={`layer-status ${cadastreStatus === 'error' && !needsZoom ? 'layer-status-error' : ''}`} role="status" aria-live="polite">
            {needsZoom ? (
              <><ZoomIn size={15} aria-hidden="true" /><span>Přibližte mapu</span>
                <button type="button" className="layer-action" onClick={() => mapRef.current?.easeTo({ zoom: CADASTRE_MIN_ZOOM, duration: 400 })} title="Přiblížit na parcely" aria-label="Přiblížit na parcely"><ZoomIn size={16} /></button>
              </>
            ) : cadastreStatus === 'error' ? (
              <><AlertCircle size={15} aria-hidden="true" /><span>ČÚZK se nenačetl</span>
                <button type="button" className="layer-action" onClick={() => {
                  setCadastreStatus('loading')
                  setRetryVersion((value) => value + 1)
                }} title="Zkusit načíst znovu" aria-label="Zkusit načíst katastr znovu"><RefreshCw size={15} /></button>
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
