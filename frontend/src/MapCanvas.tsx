import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleDot, House, HousePlus, Layers3, LoaderCircle, RefreshCw, X, ZoomIn } from 'lucide-react'
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

function pointCollection(points: NetworkPoint[], selectedPointId: string | null, preview: Coordinates | null) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => {
      const location = point.id === selectedPointId && preview ? preview : point
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] },
        properties: { id: point.id, kind: point.kind, name: point.name },
      }
    }),
  }
}

type MapCanvasProps = {
  points: NetworkPoint[]
  selectedPointId: string | null
  selectedParcel: Parcel | null
  preview: (Coordinates & { kind?: NetworkPointKind }) | null
  activeTool: NetworkPointKind | null
  placementActive: boolean
  toolsDisabled: boolean
  onToolChange: (kind: NetworkPointKind | null) => void
  onToolDrop: (kind: NetworkPointKind, location: Coordinates) => void
  onLocationClick: (location: Coordinates, lookupParcel: boolean) => void
  onPointSelect: (id: string) => void
  onPointMove: (id: string, location: Coordinates) => void
  onCadastreDisable: () => void
}

type CadastreStatus = 'loading' | 'ready' | 'error'
type PlacementPointer = { kind: NetworkPointKind, x: number, y: number }
type ToolDrag = { kind: NetworkPointKind, pointerId: number, startX: number, startY: number, dragging: boolean }
type PointDrag = { id: string, startX: number, startY: number, original: Coordinates, location: Coordinates, moved: boolean }

setWorkerUrl(workerUrl)

