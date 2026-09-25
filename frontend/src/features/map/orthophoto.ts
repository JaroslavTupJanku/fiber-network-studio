import type { Map } from 'maplibre-gl'

export const ORTHOPHOTO_SOURCE_ID = 'cuzk-orthophoto'
export const ORTHOPHOTO_LAYER_ID = 'cuzk-orthophoto-base'

// ČÚZK publishes a Web Mercator tile pyramid compatible with MapLibre's XYZ tiles.
const ORTHOPHOTO_TILES = 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}'

export function addOrthophotoLayer(map: Map, beforeLayerId: string) {
  map.addSource(ORTHOPHOTO_SOURCE_ID, {
    type: 'raster',
    tiles: [ORTHOPHOTO_TILES],
    tileSize: 256,
    minzoom: 6,
    maxzoom: 20,
    bounds: [12.09, 48.55, 18.87, 51.06],
    attribution: '<a href="https://geoportal.cuzk.gov.cz/Default.aspx?metadataID=CZ-CUZK-WMTS-ORTOFOTO_900913&metadataXSL=metadata.sluzba&mode=TextMeta&side=wmts.uvod" target="_blank" rel="noopener noreferrer">© ČÚZK – Ortofoto ČR</a>',
  })
  map.addLayer({
    id: ORTHOPHOTO_LAYER_ID,
    type: 'raster',
    source: ORTHOPHOTO_SOURCE_ID,
  }, beforeLayerId)
}

export function removeOrthophotoLayer(map: Map) {
  if (map.getLayer(ORTHOPHOTO_LAYER_ID)) map.removeLayer(ORTHOPHOTO_LAYER_ID)
  if (map.getSource(ORTHOPHOTO_SOURCE_ID)) map.removeSource(ORTHOPHOTO_SOURCE_ID)
}
