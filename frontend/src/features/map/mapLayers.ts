import type { Map } from 'maplibre-gl'
import type { Coordinates, NetworkPoint } from './networkPoints'

export const POINT_SOURCE_ID = 'network-points'
export const POINT_LAYER_ID = 'network-point-dots'
export const SELECTED_LAYER_ID = 'network-point-selected'
export const PARCEL_SOURCE_ID = 'selected-parcel'
export const PARCEL_FILL_LAYER_ID = 'selected-parcel-fill'

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
}