export function MapCanvas({ points, selectedPointId, selectedParcel, preview, activeTool, placementActive, toolsDisabled, onToolChange, onToolDrop, onLocationClick, onPointSelect, onPointMove, onCadastreDisable }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const readyMapRef = useRef<Map | null>(null)
  const interactionRef = useRef({ placementActive, activeTool, onLocationClick, onPointSelect, onPointMove })
  const pointData = useRef(pointCollection([], null, null))
  const skipSelectionEase = useRef<string | null>(null)
  const toolDrag = useRef<ToolDrag | null>(null)
  const suppressToolClick = useRef(false)
  const cadastreActive = useRef(false)
  const cadastreFailed = useRef(false)
  const refreshCursor = useRef<(() => void) | null>(null)
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapGeneration, setMapGeneration] = useState(0)
  const [zoom, setZoom] = useState(12)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreStatus, setCadastreStatus] = useState<CadastreStatus>('loading')
  const [retryVersion, setRetryVersion] = useState(0)
  const [placementPointer, setPlacementPointer] = useState<PlacementPointer | null>(null)
  const [dragPointer, setDragPointer] = useState<PlacementPointer | null>(null)

  useEffect(() => {
    interactionRef.current = { placementActive, activeTool, onLocationClick, onPointSelect, onPointMove }
  }, [placementActive, activeTool, onLocationClick, onPointSelect, onPointMove])

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
    let overParcel = false
    let dragging = false
    let pointDrag: PointDrag | null = null
    let suppressMapClick = false
    const updateCursor = () => {
      if (dragging || pointDrag?.moved) canvas.style.cursor = 'grabbing'
      else if (interactionRef.current.placementActive) canvas.style.cursor = 'crosshair'
      else if (overPoint) canvas.style.cursor = 'move'
      else if (overParcel) canvas.style.cursor = 'pointer'
      else canvas.style.cursor = 'grab'
    }
    refreshCursor.current = updateCursor
    updateCursor()

    const clearLoadTimeout = () => {
      if (loadTimeout.current) clearTimeout(loadTimeout.current)
      loadTimeout.current = null
    }
    const handleClick = (event: MapMouseEvent) => {
      if (suppressMapClick) { suppressMapClick = false; return }
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
      const { activeTool, placementActive } = interactionRef.current
      if (activeTool && !dragging) setPlacementPointer({ kind: activeTool, x: event.point.x, y: event.point.y })
      else setPlacementPointer(null)
      overPoint = !placementActive && Boolean(map.getLayer(POINT_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] }).length > 0
      overParcel = !placementActive && !overPoint && Boolean(map.getLayer(PARCEL_FILL_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [PARCEL_FILL_LAYER_ID] }).length > 0
      updateCursor()
    }
    const handleMouseLeave = () => {
      overPoint = false
      overParcel = false
      setPlacementPointer(null)
      updateCursor()
    }
    const setPointPosition = (id: string, location: Coordinates) => {
      pointData.current = {
        ...pointData.current,
        features: pointData.current.features.map((feature) => feature.properties.id === id
          ? { ...feature, geometry: { ...feature.geometry, coordinates: [location.longitude, location.latitude] } }
          : feature),
      }
      map.getSource<GeoJSONSource>(POINT_SOURCE_ID)?.setData(pointData.current)
    }
    const handlePointMouseMove = (event: MouseEvent) => {
      if (!pointDrag) return
      if (!pointDrag.moved && Math.hypot(event.clientX - pointDrag.startX, event.clientY - pointDrag.startY) < 4) return
      const rect = canvas.getBoundingClientRect()
      const location = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
      pointDrag.moved = true
      pointDrag.location = { latitude: location.lat, longitude: location.lng }
      setPointPosition(pointDrag.id, pointDrag.location)
      updateCursor()
    }
    const handlePointMouseUp = (event: MouseEvent) => {
      if (!pointDrag) return
      const { id, original, location, moved } = pointDrag
      pointDrag = null
      window.removeEventListener('mousemove', handlePointMouseMove)
      window.removeEventListener('mouseup', handlePointMouseUp)
      suppressMapClick = true
      window.setTimeout(() => { suppressMapClick = false }, 0)
      if (!moved) interactionRef.current.onPointSelect(id)
      else if (map.getCanvasContainer().contains(document.elementFromPoint(event.clientX, event.clientY))) {
        skipSelectionEase.current = id
        interactionRef.current.onPointMove(id, location)
      } else setPointPosition(id, original)
      updateCursor()
    }
    const handlePointMouseDown = (event: MapMouseEvent) => {
      if (interactionRef.current.placementActive) return
      const feature = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] })[0]
      const id = feature?.properties?.id
      const renderedPoint = pointData.current.features.find((item) => item.properties.id === id)
      if (!id || !renderedPoint) return
      event.preventDefault()
      const [longitude, latitude] = renderedPoint.geometry.coordinates
      const original = { latitude, longitude }
      pointDrag = { id: String(id), startX: event.originalEvent.clientX, startY: event.originalEvent.clientY, original, location: original, moved: false }
      window.addEventListener('mousemove', handlePointMouseMove)
      window.addEventListener('mouseup', handlePointMouseUp)
    }
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
    map.on('mousedown', POINT_LAYER_ID, handlePointMouseDown)
    map.on('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    map.on('dragstart', () => { dragging = true; setPlacementPointer(null); updateCursor() })
    map.on('dragend', () => { dragging = false; updateCursor() })
    canvas.addEventListener('keydown', handleKeyDown)
    map.on('sourcedataloading', handleSourceLoading)
    map.on('sourcedata', handleSourceData)
    map.on('error', handleError)

    return () => {
      clearLoadTimeout()
      window.removeEventListener('mousemove', handlePointMouseMove)
      window.removeEventListener('mouseup', handlePointMouseUp)
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
    pointData.current = pointCollection(points, selectedPointId, preview)
    map.getSource<GeoJSONSource>(POINT_SOURCE_ID)?.setData(pointData.current)
  }, [points, selectedPointId, preview, mapGeneration])

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
      if (skipSelectionEase.current === selectedPointId) { skipSelectionEase.current = null; return }
      map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 15), duration: 350 })
    }
  }, [selectedPointId, points, mapGeneration])

  useEffect(() => {
    refreshCursor.current?.()
  }, [placementActive, mapGeneration])

  useEffect(() => {
    if (!preview || selectedPointId || !mapRef.current) return
    const marker = new Marker({ color: preview.kind === 'chamber' ? '#b8613e' : '#24796d' })
      .setLngLat([preview.longitude, preview.latitude])
      .addTo(mapRef.current)
    return () => { marker.remove() }
  }, [preview, selectedPointId, mapGeneration])

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

  const handleToolPointerDown = (kind: NetworkPointKind, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    toolDrag.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleToolPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = toolDrag.current
    const rect = container.current?.getBoundingClientRect()
    if (!drag || !rect || drag.pointerId !== event.pointerId) return
    if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return
    drag.dragging = true
    event.preventDefault()
    setDragPointer({ kind: drag.kind, x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  const handleToolPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = toolDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    toolDrag.current = null
    setDragPointer(null)
    if (!drag.dragging) return
    event.preventDefault()
    suppressToolClick.current = true
    window.setTimeout(() => { suppressToolClick.current = false }, 0)
    const map = mapRef.current
    if (!map || !map.getCanvasContainer().contains(document.elementFromPoint(event.clientX, event.clientY))) return
    const rect = map.getCanvas().getBoundingClientRect()
    const location = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
    onToolDrop(drag.kind, { latitude: location.lat, longitude: location.lng })
  }
  const handleToolPointerCancel = () => {
    toolDrag.current = null
    setDragPointer(null)
  }
  const handleToolClick = (kind: NetworkPointKind) => {
    if (suppressToolClick.current) { suppressToolClick.current = false; return }
    setPlacementPointer(null)
    onToolChange(activeTool === kind ? null : kind)
  }
  const cursorPreview = dragPointer ?? (activeTool ? placementPointer : null)

  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Mapa" />
      {cursorPreview && (
        <div className={`placement-cursor ${cursorPreview.kind}`} style={{ left: cursorPreview.x, top: cursorPreview.y }} aria-hidden="true">
          <span className="placement-cursor-figure">{cursorPreview.kind === 'building' ? <House size={38} strokeWidth={2.5} /> : <CircleDot size={30} strokeWidth={2.4} />}</span>
          <span className="placement-cursor-target" />
        </div>
      )}
      <div className="map-toolbar">
        <div className="map-tool-actions" role="group" aria-label="Přidat objekt">
          <button type="button" className={activeTool === 'building' ? 'map-tool active' : 'map-tool'} aria-pressed={activeTool === 'building'} disabled={toolsDisabled} onClick={() => handleToolClick('building')} onPointerDown={(event) => handleToolPointerDown('building', event)} onPointerMove={handleToolPointerMove} onPointerUp={handleToolPointerUp} onPointerCancel={handleToolPointerCancel} title="Přidat budovu nebo přetáhnout na mapu">
            <HousePlus size={17} aria-hidden="true" /> Budova
          </button>
          <button type="button" className={activeTool === 'chamber' ? 'map-tool active' : 'map-tool'} aria-pressed={activeTool === 'chamber'} disabled={toolsDisabled} onClick={() => handleToolClick('chamber')} onPointerDown={(event) => handleToolPointerDown('chamber', event)} onPointerMove={handleToolPointerMove} onPointerUp={handleToolPointerUp} onPointerCancel={handleToolPointerCancel} title="Přidat šachtu nebo přetáhnout na mapu">
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
              <button type="button" className="layer-zoom-action" onClick={() => mapRef.current?.easeTo({ zoom: CADASTRE_MIN_ZOOM, duration: 400 })}>
                <ZoomIn size={16} aria-hidden="true" /><span>Přiblížit na parcely</span>
              </button>
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
