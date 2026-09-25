import { useEffect, useRef, useState } from 'react'
import { CircleDot, House } from 'lucide-react'
import { MapToolbox, type BaseMap, type CadastreStatus, type OrthophotoStatus, type PlacementPointer } from './MapToolbox'
import { GeoJSONSource, Map, Marker, NavigationControl, setWorkerUrl, type ErrorEvent, type MapMouseEvent, type MapSourceDataEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addCadastreLayer, CADASTRE_LAYER_ID, CADASTRE_MIN_ZOOM, CADASTRE_SOURCE_ID, removeCadastreLayer } from './cadastre'
import { addOrthophotoLayer, ORTHOPHOTO_SOURCE_ID, removeOrthophotoLayer } from './orthophoto'
import type { Coordinates, NetworkPoint, NetworkPointKind } from './networkPoints'
import type { Parcel } from './parcels'
import { initializeMapLayers, pointCollection, routeCollection, routeDraftCollection, routeVertexCollection,
  POINT_SOURCE_ID, POINT_LAYER_ID, SELECTED_LAYER_ID, PARCEL_SOURCE_ID, PARCEL_FILL_LAYER_ID,
  ROUTE_SOURCE_ID, ROUTE_LAYER_ID, SELECTED_ROUTE_LAYER_ID, ROUTE_DRAFT_SOURCE_ID,
  ROUTE_VERTEX_SOURCE_ID, ROUTE_VERTEX_LAYER_ID } from './mapLayers'
import { crossedDragThreshold, mapCursor, resolveMapClick } from './interactions'
import type { RouteDraft, UndergroundRoute } from './undergroundRoutes'

type MapCanvasProps = {
  points: NetworkPoint[]
  routes: UndergroundRoute[]
  selectedRouteId: string | null
  routeDraft: RouteDraft | null
  drawingRoute: boolean
  onRouteToolChange: () => void
  onRouteSelect: (id: string) => void
  onRouteWaypointMove: (index: number, location: Coordinates) => void
  onRouteUndo: () => void
  onRouteFinish: () => void
  onRouteCancel: () => void
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
  onDraftMove: (location: Coordinates) => void
  onCadastreDisable: () => void
}

type PointDrag = { id: string, startX: number, startY: number, original: Coordinates, location: Coordinates, moved: boolean }

setWorkerUrl(workerUrl)

