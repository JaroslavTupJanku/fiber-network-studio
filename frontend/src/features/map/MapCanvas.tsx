import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleDot, Box, UtilityPole, House, Info, Route as RouteIcon } from 'lucide-react'
import { MapToolbox, type BaseMap, type CadastreStatus, type OrthophotoStatus, type PlacementPointer } from './MapToolbox'
import { GeoJSONSource, LngLatBounds, Map, Marker, NavigationControl, setWorkerUrl, type ErrorEvent, type MapMouseEvent, type MapSourceDataEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addCadastreLayer, CADASTRE_LAYER_ID, CADASTRE_MIN_ZOOM, CADASTRE_SOURCE_ID, removeCadastreLayer } from './cadastre'
import { addOrthophotoLayer, ORTHOPHOTO_SOURCE_ID, removeOrthophotoLayer } from './orthophoto'
import type { Coordinates, NetworkPoint, NetworkPointKind } from './networkPoints'
import type { Parcel } from './parcels'
import type { RouteInstallationDocument } from './routeInstallations'
import type { OpticalSpliceDocument } from './opticalSplices'
import { crossingBuildingFootprints, type BuildingFootprint } from './buildingFootprints'
import { initializeMapLayers, pointCollection, routeCollection, routeDraftCollection, routeVertexCollection,
  POINT_SOURCE_ID, POINT_LAYER_ID, SELECTED_LAYER_ID, HOVERED_POINT_LAYER_ID, ROUTE_ENDPOINT_LAYER_ID, PARCEL_SOURCE_ID, PARCEL_FILL_LAYER_ID,
  ROUTE_SOURCE_ID, ROUTE_LAYER_ID, SELECTED_ROUTE_LAYER_ID, TRACED_ROUTE_LAYER_ID, HOVERED_ROUTE_LAYER_ID, ROUTE_DRAFT_SOURCE_ID,
  ROUTE_VERTEX_SOURCE_ID, ROUTE_INSERT_SOURCE_ID, BUILDING_CROSSING_SOURCE_ID } from './mapLayers'
import { crossedDragThreshold, mapCursor, resolveMapClick } from './interactions'
import { routeKind, routeGeometryHit, routeCoordinates, routeLengthMeters, routeSplitPosition, waypointsAfterPointMove,
  type RouteKind, type RouteDraft, type RouteSplitPosition, type UndergroundRoute } from './undergroundRoutes'

export type MapSnapshot = { image: string; baseMap: string; cadastre: boolean; scaleMeters: number;
  widthCss: number; bearing: number; center: string; capturedAt: string } | { error: string }

type MapCanvasProps = {
  points: NetworkPoint[]
  routes: UndergroundRoute[]
  installations: RouteInstallationDocument[] | null
  splices: OpticalSpliceDocument[]
  installationLoading: boolean
  selectedRouteId: string | null
  tracedRouteIds: string[]
  hoveredRouteId: string | null
  onMapRouteHoverChange: (id: string | null) => void
  routeFocusRequest: { id: string, sequence: number } | null
  pointFocusRequest: { id: string, sequence: number } | null
  routeDraft: RouteDraft | null
  drawingRoute: boolean
  routePaused: boolean
  routeError: string
  routeSplitActive: boolean
  routeSplitPreview: Coordinates[]
  routeSplitSelection: RouteSplitPosition | null
  onRouteSplitPick: (position: RouteSplitPosition) => void
  onRouteSplitCancel: () => void
  routeBuildingCrossings: BuildingFootprint[]
  routeNearbyBuildings: BuildingFootprint[]
  routeCheckingBuildings: boolean
  pointMoveError: string
  onRouteToolChange: (kind: RouteKind) => void
  onRouteSelect: (id: string) => void
  onRouteEdit: (id: string) => void
  onRouteWaypointInsert: (segmentIndex: number, location: Coordinates) => void
  onRouteWaypointMove: (index: number, location: Coordinates) => void
  onRouteWaypointRemove: (index: number) => void
  onRouteUndo: () => void
  onRouteFinish: () => void
  onRouteCancel: () => void
  selectedPointId: string | null
  hoveredPointId: string | null
  onMapPointHoverChange: (id: string | null) => void
  selectedParcel: Parcel | null
  preview: (Coordinates & { kind?: NetworkPointKind }) | null
  activeTool: NetworkPointKind | null
  placementActive: boolean
  toolsDisabled: boolean
  onToolChange: (kind: NetworkPointKind | null) => void
  onToolDrop: (kind: NetworkPointKind, location: Coordinates) => void
  onLocationClick: (location: Coordinates, lookupParcel: boolean) => void
  onPointSelect: (id: string) => void
  onPointMove: (id: string, location: Coordinates) => Promise<void>
  onDraftMove: (location: Coordinates) => void
  onCadastreDisable: () => void
  snapshotRequest: number
  onMapSnapshot: (snapshot: MapSnapshot) => void
}

type PointDrag = { id: string, kind: NetworkPointKind, startX: number, startY: number, original: Coordinates, location: Coordinates, moved: boolean }

const withPointPosition = (points: NetworkPoint[], id: string, location: Coordinates) => points.map(point =>
  point.id === id ? { ...point, ...location } : point)

setWorkerUrl(workerUrl)

