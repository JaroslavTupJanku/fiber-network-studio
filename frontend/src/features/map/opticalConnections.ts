import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import type { RouteInstallationDocument } from './routeInstallations'
import type { BuildingEquipmentDocument } from './buildingEquipment'
import type { BuildingDistributionDocument } from './buildingDistribution'
import type { FiberEnd, OpticalSpliceDocument } from './opticalSplices'
import { allocatedFiberKey, type FiberAllocationDocument } from './fiberAllocations.ts'

export type ConnectionEnd = { label: string; tube?: number; fiber?: number; color?: string; allocation?: string; incomplete?: boolean }
export type OpticalConnection = { id: string; pointId: string; point: string; kind: string; left: ConnectionEnd | null; right: ConnectionEnd | null }

export function opticalConnections(points: NetworkPoint[], routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  equipment: BuildingEquipmentDocument[], splices: OpticalSpliceDocument[], distributions: BuildingDistributionDocument[],
  allocations: FiberAllocationDocument): OpticalConnection[] {
  const names = new Map(points.map(p => [p.id, p.name]))
  const routeNames = new Map(routes.map(r => [r.id, r.name]))
  const cables = new Map(installations.flatMap(d => d.items.filter(i => i.cable).map(i => [i.id, i] as const)))
  const assigned = new Map(allocations.allocations.flatMap(a => a.fibers.map(f =>
    [allocatedFiberKey(f), `${a.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${a.label}`] as const)))
  const end = (f: FiberEnd | null): ConnectionEnd | null => {
    if (!f) return null
    const item = cables.get(f.itemId), fiber = item?.cable?.tubes[f.tubeIndex]?.fibers[f.fiberIndex]
    return { label: item ? `${item.label} · ${routeNames.get(item.routeId) ?? 'Neznámá trasa'}` : `Neznámý kabel (${f.itemId})`,
      tube: f.tubeIndex + 1, fiber: f.fiberIndex + 1, color: fiber?.transparent ? undefined : fiber?.color, incomplete: !fiber,
      allocation: item ? assigned.get(allocatedFiberKey({ runId: item.runId, tubeIndex: f.tubeIndex, fiberIndex: f.fiberIndex })) : undefined }
  }
  const rows: OpticalConnection[] = []
  const add = (id: string, pointId: string, kind: string, left: ConnectionEnd | null, right: ConnectionEnd | null) =>
    rows.push({ id, pointId, point: names.get(pointId) ?? `Neznámý bod (${pointId})`, kind, left, right })
  for (const splice of splices) {
    for (const c of splice.connections) add(`splice:${splice.pointId}:${c.id}`, splice.pointId, c.kind === 'fusion' ? 'Svar' : 'Konektor', end(c.left), end(c.right))
    for (const s of splice.splitters) {
      add(`split:${s.id}:in`, splice.pointId, 'Vstup splitteru', end(s.input), { label: `${s.name} · vstup (1:${s.outputCount})` })
      for (let position = 1; position <= s.outputCount; position++) add(`split:${s.id}:${position}`, splice.pointId,
        'Výstup splitteru', { label: `${s.name} · výstup ${position}` }, end(s.outputs.find(o => o.position === position)?.fiber ?? null))
    }
  }
  for (const doc of equipment) {
    const portEnd = (id: string): ConnectionEnd => {
      const port = doc.ports.find(p => p.id === id)
      const card = doc.cards.find(c => c.id === port?.parentId)
      const shelf = doc.shelves.find(s => s.id === (card?.shelfId ?? port?.parentId))
      const rack = doc.racks.find(r => r.id === shelf?.rackId)
      return { label: port ? [rack?.name, shelf?.name, card?.name, `Port ${port.label}`].filter(Boolean).join(' / ') : `Neznámý port (${id})`, incomplete: !port }
    }
    const patches = new Set<string>()
    for (const port of doc.ports) {
      if (port.fiber) add(`odf:${port.id}`, doc.pointId, 'Ukončení ODF', end(port.fiber), portEnd(port.id))
      if (port.patchPortId) {
        const key = [port.id, port.patchPortId].sort().join(':')
        if (!patches.has(key)) { patches.add(key); add(`patch:${key}`, doc.pointId, 'Propojka', portEnd(port.id), portEnd(port.patchPortId)) }
      }
    }
  }
  for (const doc of distributions) for (const hp of doc.premises) {
    const box = doc.boxes.find(b => b.id === hp.boxId), riser = doc.risers.find(r => r.id === box?.riserId)
    add(`hp:${hp.id}`, doc.pointId, hp.status === 'connected' && hp.fiber ? 'Přípojné místo' : 'Plánované přípojné místo',
      hp.status === 'connected' ? end(hp.fiber) : null, { label: [riser?.name, box ? `${box.name} · patro ${box.floor}` : null, hp.label].filter(Boolean).join(' / ') })
  }
  // Adjacent sections of the same physical run are continuous without a fictitious splice.
  for (const point of points) {
    const runs = new Map<string, typeof installations[number]['items']>()
    for (const route of routes.filter(r => r.startPointId === point.id || r.endPointId === point.id))
      for (const item of installations.find(d => d.routeId === route.id)?.items ?? []) if (item.cable) runs.set(item.runId, [...(runs.get(item.runId) ?? []), item])
    for (const [runId, items] of runs) if (items.length === 2) items[0].cable?.tubes.forEach((tube, ti) => tube.fibers.forEach((_, fi) => {
      if (items[1].cable?.tubes[ti]?.fibers[fi]) add(`run:${point.id}:${runId}:${ti}:${fi}`, point.id, 'Průchozí kabel',
        end({ itemId: items[0].id, tubeIndex: ti, fiberIndex: fi }), end({ itemId: items[1].id, tubeIndex: ti, fiberIndex: fi }))
    }))
  }
  return rows.sort((a, b) => a.point.localeCompare(b.point, 'cs') || a.kind.localeCompare(b.kind, 'cs') || a.id.localeCompare(b.id))
}

export function connectionExportRows(connections: OpticalConnection[]) {
  return connections.map(c => ({ 'Uzel': c.point, 'Typ': c.kind, 'Stav': c.left?.incomplete || c.right?.incomplete ? 'Neúplné údaje' : c.left && c.right ? 'Propojeno' : 'Nezapojeno',
    'Od': c.left?.label ?? null, 'Tuba od': c.left?.tube ?? null, 'Vlákno od': c.left?.fiber ?? null,
    'Barva od': c.left?.color ?? null, 'Služba / rezervace od': c.left?.allocation ?? null,
    'Do': c.right?.label ?? null, 'Tuba do': c.right?.tube ?? null, 'Vlákno do': c.right?.fiber ?? null,
    'Barva do': c.right?.color ?? null, 'Služba / rezervace do': c.right?.allocation ?? null }))
}

export function connectionPreviewRows(connections: OpticalConnection[]) {
  const describe = (end: ConnectionEnd | null) => end ? `${end.label}${end.fiber !== undefined ? ` · tuba ${end.tube} / vlákno ${end.fiber}` : ''}${end.incomplete ? ' · údaje nenalezeny' : ''}` : 'Nezapojeno'
  return connections.map(c => ({ 'Uzel': c.point, 'Spojení': c.kind,
    'Od': describe(c.left), 'Do': describe(c.right),
    'Služba / rezervace': [...new Set([c.left?.allocation, c.right?.allocation].filter(Boolean))].join(' · ') || 'Bez evidence' }))
}
