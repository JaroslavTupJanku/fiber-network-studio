export type MapClick =
  | { kind: 'point'; id: string }
  | { kind: 'location'; lookupParcel: boolean }

export type MapCursorState = {
  draggingTool: boolean
  draggingMap: boolean
  draggingPoint: boolean
  placing: boolean
  overPoint: boolean
  overParcel: boolean
}

export function mapCursor(state: MapCursorState): 'copy' | 'grab' | 'grabbing' | 'crosshair' | 'pointer' {
  if (state.draggingTool) return 'copy'
  if (state.draggingMap || state.draggingPoint) return 'grabbing'
  if (state.placing) return 'crosshair'
  if (state.overPoint) return 'grab'
  if (state.overParcel) return 'pointer'
  return 'grab'
}

export function resolveMapClick(
  pointId: string | null,
  placementActive: boolean,
  cadastreAvailable: boolean,
  zoom: number,
  cadastreMinZoom: number,
): MapClick {
  if (pointId) return { kind: 'point', id: pointId }
  return {
    kind: 'location',
    lookupParcel: !placementActive && cadastreAvailable && zoom >= cadastreMinZoom,
  }
}

export function crossedDragThreshold(
  startX: number, startY: number, currentX: number, currentY: number, threshold: number,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold
}