export function MapCanvas({ points, routes, installations, splices, installationLoading, selectedRouteId, tracedRouteIds, hoveredRouteId, onMapRouteHoverChange, routeFocusRequest, pointFocusRequest, routeDraft, drawingRoute, routePaused, routeError,
  routeSplitActive, routeSplitSelection, routeSplitPreview, onRouteSplitPick, onRouteSplitCancel,
  routeBuildingCrossings, routeNearbyBuildings, routeCheckingBuildings, pointMoveError, onRouteToolChange,
  onRouteSelect, onRouteEdit, onRouteWaypointInsert, onRouteWaypointMove, onRouteWaypointRemove, onRouteUndo, onRouteFinish, onRouteCancel, selectedPointId, hoveredPointId, onMapPointHoverChange,
  selectedParcel, preview, activeTool, placementActive, toolsDisabled, onToolChange, onToolDrop,
  onLocationClick, onPointSelect, onPointMove, onDraftMove, onCadastreDisable,
  snapshotRequest, onMapSnapshot }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const readyMapRef = useRef<Map | null>(null)
  const interactionRef = useRef({ placementActive, activeTool, drawingRoute, routeSplitActive,
    routeSplitSelection, onRouteSplitPick, onLocationClick,
    onPointSelect, onPointMove, onRouteSelect, onRouteEdit, onRouteWaypointInsert, onRouteWaypointMove, onRouteWaypointRemove,
    onMapPointHoverChange, onMapRouteHoverChange })
  const pointData = useRef(pointCollection([], null, null))
  const splicePointIds = useMemo(() => new Set(splices.map(splice => splice.pointId)), [splices])
  const displayedPoints = useMemo(() => selectedPointId && preview
    ? withPointPosition(points, selectedPointId, preview) : points, [points, selectedPointId, preview])
  const geometryRef = useRef({ displayedPoints, routes, installations, routeDraft, splicePointIds, routeNearbyBuildings })
  const dragPreviewRef = useRef<{ id: string, location: Coordinates } | null>(null)
  const skipSelectionEase = useRef<string | null>(null)
  const focusedPointId = useRef<string | null>(null)
  const lastRouteFocusSequence = useRef(0)
  const lastPointFocusSequence = useRef(0)
  const lastSnapshotRequest = useRef(0)
  const cadastreActive = useRef(false)
  const cadastreFailed = useRef(false)
  const orthophotoActive = useRef(false)
  const refreshCursor = useRef<(() => void) | null>(null)
  const selectedWaypointRef = useRef<number | null>(null)
  const toolDragActive = useRef(false)
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orthophotoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapGeneration, setMapGeneration] = useState(0)
  const [pointMoveRevision, setPointMoveRevision] = useState(0)
  const [zoom, setZoom] = useState(12)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreStatus, setCadastreStatus] = useState<CadastreStatus>('loading')
  const [retryVersion, setRetryVersion] = useState(0)
  const [baseMap, setBaseMap] = useState<BaseMap>('street')
  const [orthophotoStatus, setOrthophotoStatus] = useState<OrthophotoStatus>('loading')
  const [orthophotoRetryVersion, setOrthophotoRetryVersion] = useState(0)
  const [dragPointer, setDragPointer] = useState<PlacementPointer | null>(null)
  const [grabbedPointPointer, setGrabbedPointPointer] = useState<PlacementPointer | null>(null)
  const [placementPointer, setPlacementPointer] = useState<PlacementPointer | null>(null)
  const [routeHover, setRouteHover] = useState<Coordinates | null>(null)
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState<number | null>(null)
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null)
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState<number | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; pointId: string | null; routeId: string | null } | null>(null)
  const routeStatuses = useMemo(() => new Set(routeCollection(routes, points, installations)
    .features.map(feature => feature.properties.installationStatus)), [routes, points, installations])
  const routeStartName = points.find(point => point.id === routeDraft?.startPointId)?.name ?? 'neznámý bod'
  const routeEndName = points.find(point => point.id === routeDraft?.endPointId)?.name ?? 'neznámý bod'

  useEffect(() => {
    interactionRef.current = { placementActive, activeTool, drawingRoute, routeSplitActive,
      routeSplitSelection, onRouteSplitPick, onLocationClick,
      onPointSelect, onPointMove, onRouteSelect, onRouteEdit, onRouteWaypointInsert, onRouteWaypointMove, onRouteWaypointRemove,
      onMapPointHoverChange, onMapRouteHoverChange }
  }, [placementActive, activeTool, drawingRoute, routeSplitActive, routeSplitSelection, onRouteSplitPick,
    onLocationClick, onPointSelect, onPointMove,
    onRouteSelect, onRouteEdit, onRouteWaypointInsert, onRouteWaypointMove, onRouteWaypointRemove, onMapPointHoverChange, onMapRouteHoverChange])

  useEffect(() => {
    geometryRef.current = { displayedPoints, routes, installations, routeDraft, splicePointIds, routeNearbyBuildings }
  }, [displayedPoints, routes, installations, routeDraft, splicePointIds, routeNearbyBuildings])

  useEffect(() => {
    if (!drawingRoute) return
    return () => {
      selectedWaypointRef.current = null
      setSelectedWaypointIndex(null)
      setHoveredWaypointIndex(null)
      setDraggingWaypointIndex(null)
    }
  }, [drawingRoute])

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
      canvasContextAttributes: { preserveDrawingBuffer: true },
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
    let overDraftLine = false
    let overParcel = false
    let mapHoverPointId: string | null = null
    let mapHoverRouteId: string | null = null
    let dragging = false
    let pointDrag: PointDrag | null = null
    let pointMovePending = false
    let vertexDrag: number | null = null
    let vertexDragStart: { x: number; y: number } | null = null
    let vertexDragMoved = false
    let pointDragPanEnabled = false
    let vertexDragPanEnabled = false
    let suppressMapClick = false
    const updateCursor = () => {
      if (interactionRef.current.routeSplitActive) {
        canvas.style.cursor = overDraftLine ? 'crosshair' : 'default'
        return
      }
      if (interactionRef.current.drawingRoute) {
        canvas.style.cursor = vertexDrag !== null || pointDrag || dragging ? 'grabbing'
          : overRouteVertex || overPoint ? 'grab' : overDraftLine ? 'pointer' : 'crosshair'
        return
      }
      if (pointDrag || dragging) { canvas.style.cursor = 'grabbing'; return }
      if (overRouteVertex) { canvas.style.cursor = 'move'; return }
      if (overRoute) { canvas.style.cursor = 'pointer'; return }
      canvas.style.cursor = mapCursor({
        draggingTool: toolDragActive.current,
        draggingMap: dragging,
        draggingPoint: pointDrag !== null,
        placing: interactionRef.current.placementActive,
        overPoint,
        overParcel,
      })
    }
    refreshCursor.current = updateCursor
    updateCursor()

    // Use the same generous hit area for hover, click and drag. The rendered
    // route line is only 5 px wide, making a precise pixel hit hard to discover.
    const featureAt = (point: MapMouseEvent['point'], layerId: string, tolerance: number) => {
      if (!map.getLayer(layerId)) return null
      const directHit = map.queryRenderedFeatures(point, { layers: [layerId] })[0]
      if (directHit) return directHit
      const nearby = map.queryRenderedFeatures([
        [point.x - tolerance, point.y - tolerance],
        [point.x + tolerance, point.y + tolerance],
      ], { layers: [layerId] })
      if (layerId !== POINT_LAYER_ID) return nearby[0] ?? null
      return nearby.map(feature => {
        if (feature.geometry.type !== 'Point') return { feature, distance: Infinity }
        const [longitude, latitude] = feature.geometry.coordinates
        const center = map.project([longitude, latitude])
        return { feature, distance: Math.hypot(center.x - point.x, center.y - point.y) }
      }).filter(hit => hit.distance <= tolerance).sort((a, b) => a.distance - b.distance)[0]?.feature ?? null
    }

    // The visible endpoint ring is wider than the point dot. Use the same hit
    // area for hover, click and drag so grabbing its edge still moves the point.
    const pointAt = (point: MapMouseEvent['point'], drawingRoute: boolean) =>
      featureAt(point, POINT_LAYER_ID, drawingRoute ? 24 : 16)

    const draftGeometryHit = (point: MapMouseEvent['point']) => {
      const { routeDraft, displayedPoints } = geometryRef.current
      if (!routeDraft?.startPointId) return null
      const coordinates = routeCoordinates(routeDraft, displayedPoints)
      if (coordinates.length < 2) return null
      const projected = coordinates.map(item => map.project([item.longitude, item.latitude]))
      const hit = routeGeometryHit(projected, point, 12, !routeDraft.endPointId)
      return !routeDraft.endPointId && hit?.kind === 'segment' ? null : hit
    }
    const selectVertex = (index: number | null) => {
      selectedWaypointRef.current = index
      setSelectedWaypointIndex(index)
    }
    const routeAt = (point: MapMouseEvent['point']) => {
      const draft = geometryRef.current.routeDraft
      if (draft?.id && draftGeometryHit(point)) return draft.id
      const id = featureAt(point, ROUTE_LAYER_ID, 8)?.properties?.id
      return id ? String(id) : null
    }
    const setInsertPreview = (point: { x: number; y: number } | null) => {
      const source = map.getSource<GeoJSONSource>(ROUTE_INSERT_SOURCE_ID)
      if (!source) return
      const location = point ? map.unproject([point.x, point.y]) : null
      source.setData({ type: 'FeatureCollection', features: location ? [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [location.lng, location.lat] }, properties: {},
      }] : [] })
    }

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
      setLegendOpen(false)
      const { placementActive, drawingRoute, routeSplitActive,
        onRouteSplitPick, onLocationClick, onPointSelect, onRouteSelect } = interactionRef.current
      if (routeSplitActive) {
        const hit = draftGeometryHit(event.point)
        const saved = geometryRef.current.routes.find(route => route.id === geometryRef.current.routeDraft?.id)
        if (hit?.kind === 'segment' && saved) {
          const vertices = routeCoordinates(saved, geometryRef.current.displayedPoints)
          const first = map.project([vertices[hit.index].longitude, vertices[hit.index].latitude])
          const second = map.project([vertices[hit.index + 1].longitude, vertices[hit.index + 1].latitude])
          const dx = second.x - first.x; const dy = second.y - first.y
          const fraction = (dx || dy) ? ((hit.x - first.x) * dx + (hit.y - first.y) * dy) / (dx * dx + dy * dy) : 0
          const position = routeSplitPosition(saved, geometryRef.current.displayedPoints, hit.index, fraction)
          if (position) onRouteSplitPick(position)
        }
        return
      }
      const pointId = pointAt(event.point, drawingRoute)?.properties?.id
      if (drawingRoute) {
        selectVertex(null)
        if (pointId) onPointSelect(String(pointId))
        else if (!geometryRef.current.routeDraft?.endPointId)
          onLocationClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }, false)
        return
      }
      if (!placementActive && !pointId) {
        const routeId = routeAt(event.point)
        if (routeId) { onRouteSelect(routeId); return }
      }
      const result = resolveMapClick(pointId ? String(pointId) : null, placementActive,
        cadastreActive.current && !cadastreFailed.current, map.getZoom(), CADASTRE_MIN_ZOOM)
      if (result.kind === 'point') onPointSelect(result.id)
      else onLocationClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }, result.lookupParcel)
    }
    const handleDoubleClick = (event: MapMouseEvent) => {
      const { placementActive, drawingRoute, routeSplitActive, onRouteEdit, onPointSelect } = interactionRef.current
      if (placementActive || drawingRoute || routeSplitActive) return
      const pointId = pointAt(event.point, false)?.properties?.id
      if (pointId) { event.preventDefault(); onPointSelect(String(pointId)); return }
      const routeId = routeAt(event.point)
      if (!routeId) return
      event.preventDefault()
      onRouteEdit(routeId)
    }
    const handleMouseMove = (event: MapMouseEvent) => {
      const { placementActive, activeTool, drawingRoute, routeSplitActive } = interactionRef.current
      const pointId = pointAt(event.point, drawingRoute)?.properties?.id
      overPoint = Boolean(pointId)
      const routeId = !placementActive && !drawingRoute && !overPoint
        ? routeAt(event.point) : null
      overRoute = Boolean(routeId)
      const nextPointId = dragging || pointDrag || vertexDrag !== null || !pointId ? null : String(pointId)
      const nextRouteId = dragging || pointDrag || vertexDrag !== null || !routeId ? null : String(routeId)
      setHoverLabel(!activeTool && (nextPointId || nextRouteId) ? {
        x: Math.min(event.point.x + 16, Math.max(8, map.getContainer().clientWidth - 245)),
        y: Math.max(8, event.point.y - 48), pointId: nextPointId, routeId: nextRouteId,
      } : null)
      if (nextPointId !== mapHoverPointId) {
        mapHoverPointId = nextPointId
        interactionRef.current.onMapPointHoverChange(nextPointId)
      }
      if (nextRouteId !== mapHoverRouteId) {
        mapHoverRouteId = nextRouteId
        interactionRef.current.onMapRouteHoverChange(nextRouteId)
      }
      const draftHit = drawingRoute || routeSplitActive ? draftGeometryHit(event.point) : null
      overRouteVertex = !overPoint && draftHit?.kind === 'vertex'
      overDraftLine = !overPoint && draftHit?.kind === 'segment'
      setHoveredWaypointIndex(overRouteVertex && draftHit?.kind === 'vertex' ? draftHit.index : null)
      setInsertPreview(overDraftLine && draftHit?.kind === 'segment' ? draftHit
        : routeSplitActive && interactionRef.current.routeSplitSelection
          ? map.project([interactionRef.current.routeSplitSelection.location.longitude,
            interactionRef.current.routeSplitSelection.location.latitude]) : null)
      overParcel = !placementActive && !overPoint && Boolean(map.getLayer(PARCEL_FILL_LAYER_ID))
        && map.queryRenderedFeatures(event.point, { layers: [PARCEL_FILL_LAYER_ID] }).length > 0
      if (drawingRoute && vertexDrag === null && !pointDrag)
        setRouteHover({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
      setPlacementPointer(activeTool && !dragging && !pointDrag && !overPoint
        ? { kind: activeTool, x: event.point.x, y: event.point.y } : null)
      updateCursor()
    }
    const handleMouseLeave = () => {
      setHoverLabel(null)
      overPoint = false
      overRoute = false
      overRouteVertex = false
      overDraftLine = false
      setHoveredWaypointIndex(null)
      overParcel = false
      if (mapHoverPointId !== null) {
        mapHoverPointId = null
        interactionRef.current.onMapPointHoverChange(null)
      }
      if (mapHoverRouteId !== null) {
        mapHoverRouteId = null
        interactionRef.current.onMapRouteHoverChange(null)
      }
      setRouteHover(null)
      const splitSelection = interactionRef.current.routeSplitSelection
      setInsertPreview(interactionRef.current.routeSplitActive && splitSelection
        ? map.project([splitSelection.location.longitude, splitSelection.location.latitude]) : null)
      setPlacementPointer(null)
      updateCursor()
    }
    const setPointPosition = (id: string, location: Coordinates) => {
      dragPreviewRef.current = { id, location }
      const { displayedPoints, routes, installations, routeDraft, splicePointIds, routeNearbyBuildings } = geometryRef.current
      const previewPoints = withPointPosition(displayedPoints, id, location)
      const previewRoutes = routes.map(route => ({ ...route,
        waypoints: waypointsAfterPointMove(route, displayedPoints, id, location) }))
      pointData.current = pointCollection(previewPoints, null, null, splicePointIds)
      map.getSource<GeoJSONSource>(POINT_SOURCE_ID)?.setData(pointData.current)
      map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)?.setData(routeCollection(
        previewRoutes.filter(route => route.id !== routeDraft?.id), previewPoints, installations))
      const previewDraft = routeDraft ? { ...routeDraft,
        waypoints: waypointsAfterPointMove(routeDraft, displayedPoints, id, location) } : null
      map.getSource<GeoJSONSource>(ROUTE_DRAFT_SOURCE_ID)?.setData(routeDraftCollection(previewDraft, previewPoints, null))
      map.getSource<GeoJSONSource>(ROUTE_VERTEX_SOURCE_ID)?.setData(routeVertexCollection(
        interactionRef.current.drawingRoute ? previewDraft : null))
      if (interactionRef.current.drawingRoute && previewDraft) {
        map.getSource<GeoJSONSource>(BUILDING_CROSSING_SOURCE_ID)?.setData({
          type: 'FeatureCollection', features: crossingBuildingFootprints(previewDraft, previewPoints, routeNearbyBuildings),
        })
      }
    }
    const handlePointMouseMove = (event: MouseEvent) => {
      if (!pointDrag) return
      if (!pointDrag.moved && !crossedDragThreshold(pointDrag.startX, pointDrag.startY, event.clientX, event.clientY, 4)) return
      const rect = canvas.getBoundingClientRect()
      const location = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
      pointDrag.moved = true
      pointDrag.location = { latitude: location.lat, longitude: location.lng }
      setPointPosition(pointDrag.id, pointDrag.location)
      const pointer = map.project([location.lng, location.lat])
      setGrabbedPointPointer({ kind: pointDrag.kind, x: pointer.x, y: pointer.y })
      updateCursor()
    }
    const handlePointMouseUp = (event: MouseEvent) => {
      if (!pointDrag) return
      const { id, original, location, moved } = pointDrag
      pointDrag = null
      if (pointDragPanEnabled) map.dragPan.enable()
      pointDragPanEnabled = false
      setGrabbedPointPointer(null)
      window.removeEventListener('mousemove', handlePointMouseMove)
      window.removeEventListener('mouseup', handlePointMouseUp)
      suppressMapClick = true
      window.setTimeout(() => { suppressMapClick = false }, 0)
      if (!moved) {
        skipSelectionEase.current = id
        interactionRef.current.onPointSelect(id)
      }
      else if (map.getCanvasContainer().contains(document.elementFromPoint(event.clientX, event.clientY))) {
        skipSelectionEase.current = id
        pointMovePending = true
        void interactionRef.current.onPointMove(id, location).finally(() => {
          pointMovePending = false
          dragPreviewRef.current = null
          setPointMoveRevision(revision => revision + 1)
        })
      } else {
        setPointPosition(id, original)
        dragPreviewRef.current = null
        setPointMoveRevision(revision => revision + 1)
      }
      updateCursor()
    }
    const handlePointMouseDown = (event: MapMouseEvent) => {
      if (interactionRef.current.routeSplitActive || pointMovePending) return
      const drawingRoute = interactionRef.current.drawingRoute
      const pointFeature = pointAt(event.point, drawingRoute)
      if (drawingRoute) {
        if (event.originalEvent.detail > 1) return
        const hit = draftGeometryHit(event.point)
        if (hit && !pointFeature) {
          event.preventDefault()
          map.stop()
          canvas.focus()
          vertexDragPanEnabled = map.dragPan.isEnabled()
          if (vertexDragPanEnabled) map.dragPan.disable()
          vertexDrag = hit.index
          vertexDragStart = { x: event.originalEvent.clientX, y: event.originalEvent.clientY }
          vertexDragMoved = false
          selectVertex(hit.index)
          setDraggingWaypointIndex(hit.index)
          if (hit.kind === 'segment') {
            const location = map.unproject([hit.x, hit.y])
            interactionRef.current.onRouteWaypointInsert(hit.index,
              { latitude: location.lat, longitude: location.lng })
          }
          setInsertPreview(null)
          window.addEventListener('mousemove', handleVertexMouseMove)
          window.addEventListener('mouseup', handleVertexMouseUp)
          updateCursor()
          return
        }
      }
      if (interactionRef.current.placementActive && !interactionRef.current.activeTool) return
      const id = pointFeature?.properties?.id
      const renderedPoint = pointData.current.features.find((item) => item.properties.id === id)
      if (!id || !renderedPoint) return
      setLegendOpen(false)
      event.preventDefault()
      map.stop()
      canvas.focus()
      pointDragPanEnabled = map.dragPan.isEnabled()
      if (pointDragPanEnabled) map.dragPan.disable()
      const [longitude, latitude] = renderedPoint.geometry.coordinates
      const original = { latitude, longitude }
      if (drawingRoute) {
        setRouteHover(null)
        setInsertPreview(null)
      }
      pointDrag = { id: String(id), kind: renderedPoint.properties.kind, startX: event.originalEvent.clientX, startY: event.originalEvent.clientY, original, location: original, moved: false }
      window.addEventListener('mousemove', handlePointMouseMove)
      window.addEventListener('mouseup', handlePointMouseUp)
      updateCursor()
    }
    const handleVertexMouseMove = (event: MouseEvent) => {
      if (vertexDrag === null || !vertexDragStart) return
      if (!vertexDragMoved && !crossedDragThreshold(vertexDragStart.x, vertexDragStart.y,
        event.clientX, event.clientY, 4)) return
      vertexDragMoved = true
      const rect = canvas.getBoundingClientRect()
      const location = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
      interactionRef.current.onRouteWaypointMove(vertexDrag, { latitude: location.lat, longitude: location.lng })
    }
    const handleVertexMouseUp = () => {
      vertexDrag = null
      vertexDragStart = null
      vertexDragMoved = false
      setDraggingWaypointIndex(null)
      if (vertexDragPanEnabled) map.dragPan.enable()
      vertexDragPanEnabled = false
      window.removeEventListener('mousemove', handleVertexMouseMove)
      window.removeEventListener('mouseup', handleVertexMouseUp)
      suppressMapClick = true
      window.setTimeout(() => { suppressMapClick = false }, 0)
      updateCursor()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (interactionRef.current.drawingRoute && selectedWaypointRef.current !== null
        && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        interactionRef.current.onRouteWaypointRemove(selectedWaypointRef.current)
        selectVertex(null)
        setHoveredWaypointIndex(null)
        return
      }
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
    map.on('dblclick', handleDoubleClick)
    map.on('mousedown', handlePointMouseDown)
    map.on('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    map.on('dragstart', () => { dragging = true; setHoverLabel(null); setPlacementPointer(null); updateCursor() })
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
      if (pointDragPanEnabled || vertexDragPanEnabled) map.dragPan.enable()
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
    const renderedPoints = dragPreviewRef.current
      ? withPointPosition(displayedPoints, dragPreviewRef.current.id, dragPreviewRef.current.location) : displayedPoints
    pointData.current = pointCollection(renderedPoints, null, null, splicePointIds)
    map.getSource<GeoJSONSource>(POINT_SOURCE_ID)?.setData(pointData.current)
  }, [displayedPoints, splicePointIds, mapGeneration, pointMoveRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    const renderedPoints = dragPreviewRef.current
      ? withPointPosition(displayedPoints, dragPreviewRef.current.id, dragPreviewRef.current.location) : displayedPoints
    const renderedRoutes = dragPreviewRef.current ? routes.map(route => ({ ...route,
      waypoints: waypointsAfterPointMove(route, displayedPoints, dragPreviewRef.current!.id,
        dragPreviewRef.current!.location) })) : routes
    map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)?.setData(routeCollection(
      renderedRoutes.filter(route => route.id !== routeDraft?.id), renderedPoints, installations))
  }, [routes, displayedPoints, installations, routeDraft?.id, mapGeneration, pointMoveRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    const renderedPoints = dragPreviewRef.current
      ? withPointPosition(displayedPoints, dragPreviewRef.current.id, dragPreviewRef.current.location) : displayedPoints
    const drag = dragPreviewRef.current
    const renderedDraft = drag && routeDraft ? { ...routeDraft,
      waypoints: waypointsAfterPointMove(routeDraft, displayedPoints, drag.id, drag.location) } : routeDraft
    map.getSource<GeoJSONSource>(ROUTE_DRAFT_SOURCE_ID)?.setData(routeDraftCollection(renderedDraft, renderedPoints,
      drawingRoute && !drag ? routeHover : null))
    map.getSource<GeoJSONSource>(ROUTE_VERTEX_SOURCE_ID)?.setData(routeVertexCollection(drawingRoute ? renderedDraft : null,
      hoveredWaypointIndex, selectedWaypointIndex, draggingWaypointIndex))
  }, [routeDraft, displayedPoints, drawingRoute, routeHover, hoveredWaypointIndex, selectedWaypointIndex,
    draggingWaypointIndex, mapGeneration, pointMoveRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    const drag = dragPreviewRef.current
    const previewPoints = drag ? withPointPosition(displayedPoints, drag.id, drag.location) : displayedPoints
    const previewDraft = drag && routeDraft ? { ...routeDraft,
      waypoints: waypointsAfterPointMove(routeDraft, displayedPoints, drag.id, drag.location) } : routeDraft
    map.getSource<GeoJSONSource>(BUILDING_CROSSING_SOURCE_ID)?.setData({
      type: 'FeatureCollection', features: drag && drawingRoute && previewDraft
        ? crossingBuildingFootprints(previewDraft, previewPoints, routeNearbyBuildings) : routeBuildingCrossings,
    })
  }, [routeBuildingCrossings, routeNearbyBuildings, drawingRoute, routeDraft, displayedPoints, mapGeneration, pointMoveError,
    pointMoveRevision])

  useEffect(() => {
    const map = mapRef.current
    const index = selectedWaypointIndex
    const waypoint = index === null ? null : routeDraft?.waypoints[index]
    if (!map || !drawingRoute || draggingWaypointIndex !== null || !waypoint || index === null) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'route-waypoint-remove'
    button.textContent = '×'
    button.setAttribute('aria-label', `Odebrat lomový bod ${index + 1}`)
    button.title = 'Odebrat lomový bod'
    button.addEventListener('mousedown', event => event.stopPropagation())
    button.addEventListener('click', event => {
      event.stopPropagation()
      interactionRef.current.onRouteWaypointRemove(index)
      selectedWaypointRef.current = null
      setSelectedWaypointIndex(null)
      setHoveredWaypointIndex(null)
    })
    const marker = new Marker({ element: button, anchor: 'left', offset: [11, -14] })
      .setLngLat([waypoint.longitude, waypoint.latitude]).addTo(map)
    return () => { marker.remove() }
  }, [drawingRoute, routeDraft?.waypoints, selectedWaypointIndex, draggingWaypointIndex, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    map.getSource<GeoJSONSource>(ROUTE_INSERT_SOURCE_ID)?.setData({
      type: 'FeatureCollection', features: routeSplitActive && routeSplitSelection ? [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [routeSplitSelection.location.longitude,
          routeSplitSelection.location.latitude] }, properties: {},
      }] : routeSplitActive ? routeSplitPreview.map(point => ({ type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] }, properties: {} })) : [],
    })
    refreshCursor.current?.()
  }, [routeSplitActive, routeSplitSelection, routeSplitPreview, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(SELECTED_ROUTE_LAYER_ID)) {
      map.setFilter(SELECTED_ROUTE_LAYER_ID, ['==', ['get', 'id'], selectedRouteId ?? ''])
    }
  }, [selectedRouteId, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(TRACED_ROUTE_LAYER_ID))
      map.setFilter(TRACED_ROUTE_LAYER_ID, ['in', ['get', 'id'], ['literal', tracedRouteIds]])
  }, [tracedRouteIds, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(HOVERED_ROUTE_LAYER_ID)) {
      map.setFilter(HOVERED_ROUTE_LAYER_ID, ['==', ['get', 'id'], hoveredRouteId ?? ''])
    }
  }, [hoveredRouteId, mapGeneration])

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
    const map = mapRef.current
    if (!map?.getLayer(ROUTE_ENDPOINT_LAYER_ID)) return
    const ids = drawingRoute
      ? [routeDraft?.startPointId, routeDraft?.endPointId].filter((id): id is string => Boolean(id))
      : []
    map.setFilter(ROUTE_ENDPOINT_LAYER_ID, ['in', ['get', 'id'], ['literal', ids]])
  }, [drawingRoute, routeDraft?.startPointId, routeDraft?.endPointId, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer(HOVERED_POINT_LAYER_ID)) {
      map.setFilter(HOVERED_POINT_LAYER_ID, ['==', ['get', 'id'], hoveredPointId ?? ''])
    }
  }, [hoveredPointId, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (!routeFocusRequest || !map || readyMapRef.current !== map
      || lastRouteFocusSequence.current === routeFocusRequest.sequence) return
    const route = routes.find(item => item.id === routeFocusRequest.id)
    const coordinates = route ? routeCoordinates(route, points) : []
    if (coordinates.length < 2) return
    const bounds = new LngLatBounds()
    coordinates.forEach(point => bounds.extend([point.longitude, point.latitude]))
    lastRouteFocusSequence.current = routeFocusRequest.sequence
    map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 350 })
  }, [routeFocusRequest, routes, points, mapGeneration])

  useEffect(() => {
    const map = mapRef.current
    if (!pointFocusRequest || !map || readyMapRef.current !== map
      || lastPointFocusSequence.current === pointFocusRequest.sequence) return
    const point = points.find(item => item.id === pointFocusRequest.id)
    if (!point) return
    lastPointFocusSequence.current = pointFocusRequest.sequence
    map.easeTo({ center: [point.longitude, point.latitude], duration: 350 })
  }, [pointFocusRequest, points, mapGeneration])

  useEffect(() => {
    if (!selectedPointId) { focusedPointId.current = null; return }
    if (focusedPointId.current === selectedPointId) return
    const point = points.find((item) => item.id === selectedPointId)
    const map = mapRef.current
    if (point && map && readyMapRef.current === map) {
      focusedPointId.current = selectedPointId
      if (skipSelectionEase.current === selectedPointId) { skipSelectionEase.current = null; return }
      map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 15), duration: 350 })
    }
  }, [selectedPointId, points, mapGeneration])

  useEffect(() => {
    refreshCursor.current?.()
    if (!drawingRoute) mapRef.current?.getSource<GeoJSONSource>(ROUTE_INSERT_SOURCE_ID)?.setData({
      type: 'FeatureCollection', features: [],
    })
  }, [placementActive, drawingRoute, mapGeneration])

  useEffect(() => {
    if (!preview || selectedPointId || !mapRef.current) return
    const draggable = Boolean(preview.kind)
    const marker = new Marker({ color: preview.kind === 'cabinet' ? '#286da8' : preview.kind === 'pole' ? '#75529c' : preview.kind === 'chamber' ? '#b8613e' : '#24796d', draggable })
      .setLngLat([preview.longitude, preview.latitude])
      .addTo(mapRef.current)
    if (draggable) {
      marker.getElement().style.cursor = 'grab'
      const showDragPointer = () => {
        if (!preview.kind || !mapRef.current) return
        const location = marker.getLngLat()
        const pointer = mapRef.current.project(location)
        setGrabbedPointPointer({ kind: preview.kind, x: pointer.x, y: pointer.y })
      }
      marker.on('dragstart', () => { marker.getElement().style.cursor = 'grabbing'; showDragPointer() })
      marker.on('drag', showDragPointer)
      marker.on('dragend', () => {
        marker.getElement().style.cursor = 'grab'
        setGrabbedPointPointer(null)
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

  useEffect(() => {
    if (!snapshotRequest || snapshotRequest === lastSnapshotRequest.current) return
    const map = mapRef.current
    if (!map) return
    lastSnapshotRequest.current = snapshotRequest
    let finished = false
    const capture = () => {
      if (finished) return
      finished = true
      try {
        const canvas = map.getCanvas()
        if (!canvas.width || !canvas.height) throw new Error('Mapa ještě není připravena k exportu.')
        const middleY = canvas.clientHeight / 2
        const left = map.unproject([canvas.clientWidth / 2 - 50, middleY])
        const right = map.unproject([canvas.clientWidth / 2 + 50, middleY])
        const center = map.getCenter()
        onMapSnapshot({ image: canvas.toDataURL('image/png'), baseMap: baseMap === 'street' ? 'Uliční mapa' : 'Ortofoto',
          cadastre: cadastreEnabled && cadastreStatus === 'ready',
          scaleMeters: routeLengthMeters([{ latitude: left.lat, longitude: left.lng }, { latitude: right.lat, longitude: right.lng }]),
          widthCss: canvas.clientWidth, bearing: map.getBearing(),
          center: `${center.lat.toFixed(5)}° N, ${center.lng.toFixed(5)}° E`, capturedAt: new Date().toLocaleString('cs-CZ') })
      } catch (reason) {
        onMapSnapshot({ error: reason instanceof Error ? reason.message : 'Mapu se nepodařilo připravit.' })
      }
    }
    map.once('idle', capture)
    map.triggerRepaint()
    const fallback = window.setTimeout(capture, 1500)
    return () => { map.off('idle', capture); window.clearTimeout(fallback) }
  }, [snapshotRequest, mapGeneration, baseMap, cadastreEnabled, cadastreStatus, onMapSnapshot])

  const needsZoom = cadastreEnabled && !canShowCadastre
  const cursorPreview = dragPointer ?? grabbedPointPointer ?? (activeTool === placementPointer?.kind ? placementPointer : null)

  return (
    <>
      <div className="map-canvas" ref={container} aria-label="Mapa" />
      {cursorPreview && (
        <div className={`placement-cursor ${cursorPreview.kind}`} style={{ left: cursorPreview.x, top: cursorPreview.y }} aria-hidden="true">
          <span className="placement-cursor-figure">{cursorPreview.kind === 'cabinet' ? <Box size={32} /> : cursorPreview.kind === 'building' ? <House size={38} strokeWidth={2.5} /> : cursorPreview.kind === 'pole' ? <UtilityPole size={34} /> : <CircleDot size={30} strokeWidth={2.4} />}</span>
          <span className="placement-cursor-target" />
        </div>
      )}
      {hoverLabel && <div className="map-object-tooltip" role="tooltip" style={{ left: hoverLabel.x, top: hoverLabel.y }}>
        {hoverLabel.pointId ? points.find(point => point.id === hoverLabel.pointId)?.name : routes.find(route => route.id === hoverLabel.routeId)?.name}
      </div>}
      {(drawingRoute || placementActive || routePaused) && <div className="map-mode-badge" role="status">
        <strong>{routePaused ? 'Kreslení trasy pozastaveno · přidání objektu' : drawingRoute ? routeDraft?.id ? 'Upravujete průběh trasy' : 'Kreslíte novou trasu' : activeTool || preview?.kind && !selectedPointId ? 'Umisťujete nový objekt' : 'Přesouváte objekt'}</strong>
        <span>{preview?.kind && !selectedPointId ? 'Kliknutím změňte polohu nebo táhněte za značku. Potom vyplňte název a zvolte Uložit. Zrušení: Esc.' : placementActive && !activeTool ? 'Klikněte na nové místo. Poloha a navázané trasy se uloží ihned. Zrušení: Esc.' : 'Dokončete práci v mapě, nebo ji zrušte tlačítkem Zrušit / Esc.'}</span>
      </div>}
      {placementActive && (
        <div className="placement-guide" role="status">
          <span>{preview?.kind && !selectedPointId ? 'Nový objekt: upravte polohu a uložte jej v panelu' : activeTool ? `${activeTool === 'cabinet' ? 'Optická skříň' : activeTool === 'building' ? 'Budova' : activeTool === 'pole' ? 'Sloup' : 'Šachta'}: klikněte do mapy pro umístění` : 'Přesun objektu: klikněte na nové místo'}</span>
          <button type="button" onClick={() => onToolChange(null)}>Zrušit · Esc</button>
        </div>
      )}
      {pointMoveError && !drawingRoute && <div className="map-action-error" role="alert">{pointMoveError}</div>}
      {drawingRoute && (
        <div className={`placement-guide route-guide${routeError || routeBuildingCrossings.length ? ' route-guide-error' : ''}`} role="status">
          <RouteIcon size={20} aria-hidden="true" />
          <div className="route-guide-copy"><strong>{routeDraft?.id ? 'Úprava trasy' : 'Kreslení trasy'}</strong>
            <span>{routeCheckingBuildings ? 'Ověřuji průchod trasy budovami…' : routeError || pointMoveError || (routeBuildingCrossings.length
              ? 'Trasa zasahuje do budovy. Šachta zůstane na místě; před dokončením upravte průběh lomovým bodem.' : routeDraft?.startPointId
              ? routeDraft.endPointId
                ? `Spojeno: ${routeStartName} → ${routeEndName}. Úsek i objekty můžete přetáhnout; lomový bod kliknutím vyberete.`
                : `Začátek: ${routeStartName}. Klikněte na cíl; tažením síťový objekt přesunete.`
              : 'Klikněte na první vhodný síťový objekt; tažením objekt přesunete.')}</span>
            <small>Přesun objektu se uloží hned; Zrušit vrátí jen kreslení.</small></div>
          <div className="route-guide-actions">
            <button type="button" onClick={onRouteUndo} disabled={!routeDraft?.startPointId}>Zpět</button>
            <button type="button" onClick={onRouteFinish} disabled={!routeDraft?.endPointId || routeCheckingBuildings}>
              {routeCheckingBuildings ? 'Kontroluji…' : 'Dokončit'}</button>
            <button type="button" onClick={onRouteCancel}>Zrušit · Esc</button>
          </div>
        </div>
      )}
      {routeSplitActive && <div className="placement-guide route-guide" role="status">
        <RouteIcon size={20} aria-hidden="true" />
        <div className="route-guide-copy"><strong>{routeSplitPreview.length ? `Náhled: ${routeSplitPreview.length} nových sloupů` : routeDraft && routeKind(routeDraft) === 'aerial' ? 'Nový sloup na trase' : 'Nová šachta na trase'}</strong>
          <span>{routeSplitPreview.length ? 'Pozice zkontrolujte v mapě a potvrďte v panelu trasy.' : routeSplitSelection ? 'Místo je vybrané. Pojmenujte nový objekt a potvrďte rozdělení v panelu.'
            : 'Klikněte na vybranou trasu mezi koncovými objekty a lomovými body.'}</span>
          <small>{routeDraft && routeKind(routeDraft) === 'aerial' ? 'Kabely zůstanou průchozí; jejich délky po rozdělení doplníte zvlášť.' : 'Chráničky a kabely zůstanou průchozí; délky kabelů po rozdělení doplníte zvlášť.'}</small></div>
        <div className="route-guide-actions"><button type="button" onClick={onRouteSplitCancel}>Zrušit</button></div>
      </div>}
      {(points.length > 0 || routes.length > 0) && !drawingRoute && !placementActive && !routeSplitActive && (
        <div className="map-legend">
          <button type="button" className="map-legend-toggle" aria-expanded={legendOpen}
            aria-controls="map-legend-details" onClick={() => setLegendOpen(open => !open)}>
            <Info size={15} aria-hidden="true" /> Legenda mapy
          </button>
          {legendOpen && <div className="map-legend-details" id="map-legend-details">
            <strong>Body sítě</strong>
            <span><i className="point-key building" /> Budova</span>
            <span><i className="point-key chamber" /> Šachta</span>
            <span><i className="point-key pole" /> Sloup</span>
            <span><i className="point-key cabinet" /> Optická skříň</span>
            <span>Plná čára: podzemní · přerušovaná: nadzemní</span>
            {splices.length > 0 && <span><i className="point-key chamber with-splice" /> Fialový okraj: optická spojka</span>}
            {routes.length > 0 && <>
              <strong>Trasy sítě</strong>
              <small>Barva trasy ukazuje její osazení:</small>
              {routeStatuses.has('unknown') && <span><i className="route-key unknown" /> {installationLoading ? 'Osazení se načítá' : 'Osazení se nenačetlo'}</span>}
              {routeStatuses.has('empty') && <span><i className="route-key empty" /> Zatím bez osazení</span>}
              {routeStatuses.has('ducts') && <span><i className="route-key ducts" /> Chránička či trubička bez kabelu</span>}
              {routeStatuses.has('cables') && <span><i className="route-key cables" /> Trasa s optickým kabelem</span>}
            </>}
          </div>}
        </div>
      )}
      <MapToolbox
        activeTool={activeTool ?? (!selectedPointId ? preview?.kind ?? null : null)}
        placementActive={placementActive}
        toolsDisabled={toolsDisabled}
        onToolChange={kind => { setLegendOpen(false); onToolChange(kind) }}
        routeKind={routeDraft ? routeKind(routeDraft) : 'underground'}
        routeDrawing={drawingRoute}
        routePaused={routePaused}
        canDrawRoute={points.length >= 2}
        onRouteToolChange={kind => { setLegendOpen(false); onRouteToolChange(kind) }}
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
