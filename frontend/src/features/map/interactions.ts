export type MapClick =
  | { kind: 'point'; id: string }
  | { kind: 'location'; lookupParcel: boolean }

export function resolveMapClick(
  pointId: string | null,
  placementActive: boolean,
  cadastreAvailable: boolean,
  zoom: number,
  cadastreMinZoom: number,
): MapClick {
  if (!placementActive && pointId) return { kind: 'point', id: pointId }
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
