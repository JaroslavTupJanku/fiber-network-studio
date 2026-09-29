import type { Map } from 'maplibre-gl'
import type { Coordinates, NetworkPoint } from './networkPoints'
import { installationSummary, type RouteInstallationDocument } from './routeInstallations'
import { routeCoordinates, type RouteDraft, type UndergroundRoute } from './undergroundRoutes'

export const POINT_SOURCE_ID = 'network-points'
export const POINT_LAYER_ID = 'network-point-dots'
export const SELECTED_LAYER_ID = 'network-point-selected'
export const HOVERED_POINT_LAYER_ID = 'network-point-hovered'
export const SPLICE_LAYER_ID = 'network-splice-badges'
export const HOVERED_SPLICE_LAYER_ID = 'network-splice-hovered'
export const PARCEL_SOURCE_ID = 'selected-parcel'
export const PARCEL_FILL_LAYER_ID = 'selected-parcel-fill'
export const ROUTE_SOURCE_ID = 'underground-routes'
export const ROUTE_LAYER_ID = 'underground-route-lines'
export const SELECTED_ROUTE_LAYER_ID = 'underground-route-selected'
export const HOVERED_ROUTE_LAYER_ID = 'underground-route-hovered'
export const ROUTE_DRAFT_SOURCE_ID = 'underground-route-draft'
export const ROUTE_VERTEX_SOURCE_ID = 'underground-route-vertices'
export const ROUTE_VERTEX_LAYER_ID = 'underground-route-vertex-dots'

export function routeCollection(routes: UndergroundRoute[], points: NetworkPoint[], installations: RouteInstallationDocument[] | null) {
  const byRoute = new globalThis.Map(installations?.map(document => [document.routeId, installationSummary(document)]) ?? [])
  return {
    type: 'FeatureCollection' as const,
    features: routes.flatMap(route => {
      const coordinates = routeCoordinates(route, points)
      return coordinates.length < 2 ? [] : [{
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coordinates.map(point => [point.longitude, point.latitude]) },
        properties: { id: route.id, name: route.name,
          installationStatus: installations === null ? 'unknown' : byRoute.get(route.id)?.status ?? 'empty' },
      }]
    }),
  }
}

export function routeDraftCollection(draft: RouteDraft | null, points: NetworkPoint[], hover: Coordinates | null) {
  const coordinates = draft ? routeCoordinates(draft, points) : []
  if (draft && !draft.endPointId && hover && coordinates.length) coordinates.push(hover)
  return {
    type: 'FeatureCollection' as const,
    features: coordinates.length < 2 ? [] : [{
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coordinates.map(point => [point.longitude, point.latitude]) },
      properties: {},
    }],
  }
}

export function routeVertexCollection(draft: RouteDraft | null) {
  return {
    type: 'FeatureCollection' as const,
    features: draft?.waypoints.map((point, index) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: { index },
    })) ?? [],
  }
}

export function pointCollection(points: NetworkPoint[], selectedPointId: string | null, preview: Coordinates | null,
  splicePointIds: ReadonlySet<string> = new Set<string>()) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => {
      const location = point.id === selectedPointId && preview ? preview : point
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] },
        properties: { id: point.id, kind: point.kind, name: point.name, hasSplice: splicePointIds.has(point.id) },
      }
    }),
  }
}

function spliceClosureIcon() {
  const canvas = document.createElement('canvas')
  canvas.width = 80
  canvas.height = 48
  const context = canvas.getContext('2d')!
  context.scale(2, 2)
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(2, 12)
  context.lineTo(38, 12)
  context.strokeStyle = '#fff'
  context.lineWidth = 6
  context.stroke()
  context.strokeStyle = '#704b92'
  context.lineWidth = 3
  context.stroke()
  context.beginPath()
  context.roundRect(7, 2, 26, 20, 8)
  context.fillStyle = '#fff'
  context.fill()
  context.beginPath()
  context.roundRect(9, 4, 22, 16, 6)
  context.fillStyle = '#704b92'
  context.fill()
  context.beginPath()
  context.moveTo(16, 12)
  context.lineTo(24, 12)
  context.strokeStyle = '#fff'
  context.lineWidth = 2
  context.stroke()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export function initializeMapLayers(map: Map) {
  map.addImage('optical-splice-closure', spliceClosureIcon(), { pixelRatio: 2 })
  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: SELECTED_ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#183c35',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 12, 6, 15, 9, 18, 10], 'line-opacity': 0.95 } })
  map.addLayer({ id: HOVERED_ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#f0b344',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 12, 7, 15, 11, 18, 12], 'line-opacity': 0.9 } })
  map.addLayer({ id: ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
    paint: { 'line-color': ['match', ['get', 'installationStatus'],
      'cables', '#2d6f9f', 'ducts', '#26766b', 'unknown', '#74817d', '#b8613e'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 12, 3, 15, 5, 18, 6], 'line-opacity': 0.95 } })
  map.addSource(ROUTE_DRAFT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'underground-route-draft-line', type: 'line', source: ROUTE_DRAFT_SOURCE_ID,
    paint: { 'line-color': '#de8a39',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 12, 3, 15, 4, 18, 5], 'line-dasharray': [2, 1.5] } })
  map.addSource(ROUTE_VERTEX_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: ROUTE_VERTEX_LAYER_ID, type: 'circle', source: ROUTE_VERTEX_SOURCE_ID,
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#a4532d', 'circle-stroke-width': 2 } })
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
    id: HOVERED_POINT_LAYER_ID,
    type: 'circle',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 16,
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-stroke-color': '#f0b344',
      'circle-stroke-width': 4,
    },
  })
  // The closure is offset from its chamber so both physical entities remain visible.
  map.addLayer({ id: HOVERED_SPLICE_LAYER_ID, type: 'circle', source: POINT_SOURCE_ID,
    filter: ['all', ['==', ['get', 'hasSplice'], true], ['==', ['get', 'id'], '']],
    paint: { 'circle-radius': 19, 'circle-color': 'rgba(240, 179, 68, 0.24)',
      'circle-stroke-color': '#f0b344', 'circle-stroke-width': 3,
      'circle-translate': [15, -15], 'circle-translate-anchor': 'viewport' } })
  map.addLayer({ id: SPLICE_LAYER_ID, type: 'symbol', source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'hasSplice'], true],
    layout: { 'icon-image': 'optical-splice-closure', 'icon-offset': [15, -15],
      'icon-allow-overlap': true, 'icon-ignore-placement': true } })
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
  // Map backgrounds are inserted below the parcel layer; keep route geometry above both backgrounds.
  map.moveLayer(SELECTED_ROUTE_LAYER_ID, POINT_LAYER_ID)
  map.moveLayer(ROUTE_LAYER_ID, POINT_LAYER_ID)
  map.moveLayer(HOVERED_ROUTE_LAYER_ID, POINT_LAYER_ID)
  map.moveLayer('underground-route-draft-line', POINT_LAYER_ID)
  map.moveLayer(ROUTE_VERTEX_LAYER_ID, POINT_LAYER_ID)
}
