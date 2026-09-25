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

export function undoRouteStep(draft: RouteDraft): RouteDraft {
  if (draft.endPointId) return { ...draft, endPointId: null }
  if (draft.waypoints.length) return { ...draft, waypoints: draft.waypoints.slice(0, -1) }
  return { ...draft, startPointId: null }
}

async function expectOk(response: Response) {
  if (!response.ok) throw new Error(`Route API returned ${response.status}`)
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
