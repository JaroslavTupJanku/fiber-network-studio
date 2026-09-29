import type { FiberEnd } from './opticalSplices'

export type EquipmentRack = { id: string; name: string }
export type EquipmentShelf = { id: string; rackId: string; kind: 'odf' | 'olt'; name: string }
export type EquipmentCard = { id: string; shelfId: string; name: string }
export type EquipmentPort = { id: string; parentId: string; position: number; label: string;
  fiber: FiberEnd | null; patchPortId: string | null }
export type BuildingEquipmentDocument = { pointId: string; version: number; racks: EquipmentRack[];
  shelves: EquipmentShelf[]; cards: EquipmentCard[]; ports: EquipmentPort[] }

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Vybavení se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response
}

export async function loadBuildingEquipment(pointId: string): Promise<BuildingEquipmentDocument> {
  return (await expectOk(await fetch(`/api/building-equipment/${pointId}`))).json()
}

export async function listBuildingEquipment(): Promise<BuildingEquipmentDocument[]> {
  return (await expectOk(await fetch('/api/building-equipment'))).json()
}

export async function saveBuildingEquipment(document: BuildingEquipmentDocument): Promise<BuildingEquipmentDocument> {
  return (await expectOk(await fetch(`/api/building-equipment/${document.pointId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document),
  }))).json()
}