export function MapCanvas({ points, routes, selectedRouteId, routeDraft, drawingRoute, onRouteToolChange,
  onRouteSelect, onRouteWaypointMove, onRouteUndo, onRouteFinish, onRouteCancel, selectedPointId,
  selectedParcel, preview, activeTool, placementActive, toolsDisabled, onToolChange, onToolDrop,
  onLocationClick, onPointSelect, onPointMove, onDraftMove, onCadastreDisable }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const readyMapRef = useRef<Map | null>(null)
  const interactionRef = useRef({ placementActive, activeTool, drawingRoute, onLocationClick,
    onPointSelect, onPointMove, onRouteSelect, onRouteWaypointMove })
  const pointData = useRef(pointCollection([], null, null))
  const skipSelectionEase = useRef<string | null>(null)
  const cadastreActive = useRef(false)
  const cadastreFailed = useRef(false)
  const orthophotoActive = useRef(false)
  const refreshCursor = useRef<(() => void) | null>(null)
  const toolDragActive = useRef(false)
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orthophotoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapGeneration, setMapGeneration] = useState(0)
  const [zoom, setZoom] = useState(12)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreStatus, setCadastreStatus] = useState<CadastreStatus>('loading')
  const [retryVersion, setRetryVersion] = useState(0)
  const [baseMap, setBaseMap] = useState<BaseMap>('street')
  const [orthophotoStatus, setOrthophotoStatus] = useState<OrthophotoStatus>('loading')
  const [orthophotoRetryVersion, setOrthophotoRetryVersion] = useState(0)
  const [dragPointer, setDragPointer] = useState<PlacementPointer | null>(null)
  const [placementPointer, setPlacementPointer] = useState<PlacementPointer | null>(null)
  const [routeHover, setRouteHover] = useState<Coordinates | null>(null)

  useEffect(() => {
    interactionRef.current = { placementActive, activeTool, drawingRoute, onLocationClick,
      onPointSelect, onPointMove, onRouteSelect, onRouteWaypointMove }
  }, [placementActive, activeTool, drawingRoute, onLocationClick, onPointSelect, onPointMove,
    onRouteSelect, onRouteWaypointMove])

  useEffect(() => {
    toolDragActive.current = dragPointer !== null
    refreshCursor.current?.()
  }, [dragPointer])

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
    let overRoute = false
    let overRouteVertex = false
    let overParcel = false
    let dragging = false
    let pointDrag: PointDrag | null = null
    let vertexDrag: number | null = null
    let suppressMapClick = false
    const updateCursor = () => {
      if (interactionRef.current.drawingRoute) {
        canvas.style.cursor = vertexDrag !== null ? 'grabbing' : overPoint ? 'pointer' : 'crosshair'
        return
      }
      if (overRouteVertex) { canvas.style.cursor = 'move'; return }
      if (overRoute) { canvas.style.cursor = 'pointer'; return }
      canvas.style.cursor = mapCursor({
        draggingTool: toolDragActive.current,
        draggingMap: dragging,
        draggingPoint: pointDrag?.moved ?? false,
        placing: interactionRef.current.placementActive,
        overPoint,
        overParcel,
      })
    }
    refreshCursor.current = updateCursor
    updateCursor()

    const clearLoadTimeout = () => {
      if (loadTimeout.current) clearTimeout(loadTimeout.current)
      loadTimeout.current = null
    }
    const clearOrthophotoTimeout = () => {
      if (orthophotoTimeout.current) clearTimeout(orthophotoTimeout.current)
      orthophotoTimeout.current = null
    }
    const handleClick = (event: MapMouseEvent) => {
      if (suppressMapClick) { suppressMapClick = false; return }
      const { placementActive, drawingRoute, onLocationClick, onPointSelect, onRouteSelect } = interactionRef.current
      const pointId = map.getLayer(POINT_LAYER_ID)
        ? map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] })[0]?.properties?.id
        : null
      if (drawingRoute) {
        if (pointId) onPointSelect(String(pointId))
        else onLocationClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }, false)
        return
      }
      if (!placementActive && !pointId && map.getLayer(ROUTE_LAYER_ID)) {
        const routeId = map.queryRenderedFeatures(event.point, { layers: [ROUTE_LAYER_ID] })[0]?.properties?.id
        if (routeId) { onRouteSelect(String(routeId)); return }
      }
      const result = resolveMapClick(pointId ? String(pointId) : null, placementActive,
        cadastreActive.current && !cadastreFailed.current, map.getZoom(), CADASTRE_MIN_ZOOM)
      if (result.kind === 'point') onPointSelect(result.id)
      else onLocationClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }, result.lookupParcel)
    }
    const handleMouseMove = (event: MapMouseEvent) => {
      const { placementActive, activeTool, drawingRoute } = interactionRef.current
      overPoint = Boolean(map.getLayer(POINT_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] }).length > 0
      overRoute = !placementActive && !drawingRoute && !overPoint && Boolean(map.getLayer(ROUTE_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [ROUTE_LAYER_ID] }).length > 0
      overRouteVertex = drawingRoute && Boolean(map.getLayer(ROUTE_VERTEX_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [ROUTE_VERTEX_LAYER_ID] }).length > 0
      overParcel = !placementActive && !overPoint && Boolean(map.getLayer(PARCEL_FILL_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [PARCEL_FILL_LAYER_ID] }).length > 0
      if (drawingRoute && vertexDrag === null) setRouteHover({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
      setPlacementPointer(activeTool && !dragging && !pointDrag && !overPoint
        ? { kind: activeTool, x: event.point.x, y: event.point.y } : null)
      updateCursor()
    }
    const handleMouseLeave = () => {
      overPoint = false
      overRoute = false
      overRouteVertex = false
      overParcel = false
      setRouteHover(null)
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
      if (!pointDrag.moved && !crossedDragThreshold(pointDrag.startX, pointDrag.startY, event.clientX, event.clientY, 4)) return
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
      if (interactionRef.current.drawingRoute) return
      if (interactionRef.current.placementActive && !interactionRef.current.activeTool) return
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
    const handleVertexMouseMove = (event: MouseEvent) => {
      if (vertexDrag === null) return
      const rect = canvas.getBoundingClientRect()
      const location = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
      interactionRef.current.onRouteWaypointMove(vertexDrag, { latitude: location.lat, longitude: location.lng })
    }
    const handleVertexMouseUp = () => {
      vertexDrag = null
      window.removeEventListener('mousemove', handleVertexMouseMove)
      window.removeEventListener('mouseup', handleVertexMouseUp)
      suppressMapClick = true
      window.setTimeout(() => { suppressMapClick = false }, 0)
      updateCursor()
    }
    const handleVertexMouseDown = (event: MapMouseEvent) => {
      if (!interactionRef.current.drawingRoute) return
      const feature = map.queryRenderedFeatures(event.point, { layers: [ROUTE_VERTEX_LAYER_ID] })[0]
      const index = feature?.properties?.index
      if (typeof index !== 'number') return
      event.preventDefault()
      vertexDrag = index
      window.addEventListener('mousemove', handleVertexMouseMove)
      window.addEventListener('mouseup', handleVertexMouseUp)
      updateCursor()
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
      if (orthophotoActive.current && event.sourceId === ORTHOPHOTO_SOURCE_ID && event.tile) {
        setOrthophotoStatus('loading')
        clearOrthophotoTimeout()
        orthophotoTimeout.current = setTimeout(() => setOrthophotoStatus('error'), 15000)
      }
      if (!cadastreActive.current || event.sourceId !== CADASTRE_SOURCE_ID || !event.tile || cadastreFailed.current) return
      setCadastreStatus('loading')
      clearLoadTimeout()
      loadTimeout.current = setTimeout(() => {
        cadastreFailed.current = true
        setCadastreStatus('error')
      }, 15000)
    }
    const handleSourceData = (event: MapSourceDataEvent) => {
      if (orthophotoActive.current && event.sourceId === ORTHOPHOTO_SOURCE_ID && event.tile && event.isSourceLoaded) {
        clearOrthophotoTimeout()
        setOrthophotoStatus('ready')
      }
      if (!cadastreActive.current || event.sourceId !== CADASTRE_SOURCE_ID || !event.tile || !event.isSourceLoaded) return
      clearLoadTimeout()
      if (!cadastreFailed.current) setCadastreStatus('ready')
    }
    const handleError = (event: ErrorEvent) => {
      const sourceId = (event as ErrorEvent & { sourceId?: string }).sourceId
      if (orthophotoActive.current && sourceId === ORTHOPHOTO_SOURCE_ID) {
        clearOrthophotoTimeout()
        setOrthophotoStatus('error')
      }
      if (!cadastreActive.current || sourceId !== CADASTRE_SOURCE_ID) return
      clearLoadTimeout()
      cadastreFailed.current = true
      setCadastreStatus('error')
    }

    map.on('load', () => {
      initializeMapLayers(map)
      readyMapRef.current = map
      setZoom(map.getZoom())
      setMapGeneration((value) => value + 1)
    })
    map.on('zoomend', () => setZoom(map.getZoom()))
    map.on('click', handleClick)
    map.on('mousedown', POINT_LAYER_ID, handlePointMouseDown)
    map.on('mousedown', ROUTE_VERTEX_LAYER_ID, handleVertexMouseDown)
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
      clearOrthophotoTimeout()
      window.removeEventListener('mousemove', handlePointMouseMove)
      window.removeEventListener('mouseup', handlePointMouseUp)
      window.removeEventListener('mousemove', handleVertexMouseMove)
      window.removeEventListener('mouseup', handleVertexMouseUp)
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
    map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)?.setData(routeCollection(routes, points))
  }, [routes, points, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    map.getSource<GeoJSONSource>(ROUTE_DRAFT_SOURCE_ID)?.setData(routeDraftCollection(routeDraft, points,
      drawingRoute ? routeHover : null))
    map.getSource<GeoJSONSource>(ROUTE_VERTEX_SOURCE_ID)?.setData(routeVertexCollection(drawingRoute ? routeDraft : null))
  }, [routeDraft, points, drawingRoute, routeHover, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(SELECTED_ROUTE_LAYER_ID)) {
      map.setFilter(SELECTED_ROUTE_LAYER_ID, ['==', ['get', 'id'], selectedRouteId ?? ''])
    }
  }, [selectedRouteId, mapGeneration])

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
  }, [placementActive, drawingRoute, mapGeneration])

  useEffect(() => {
    if (!preview || selectedPointId || !mapRef.current) return
    const draggable = Boolean(preview.kind)
    const marker = new Marker({ color: preview.kind === 'chamber' ? '#b8613e' : '#24796d', draggable })
      .setLngLat([preview.longitude, preview.latitude])
      .addTo(mapRef.current)
    if (draggable) {
      marker.getElement().style.cursor = 'grab'
      marker.on('dragend', () => {
        const location = marker.getLngLat()
        onDraftMove({ latitude: location.lat, longitude: location.lng })
      })
    }
    return () => { marker.remove() }
  }, [preview, selectedPointId, onDraftMove, mapGeneration])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    orthophotoActive.current = baseMap === 'orthophoto'
    if (orthophotoTimeout.current) clearTimeout(orthophotoTimeout.current)
    orthophotoTimeout.current = null
    removeOrthophotoLayer(map)
    if (baseMap === 'orthophoto') {
      addOrthophotoLayer(map, map.getLayer(CADASTRE_LAYER_ID) ? CADASTRE_LAYER_ID : PARCEL_FILL_LAYER_ID)
      orthophotoTimeout.current = setTimeout(() => setOrthophotoStatus('error'), 15000)
    }
  }, [mapGeneration, baseMap, orthophotoRetryVersion])

  const needsZoom = cadastreEnabled && !canShowCadastre
  const cursorPreview = dragPointer ?? (activeTool === placementPointer?.kind ? placementPointer : null)

  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Mapa" />
      {cursorPreview && (
        <div className={`placement-cursor ${cursorPreview.kind}`} style={{ left: cursorPreview.x, top: cursorPreview.y }} aria-hidden="true">
          <span className="placement-cursor-figure">{cursorPreview.kind === 'building' ? <House size={38} strokeWidth={2.5} /> : <CircleDot size={30} strokeWidth={2.4} />}</span>
          <span className="placement-cursor-target" />
        </div>
      )}
      {placementActive && (
        <div className="placement-guide" role="status">
          <span>{activeTool ? `${activeTool === 'building' ? 'Budova' : 'Šachta'}: klikněte do mapy pro umístění` : 'Přesun objektu: klikněte na nové místo'}</span>
          <button type="button" onClick={() => onToolChange(null)}>Zrušit · Esc</button>
        </div>
      )}
      {drawingRoute && (
        <div className="placement-guide route-guide" role="status">
          <span>{routeDraft?.startPointId
            ? routeDraft.endPointId ? 'Trasa: upravte lomové body nebo dokončete' : 'Trasa: klikněte na lomové body a koncový objekt'
            : 'Trasa: klikněte na výchozí budovu nebo šachtu'}</span>
          <button type="button" onClick={onRouteUndo} disabled={!routeDraft?.startPointId}>Zpět</button>
          <button type="button" onClick={onRouteFinish} disabled={!routeDraft?.endPointId}>Dokončit</button>
          <button type="button" onClick={onRouteCancel}>Zrušit · Esc</button>
        </div>
      )}
      <MapToolbox
        activeTool={activeTool}
        placementActive={placementActive}
        toolsDisabled={toolsDisabled}
        onToolChange={onToolChange}
        routeDrawing={drawingRoute}
        canDrawRoute={points.length >= 2}
        onRouteToolChange={onRouteToolChange}
        onToolDropAt={(kind, clientX, clientY) => {
          const map = mapRef.current
          if (!map || !map.getCanvasContainer().contains(document.elementFromPoint(clientX, clientY))) return
          const rect = map.getCanvas().getBoundingClientRect()
          const location = map.unproject([clientX - rect.left, clientY - rect.top])
          onToolDrop(kind, { latitude: location.lat, longitude: location.lng })
        }}
        onDragPointerChange={setDragPointer}
        mapBounds={() => container.current?.getBoundingClientRect()}
        baseMap={baseMap}
        onBaseMapChange={(next) => {
          if (next === 'orthophoto') setOrthophotoStatus('loading')
          setBaseMap(next)
        }}
        orthophotoStatus={orthophotoStatus}
        onOrthophotoRetry={() => { setOrthophotoStatus('loading'); setOrthophotoRetryVersion(value => value + 1) }}
        cadastreEnabled={cadastreEnabled}
        cadastreStatus={cadastreStatus}
        needsZoom={needsZoom}
        onCadastreChange={(enabled) => {
          setCadastreStatus('loading')
          setCadastreEnabled(enabled)
          if (!enabled) onCadastreDisable()
        }}
        onCadastreRetry={() => { setCadastreStatus('loading'); setRetryVersion(value => value + 1) }}
        onZoomToCadastre={() => mapRef.current?.easeTo({ zoom: CADASTRE_MIN_ZOOM, duration: 400 })}
      />
    </>
  )
}
