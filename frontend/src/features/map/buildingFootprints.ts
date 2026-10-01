import type { Coordinates, NetworkPoint } from './networkPoints'
import { routeCoordinates, type RouteDraft } from './undergroundRoutes.ts'

type Position = [number, number]
type Polygon = Position[][]
export type BuildingFootprint = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] }
  properties: { kod?: number }
}

export async function findBuildingFootprints(coordinates: Coordinates[], distanceMeters = 0): Promise<BuildingFootprint[]> {
  const response = await fetch('/api/building-footprints/intersecting-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates, distanceMeters }),
  })
  if (!response.ok) throw new Error('Půdorysy budov se nepodařilo ověřit. Zkuste kontrolu znovu.')
  const data: { features?: BuildingFootprint[] } = await response.json()
  if (!Array.isArray(data.features)) throw new Error('Půdorysy budov se nepodařilo ověřit. Zkuste kontrolu znovu.')
  return data.features.filter(feature => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
}

export function routeWithinFootprintCoverage(coordinates: Coordinates[], reference: Coordinates[], maxShiftMeters = 20): boolean {
  if (coordinates.length !== reference.length) return false
  return coordinates.every((point, index) => {
    const original = reference[index]
    const northMeters = (point.latitude - original.latitude) * 111_200
    const eastMeters = (point.longitude - original.longitude) * 111_200
      * Math.cos(((point.latitude + original.latitude) / 2) * Math.PI / 180)
    return Math.hypot(northMeters, eastMeters) <= maxShiftMeters
  })
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index]; const b = ring[previous]
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function pointInPolygon(point: Position, polygon: Polygon): boolean {
  return polygon.length > 0 && pointInRing(point, polygon[0])
    && !polygon.slice(1).some(hole => pointInRing(point, hole))
}

function cross(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function segmentsCross(a: Position, b: Position, c: Position, d: Position): boolean {
  const abC = cross(a, b, c); const abD = cross(a, b, d)
  const cdA = cross(c, d, a); const cdB = cross(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

function segmentThroughPolygon(a: Position, b: Position, polygon: Polygon): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true
  for (const ring of polygon) for (let index = 1; index < ring.length; index += 1) {
    if (segmentsCross(a, b, ring[index - 1], ring[index])) return true
  }
  return false
}

function polygons(feature: BuildingFootprint): Polygon[] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
}

export function crossingBuildingFootprints(route: RouteDraft, points: NetworkPoint[],
  footprints: BuildingFootprint[]): BuildingFootprint[] {
  const coordinates = routeCoordinates(route, points).map(point => [point.longitude, point.latitude] as Position)
  if (coordinates.length < 2) return []
  return footprints.filter(feature => polygons(feature).some(polygon => {
    // A deliberately placed network endpoint may sit inside a building. Only its
    // terminal leg is exempt; later legs through the same footprint still count.
    const startsInside = pointInPolygon(coordinates[0], polygon)
    const endsInside = pointInPolygon(coordinates.at(-1)!, polygon)
    return coordinates.slice(1).some((end, index) => {
      if (index === 0 && startsInside) return false
      if (index === coordinates.length - 2 && endsInside) return false
      return segmentThroughPolygon(coordinates[index], end, polygon)
    })
  }))
}
