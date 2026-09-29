import type { InstalledItem, RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export type FiberEnd = { itemId: string; tubeIndex: number; fiberIndex: number }
export type FiberConnection = { id: string; left: FiberEnd; right: FiberEnd; kind: 'fusion' | 'connector' }
export type CableReserve = { itemId: string; lengthMeters: number }
export type OpticalSpliceDocument = {
  pointId: string; version: number; name: string; connections: FiberConnection[]; reserves: CableReserve[]
}

export function spliceIncidentCables(pointId: string, routes: UndergroundRoute[],
  documents: RouteInstallationDocument[]): InstalledItem[] {
  const routeIds = new Set(routes.filter(route => route.startPointId === pointId || route.endPointId === pointId)
    .map(route => route.id))
  return documents.filter(document => routeIds.has(document.routeId))
    .flatMap(document => document.items).filter(item => item.cable !== null)
}

export function spliceCableEnds(pointId: string, routes: UndergroundRoute[],
  documents: RouteInstallationDocument[]): InstalledItem[] {
  const cables = spliceIncidentCables(pointId, routes, documents)
  const runCounts = new Map<string, number>()
  for (const item of cables) runCounts.set(item.runId, (runCounts.get(item.runId) ?? 0) + 1)
  return cables.filter(item => runCounts.get(item.runId) === 1)
}

export const fiberEndKey = (end: FiberEnd) => `${end.itemId}:${end.tubeIndex}:${end.fiberIndex}`

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Spojku se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response
}

export async function loadOpticalSplice(pointId: string): Promise<OpticalSpliceDocument> {
  return (await expectOk(await fetch(`/api/optical-splices/${pointId}`))).json()
}

export async function listOpticalSplices(): Promise<OpticalSpliceDocument[]> {
  return (await expectOk(await fetch('/api/optical-splices'))).json()
}

export async function saveOpticalSplice(document: OpticalSpliceDocument): Promise<OpticalSpliceDocument> {
  return (await expectOk(await fetch(`/api/optical-splices/${document.pointId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  }))).json()
}

export async function deleteOpticalSplice(pointId: string): Promise<void> {
  await expectOk(await fetch(`/api/optical-splices/${pointId}`, { method: 'DELETE' }))
}
