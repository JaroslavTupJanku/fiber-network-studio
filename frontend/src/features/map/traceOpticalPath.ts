import type { BuildingEquipmentDocument } from './buildingEquipment'
import type { OpticalSpliceDocument } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export type PathStep = { kind: 'cable' | 'splice' | 'connector' | 'patch'; label: string;
  routeId?: string; itemId?: string }
export type OpticalPath = { status: 'connected' | 'open' | 'ambiguous'; endPortId: string | null;
  steps: PathStep[]; routeIds: string[]; message: string }
type Edge = { to: string; step: PathStep }

export function traceOpticalPath(startPortId: string, equipment: BuildingEquipmentDocument[],
  routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  splices: OpticalSpliceDocument[]): OpticalPath {
  const graph = new Map<string, Edge[]>()
  const ports = equipment.flatMap(document => document.ports)
  const portById = new Map(ports.map(port => [port.id, port]))
  const odfParentIds = new Set(equipment.flatMap(document => document.shelves
    .filter(shelf => shelf.kind === 'odf').map(shelf => shelf.id)))
  const terminal = new Set(ports.map(port => `port:${port.id}`))
  const add = (left: string, right: string, step: PathStep) => {
    graph.set(left, [...graph.get(left) ?? [], { to: right, step }])
    graph.set(right, [...graph.get(right) ?? [], { to: left, step }])
  }
  const node = (pointId: string, itemId: string, tubeIndex: number, fiberIndex: number) =>
    `fiber:${pointId}:${itemId}:${tubeIndex}:${fiberIndex}`
  const items = installations.flatMap(document => document.items).filter(item => item.cable !== null)
  const byId = new Map(items.map(item => [item.id, item]))
  for (const item of items) {
    const route = routes.find(route => route.id === item.routeId)
    if (!route || !item.cable) continue
    item.cable.tubes.forEach((tube, tubeIndex) => tube.fibers.forEach((_, fiberIndex) =>
      add(node(route.startPointId, item.id, tubeIndex, fiberIndex),
        node(route.endPointId, item.id, tubeIndex, fiberIndex),
        { kind: 'cable', label: `${route.name} · ${item.label} · ${tube.name} / ${fiberIndex + 1}`,
          routeId: route.id, itemId: item.id })))
  }
  const byRun = new Map<string, typeof items>()
  for (const item of items) byRun.set(item.runId, [...byRun.get(item.runId) ?? [], item])
  for (const runItems of byRun.values()) for (let index = 0; index < runItems.length; index += 1) {
    for (const other of runItems.slice(index + 1)) {
      const first = routes.find(route => route.id === runItems[index].routeId)
      const second = routes.find(route => route.id === other.routeId)
      if (!first || !second) continue
      const shared = [first.startPointId, first.endPointId].find(pointId =>
        pointId === second.startPointId || pointId === second.endPointId)
      if (!shared) continue
      runItems[index].cable?.tubes.forEach((tube, tubeIndex) => tube.fibers.forEach((_, fiberIndex) =>
        add(node(shared, runItems[index].id, tubeIndex, fiberIndex),
          node(shared, other.id, tubeIndex, fiberIndex), { kind: 'cable', label: 'Průběžný kabel' })))
    }
  }
  for (const splice of splices) for (const connection of splice.connections) {
    if (!byId.has(connection.left.itemId) || !byId.has(connection.right.itemId)) continue
    add(node(splice.pointId, connection.left.itemId, connection.left.tubeIndex, connection.left.fiberIndex),
      node(splice.pointId, connection.right.itemId, connection.right.tubeIndex, connection.right.fiberIndex),
      { kind: connection.kind === 'fusion' ? 'splice' : 'connector',
        label: connection.kind === 'fusion' ? `Svar v ${splice.name}` : `Konektor v ${splice.name}` })
  }
  for (const document of equipment) for (const port of document.ports) {
    if (port.fiber && byId.has(port.fiber.itemId))
      add(`port:${port.id}`, node(document.pointId, port.fiber.itemId,
        port.fiber.tubeIndex, port.fiber.fiberIndex),
      { kind: 'connector', label: `Ukončení na ODF · ${port.label}` })
    if (port.patchPortId && port.id < port.patchPortId && portById.has(port.patchPortId))
      add(`port:${port.id}`, `port:${port.patchPortId}`,
        { kind: 'patch', label: `Propojka ${port.label} ↔ ${portById.get(port.patchPortId)!.label}` })
  }
  const start = `port:${startPortId}`
  if (!portById.has(startPortId)) return { status: 'open', endPortId: null, steps: [], routeIds: [],
    message: 'Vybraný port už neexistuje.' }
  const steps: PathStep[] = []
  const visited = new Set<string>([start])
  let previous: string | null = null
  let current = start
  while (true) {
    const candidates: Edge[] = (graph.get(current) ?? []).filter(edge => edge.to !== previous)
      .filter(edge => current !== start || !odfParentIds.has(portById.get(startPortId)!.parentId)
        || edge.step.kind !== 'patch' || !(graph.get(current) ?? []).some(item => item.step.kind === 'connector'))
    if (candidates.length > 1 || candidates.some(edge => visited.has(edge.to)))
      return result('ambiguous', null, 'Cesta má větvení nebo smyčku. Zkontrolujte propojení.')
    if (candidates.length === 0) {
      const endPortId = current !== start && terminal.has(current) ? current.slice(5) : null
      return result(endPortId ? 'connected' : 'open', endPortId,
        endPortId ? 'Cesta končí na dalším portu.' : 'Cesta končí volným vláknem nebo portem.')
    }
    const next: Edge = candidates[0]
    steps.push(next.step)
    previous = current
    current = next.to
    visited.add(current)
  }
  function result(status: OpticalPath['status'], endPortId: string | null, message: string): OpticalPath {
    return { status, endPortId, steps, routeIds: [...new Set(steps.map(step => step.routeId).filter((id): id is string => !!id))], message }
  }
}
