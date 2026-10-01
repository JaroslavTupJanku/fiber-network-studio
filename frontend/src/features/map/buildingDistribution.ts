import type { FiberEnd } from './opticalSplices'
import type { IndoorCableRun } from './indoorCable'

export type BuildingRiser = { id: string; name: string; cableItemId: string | null }
export type FloorBox = { id: string; riserId: string; name: string; floor: number }
export type HomePremise = { id: string; boxId: string; label: string; status: 'planned' | 'connected';
  fiber: FiberEnd | null; indoorCable?: IndoorCableRun | null }
export const isConnectedPremise = (premise: HomePremise) => premise.status === 'connected' && premise.fiber !== null
export type BuildingDistributionDocument = { pointId: string; version: number; risers: BuildingRiser[];
  boxes: FloorBox[]; premises: HomePremise[] }

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Domovní rozvod se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response
}

export async function listBuildingDistribution(): Promise<BuildingDistributionDocument[]> {
  return (await expectOk(await fetch('/api/building-distribution'))).json()
}

export async function loadBuildingDistribution(pointId: string): Promise<BuildingDistributionDocument> {
  return (await expectOk(await fetch(`/api/building-distribution/${pointId}`))).json()
}

export async function saveBuildingDistribution(document: BuildingDistributionDocument): Promise<BuildingDistributionDocument> {
  return (await expectOk(await fetch(`/api/building-distribution/${document.pointId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document),
  }))).json()
}
