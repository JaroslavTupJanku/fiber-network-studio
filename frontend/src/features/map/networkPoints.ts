export type NetworkPointKind = 'building' | 'chamber'

export type Coordinates = {
  latitude: number
  longitude: number
}

export type NetworkPoint = Coordinates & {
  id: string
  kind: NetworkPointKind
  name: string
}

export type NetworkPointInput = Coordinates & {
  kind: NetworkPointKind
  name: string
}

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Objekt se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response
}

export async function listNetworkPoints(signal?: AbortSignal): Promise<NetworkPoint[]> {
  return (await expectOk(await fetch('/api/network-points', { signal }))).json()
}

export async function createNetworkPoint(input: NetworkPointInput): Promise<NetworkPoint> {
  return (await expectOk(await fetch('/api/network-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))).json()
}

export async function updateNetworkPoint(point: NetworkPoint): Promise<NetworkPoint> {
  return (await expectOk(await fetch(`/api/network-points/${point.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: point.name, latitude: point.latitude, longitude: point.longitude }),
  }))).json()
}

export async function deleteNetworkPoint(id: string): Promise<void> {
  await expectOk(await fetch(`/api/network-points/${id}`, { method: 'DELETE' }))
}
