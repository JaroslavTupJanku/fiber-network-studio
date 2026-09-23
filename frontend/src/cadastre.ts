import type { Map } from 'maplibre-gl'

export const CADASTRE_SOURCE_ID = 'cuzk-cadastre'
export const CADASTRE_LAYER_ID = 'cuzk-cadastre-overlay'
export const CADASTRE_MIN_ZOOM = 17

const CADASTRE_WMS = 'https://services.cuzk.gov.cz/wms/local-km-wms.asp'
const CADASTRE_TILES = `${CADASTRE_WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=KN&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256`

export function addCadastreLayer(map: Map) {
  map.addSource(CADASTRE_SOURCE_ID, {
    type: 'raster',
    tiles: [CADASTRE_TILES],
    tileSize: 256,
    minzoom: CADASTRE_MIN_ZOOM,
    maxzoom: 22,
    bounds: [12.09, 48.55, 18.87, 51.06],
    attribution: '<a href="https://wms.cuzk.gov.cz/" target="_blank" rel="noopener noreferrer">ČÚZK – on-line</a> · <a href="https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx" target="_blank" rel="noopener noreferrer">Podmínky</a>',
  })

  map.addLayer({
    id: CADASTRE_LAYER_ID,
    type: 'raster',
    source: CADASTRE_SOURCE_ID,
    paint: { 'raster-opacity': 0.82 },
  })
}

export function removeCadastreLayer(map: Map) {
  if (map.getLayer(CADASTRE_LAYER_ID)) map.removeLayer(CADASTRE_LAYER_ID)
  if (map.getSource(CADASTRE_SOURCE_ID)) map.removeSource(CADASTRE_SOURCE_ID)
}
