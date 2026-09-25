import type { Map } from 'maplibre-gl'
import type { Coordinates, NetworkPoint } from './networkPoints'
import { routeCoordinates, type RouteDraft, type UndergroundRoute } from './undergroundRoutes'

export const POINT_SOURCE_ID = 'network-points'
export const POINT_LAYER_ID = 'network-point-dots'
export const SELECTED_LAYER_ID = 'network-point-selected'
export const PARCEL_SOURCE_ID = 'selected-parcel'
export const PARCEL_FILL_LAYER_ID = 'selected-parcel-fill'
export const ROUTE_SOURCE_ID = 'underground-routes'
export const ROUTE_LAYER_ID = 'underground-route-lines'
export const SELECTED_ROUTE_LAYER_ID = 'underground-route-selected'
export const ROUTE_DRAFT_SOURCE_ID = 'underground-route-draft'
export const ROUTE_VERTEX_SOURCE_ID = 'underground-route-vertices'
export const ROUTE_VERTEX_LAYER_ID = 'underground-route-vertex-dots'

export function routeCollection(routes: UndergroundRoute[], points: NetworkPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: routes.flatMap(route => {
      const coordinates = routeCoordinates(route, points)
      return coordinates.length < 2 ? [] : [{
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coordinates.map(point => [point.longitude, point.latitude]) },
        properties: { id: route.id, name: route.name },
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

export function pointCollection(points: NetworkPoint[], selectedPointId: string | null, preview: Coordinates | null) {
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

export function initializeMapLayers(map: Map) {
  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: SELECTED_ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.95 } })
  map.addLayer({ id: ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
    paint: { 'line-color': '#b8613e', 'line-width': 4, 'line-opacity': 0.9 } })
  map.addSource(ROUTE_DRAFT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'underground-route-draft-line', type: 'line', source: ROUTE_DRAFT_SOURCE_ID,
    paint: { 'line-color': '#de8a39', 'line-width': 4, 'line-dasharray': [2, 1.5] } })
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
  map.moveLayer('underground-route-draft-line', POINT_LAYER_ID)
  map.moveLayer(ROUTE_VERTEX_LAYER_ID, POINT_LAYER_ID)
}
