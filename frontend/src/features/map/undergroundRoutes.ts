import type { Coordinates, NetworkPoint } from './networkPoints'

export type UndergroundRouteInput = {
  name: string
  startPointId: string | null
  endPointId: string | null
  waypoints: Coordinates[]
}

export type UndergroundRoute = Omit<UndergroundRouteInput, 'startPointId' | 'endPointId'> & {
  id: string
  startPointId: string
  endPointId: string
}

export type RouteDraft = UndergroundRouteInput & { id?: string }

export function routeCoordinates(route: UndergroundRouteInput, points: NetworkPoint[]): Coordinates[] {
  const start = points.find(point => point.id === route.startPointId)
  const end = points.find(point => point.id === route.endPointId)
  if (!start || (route.endPointId && !end)) return []
  return end ? [start, ...route.waypoints, end] : [start, ...route.waypoints]
}

export function routeLengthMeters(coordinates: Coordinates[]): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  let length = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1]
    const b = coordinates[index]
    const latitudeDelta = radians(b.latitude - a.latitude)
    const longitudeDelta = radians(b.longitude - a.longitude)
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
      * Math.sin(longitudeDelta / 2) ** 2
    length += 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(haversine)))
  }
  return length
}

export function routeSegmentHit(points: { x: number; y: number }[], target: { x: number; y: number },
  tolerance: number): { index: number; x: number; y: number } | null {
  if (points.length < 2) return null
  let closest = 0
  let distance = Infinity
  let nearestX = 0
  let nearestY = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const fraction = dx || dy
      ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / (dx * dx + dy * dy)))
      : 0
    const squared = (target.x - start.x - fraction * dx) ** 2 + (target.y - start.y - fraction * dy) ** 2
    if (squared < distance) {
      distance = squared; closest = index
      nearestX = start.x + fraction * dx
      nearestY = start.y + fraction * dy
    }
  }
  return distance <= tolerance * tolerance ? { index: closest, x: nearestX, y: nearestY } : null
}

export function routeGeometryHit(points: { x: number; y: number }[], target: { x: number; y: number },
  tolerance: number, openEnd = false): { kind: 'vertex'; index: number } | { kind: 'segment'; index: number; x: number; y: number } | null {
  const vertexIndex = points.slice(1, openEnd ? undefined : -1).findIndex(item =>
    Math.hypot(item.x - target.x, item.y - target.y) <= tolerance)
  if (vertexIndex >= 0) return { kind: 'vertex', index: vertexIndex }
  const segment = routeSegmentHit(points, target, tolerance)
  return segment ? { kind: 'segment', ...segment } : null
}

export function closestRouteSegment(points: { x: number; y: number }[], target: { x: number; y: number }): number {
  return routeSegmentHit(points, target, Infinity)?.index ?? 0
}

// Deform the mapped line smoothly when one of its endpoint objects is moved.
// Existing waypoints keep their order and count; points nearer the moved end travel farther.
export function waypointsAfterPointMove(route: UndergroundRouteInput, points: NetworkPoint[],
  pointId: string, next: Coordinates): Coordinates[] {
  if (route.startPointId !== pointId && route.endPointId !== pointId) return route.waypoints
  const coordinates = routeCoordinates(route, points)
  if (coordinates.length !== route.waypoints.length + 2) return route.waypoints
  const distances = coordinates.slice(1).map((coordinate, index) =>
    routeLengthMeters([coordinates[index], coordinate]))
  const total = distances.reduce((sum, distance) => sum + distance, 0)
  const original = route.startPointId === pointId ? coordinates[0] : coordinates.at(-1)!
  const latitudeDelta = next.latitude - original.latitude
  const longitudeDelta = next.longitude - original.longitude
  let walked = 0
  return route.waypoints.map((waypoint, index) => {
    walked += distances[index]
    const fraction = total > 0 ? walked / total : (index + 1) / (route.waypoints.length + 1)
    const weight = route.startPointId === pointId ? 1 - fraction : fraction
    return { latitude: waypoint.latitude + latitudeDelta * weight,
      longitude: waypoint.longitude + longitudeDelta * weight }
  })
}

export function undoRouteStep(draft: RouteDraft, insertedWaypointIndex?: number): RouteDraft {
  if (insertedWaypointIndex !== undefined && draft.waypoints[insertedWaypointIndex])
    return { ...draft, waypoints: draft.waypoints.filter((_, index) => index !== insertedWaypointIndex) }
  if (draft.endPointId) return { ...draft, endPointId: null }
  if (draft.waypoints.length) return { ...draft, waypoints: draft.waypoints.slice(0, -1) }
  return { ...draft, startPointId: null }
}

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Route API returned ${response.status}`)
  }
  return response
}

export async function listUndergroundRoutes(signal?: AbortSignal): Promise<UndergroundRoute[]> {
  return (await expectOk(await fetch('/api/underground-routes', { signal }))).json()
}

export async function saveUndergroundRoute(route: RouteDraft): Promise<UndergroundRoute> {
  const path = route.id ? `/api/underground-routes/${route.id}` : '/api/underground-routes'
  return (await expectOk(await fetch(path, {
    method: route.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: route.name.trim(), startPointId: route.startPointId,
      endPointId: route.endPointId, waypoints: route.waypoints }),
  }))).json()
}

export async function deleteUndergroundRoute(id: string): Promise<void> {
  await expectOk(await fetch(`/api/underground-routes/${id}`, { method: 'DELETE' }))
}
