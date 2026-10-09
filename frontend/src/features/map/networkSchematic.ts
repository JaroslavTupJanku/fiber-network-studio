import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import type { RouteInstallationDocument } from './routeInstallations'
import type { BuildingEquipmentDocument } from './buildingEquipment'
import type { BuildingDistributionDocument } from './buildingDistribution'
import type { OpticalSpliceDocument } from './opticalSplices'
import { buildOpticalGraph } from './traceOpticalPath.ts'

export type SchemeNode = { id: string; label: string; detail: string; pointId?: string; routeId?: string }
export type SchemeEdge = { id: string; from: string; to: string; label: string; routeId?: string; kind?: string }
export type Scheme = { nodes: SchemeNode[]; edges: SchemeEdge[] }

export function physicalScheme(points: NetworkPoint[], routes: UndergroundRoute[], installations: RouteInstallationDocument[]): Scheme {
  return { nodes: points.map(point => ({ id: point.id, label: point.name, pointId: point.id,
    detail: point.kind === 'cabinet' ? 'Optická skříň' : point.kind === 'pole' ? 'Sloup' : point.kind === 'chamber' ? 'Šachta' : 'Budova' })),
  edges: routes.map(route => ({ id: route.id, from: route.startPointId, to: route.endPointId, routeId: route.id,
    label: `${route.name} · ${installations.find(item => item.routeId === route.id)?.items.filter(item => item.cable).length ?? 0} kabelů` })) }
}

// Keep optical fiber nodes separate even when their cables share a trench or a point.
export function opticalScheme(points: NetworkPoint[], routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  equipment: BuildingEquipmentDocument[], splices: OpticalSpliceDocument[], distributions: BuildingDistributionDocument[]): Scheme {
  const { graph, oltPortIds } = buildOpticalGraph(equipment, routes, installations, splices, distributions)
  const names = new Map(points.map(point => [point.id, point.name]))
  const cables = new Map(installations.flatMap(doc => doc.items.map(item => [item.id, item] as const)))
  const nodes = [...graph.keys()].map(id => {
    const parts = id.split(':')
    if (parts[0] === 'fiber') {
      const cable = cables.get(parts[2])
      const tube = cable?.cable?.tubes[Number(parts[3])]
      return { id, pointId: parts[1], label: names.get(parts[1]) ?? 'Bod sítě',
        detail: `${tube?.name ?? 'Tuba'} · vlákno ${Number(parts[4]) + 1} · ${cable?.label ?? 'Kabel'}` }
    }
    const doc = parts[0] === 'port' ? equipment.find(doc => doc.ports.some(port => port.id === parts[1])) : undefined
    const port = doc?.ports.find(port => port.id === parts[1])
    const home = distributions.find(doc => doc.premises.some(premise => premise.id === parts[1]))
    const pointId = doc?.pointId ?? home?.pointId
    return { id, pointId, label: pointId ? names.get(pointId) ?? 'Bod sítě' : 'Domovní rozvod',
      detail: port ? `${oltPortIds.has(port.id) ? 'OLT' : 'ODF'} · ${port.label}`
        : home ? `Přípojka · ${home.premises.find(premise => premise.id === parts[1])?.label}` : 'Domovní propojení' }
  })
  const edges: SchemeEdge[] = []
  const seen = new Set<string>()
  for (const [from, links] of graph) for (const edge of links) {
    const id = [from, edge.to].sort().join('|')
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ id, from, to: edge.to, label: edge.step.label, routeId: edge.step.routeId, kind: edge.step.kind })
  }
  // Include isolated prepared ports and premises too; absence of edges is meaningful.
  for (const doc of equipment) for (const port of doc.ports) if (!graph.has(`port:${port.id}`))
    nodes.push({ id: `port:${port.id}`, pointId: doc.pointId, label: names.get(doc.pointId) ?? 'Bod sítě', detail: `${port.label} · bez propojení` })
  for (const doc of distributions) for (const premise of doc.premises) if (!graph.has(`premise:${premise.id}`))
    nodes.push({ id: `premise:${premise.id}`, pointId: doc.pointId, label: names.get(doc.pointId) ?? 'Budova', detail: `${premise.label} · bez propojení` })
  nodes.sort((a, b) => Number(oltPortIds.has(b.id.slice(5))) - Number(oltPortIds.has(a.id.slice(5))))
  return { nodes, edges }
}

export function schemeComponents(scheme: Scheme): string[][] {
  const adjacency = new Map(scheme.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of scheme.edges) { adjacency.get(edge.from)?.push(edge.to); adjacency.get(edge.to)?.push(edge.from) }
  const visited = new Set<string>(), components: string[][] = []
  for (const node of scheme.nodes) {
    if (visited.has(node.id)) continue
    const component = [node.id]; visited.add(node.id)
    for (let index = 0; index < component.length; index++) for (const next of adjacency.get(component[index]) ?? [])
      if (!visited.has(next)) { visited.add(next); component.push(next) }
    components.push(component)
  }
  return components
}

export function layoutScheme(scheme: Scheme) {
  const positions = new Map<string, { x: number; y: number }>()
  let offset = 30, maxColumn = 0
  const adjacency = new Map(scheme.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of scheme.edges) { adjacency.get(edge.from)?.push(edge.to); adjacency.get(edge.to)?.push(edge.from) }
  for (const component of schemeComponents(scheme)) {
    const depths = new Map([[component[0], 0]]), queue = [component[0]], rows = new Map<number, number>()
    for (let index = 0; index < queue.length; index++) for (const next of adjacency.get(queue[index]) ?? [])
      if (!depths.has(next)) { depths.set(next, depths.get(queue[index])! + 1); queue.push(next) }
    for (const depth of depths.values()) rows.set(depth, (rows.get(depth) ?? 0) + 1)
    const bandHeights = new Map<number, number>()
    for (const [depth, count] of rows) bandHeights.set(Math.floor(depth / 3), Math.max(bandHeights.get(Math.floor(depth / 3)) ?? 0, count * 155))
    const bandOffsets = new Map<number, number>()
    let height = 0
    for (const [band, bandHeight] of [...bandHeights].sort(([a], [b]) => a - b)) { bandOffsets.set(band, height); height += bandHeight }
    rows.clear()
    for (const id of component) {
      const depth = depths.get(id) ?? 0, row = rows.get(depth) ?? 0
      const column = Math.floor(depth / 3) % 2 ? 2 - depth % 3 : depth % 3
      positions.set(id, { x: 30 + column * 350, y: offset + (bandOffsets.get(Math.floor(depth / 3)) ?? 0) + row * 155 })
      rows.set(depth, row + 1); maxColumn = Math.max(maxColumn, column)
    }
    offset += height + 40
  }
  return { positions, width: 310 + maxColumn * 350, height: offset + 20 }
}
