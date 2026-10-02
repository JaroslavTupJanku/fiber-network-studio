import type { BuildingEquipmentDocument } from './buildingEquipment'
import type { BuildingDistributionDocument } from './buildingDistribution'
import type { IndoorCableRun, IndoorLosses } from './indoorCable'
import type { OpticalSpliceDocument, SplitterOutput } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export type PathStep = { kind: 'cable' | 'indoor-cable' | 'splice' | 'connector' | 'patch' | 'splitter' | 'premise'; label: string;
  routeId?: string; itemId?: string; runId?: string; tubeIndex?: number; fiberIndex?: number;
  splitterId?: string; outputPosition?: number; source?: string;
  lengthMeters?: number | null; attenuationDbPerKm?: IndoorLosses | null; count?: number | null;
  losses?: Pick<SplitterOutput, 'loss1270Db' | 'loss1310Db' | 'loss1490Db' | 'loss1550Db' | 'loss1577Db'> }
export type BranchChoice = { splitterId: string; position: number; label: string }
export type OpticalPath = { status: 'connected' | 'open' | 'ambiguous'; endPortId: string | null;
  endPremiseId?: string | null;
  steps: PathStep[]; routeIds: string[]; message: string; branchChoices: BranchChoice[] }
type Edge = { to: string; step: PathStep; splitterFrom?: 'input' | 'output' }

export function traceOpticalPath(startPortId: string, equipment: BuildingEquipmentDocument[],
  routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  splices: OpticalSpliceDocument[], selectedOutputs: Record<string, number> = {},
  distributions: BuildingDistributionDocument[] = []): OpticalPath {
  return tracePath(`port:${startPortId}`, equipment, routes, installations, splices, selectedOutputs, distributions)
}

export function tracePremisePath(premiseId: string, equipment: BuildingEquipmentDocument[],
  routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  splices: OpticalSpliceDocument[], distributions: BuildingDistributionDocument[]): OpticalPath {
  const premise = distributions.flatMap(document => document.premises).find(item => item.id === premiseId)
  if (!premise || premise.status !== 'connected' || !premise.fiber) return {
    status: 'open', endPortId: null, endPremiseId: premiseId, steps: [], routeIds: [], branchChoices: [],
    message: 'Přípojné místo zatím nemá přiřazené vlákno.',
  }
  return tracePath(`premise:${premiseId}`, equipment, routes, installations, splices, {}, distributions)
}

export function tracePortToPremise(startPortId: string, premiseId: string,
  equipment: BuildingEquipmentDocument[], routes: UndergroundRoute[],
  installations: RouteInstallationDocument[], splices: OpticalSpliceDocument[],
  distributions: BuildingDistributionDocument[]): OpticalPath {
  const reverse = tracePremisePath(premiseId, equipment, routes, installations, splices, distributions)
  if (reverse.status !== 'connected' || reverse.endPortId !== startPortId) return {
    status: reverse.status === 'ambiguous' ? 'ambiguous' : 'open', endPortId: null, endPremiseId: premiseId,
    steps: [], routeIds: [], branchChoices: [],
    message: reverse.status === 'ambiguous' ? reverse.message
      : 'K vybranému přípojnému místu z tohoto OLT portu nevede úplná evidovaná cesta.',
  }
  return { ...reverse, endPortId: null, endPremiseId: premiseId, steps: [...reverse.steps].reverse(),
    routeIds: [...reverse.routeIds].reverse(),
    message: premiseMessage(premiseId, distributions) }
}

const stepLosses = (values: IndoorLosses) => ({
  loss1270Db: values.loss1270, loss1310Db: values.loss1310, loss1490Db: values.loss1490,
  loss1550Db: values.loss1550, loss1577Db: values.loss1577,
})

function premiseMessage(premiseId: string, distributions: BuildingDistributionDocument[]) {
  const indoor = distributions.flatMap(document => document.premises)
    .find(premise => premise.id === premiseId)?.indoorCable
  return indoor
    ? 'Cesta vede k přípojnému místu. Domovní přívod je evidován; úplnost délky a útlumů ověřte v kalkulačce.'
    : 'Cesta vede k přípojnému místu, ale domovní přívod a jeho útlum zatím nejsou evidovány.'
}

function indoorSteps(label: string, run?: IndoorCableRun | null): PathStep[] {
  const steps: PathStep[] = [
    { kind: 'premise', label: `Přípojné místo ${label}` },
    { kind: 'indoor-cable', label: run?.cableName ? `Domovní kabel · ${run.cableName}` : 'Domovní přívod k HP (neevidován)',
      source: run?.source ?? '', lengthMeters: run?.lengthMeters ?? null,
      attenuationDbPerKm: run?.attenuationDbPerKm ?? null },
  ]
  if (run?.spliceCount !== undefined && run.spliceCount !== 0) steps.push({
    kind: 'splice', label: run?.spliceCount === null ? 'Domovní svary · počet neznámý' : 'Domovní svary',
    count: run?.spliceCount ?? null, source: run?.source ?? '',
    losses: run ? stepLosses(run.spliceLossDb) : undefined,
  })
  if (run?.connectorPairCount !== undefined && run.connectorPairCount !== 0) steps.push({
    kind: 'connector', label: run?.connectorPairCount === null ? 'Domovní konektorové spoje · počet neznámý' : 'Domovní konektorové spoje',
    count: run?.connectorPairCount ?? null, source: run?.source ?? '',
    losses: run ? stepLosses(run.connectorLossDb) : undefined,
  })
  return steps
}

function tracePath(start: string, equipment: BuildingEquipmentDocument[],
  routes: UndergroundRoute[], installations: RouteInstallationDocument[],
  splices: OpticalSpliceDocument[], selectedOutputs: Record<string, number>,
  distributions: BuildingDistributionDocument[]): OpticalPath {
  const graph = new Map<string, Edge[]>()
  const ports = equipment.flatMap(document => document.ports)
  const portById = new Map(ports.map(port => [port.id, port]))
  const odfParentIds = new Set(equipment.flatMap(document => document.shelves
    .filter(shelf => shelf.kind === 'odf').map(shelf => shelf.id)))
  const oltParentIds = new Set(equipment.flatMap(document => [
    ...document.shelves.filter(shelf => shelf.kind === 'olt').map(shelf => shelf.id),
    ...(document.cards ?? []).filter(card => document.shelves.some(shelf => shelf.id === card.shelfId && shelf.kind === 'olt'))
      .map(card => card.id),
  ]))
  const oltPortIds = new Set(ports.filter(port => oltParentIds.has(port.parentId)).map(port => port.id))
  const portLabel = (portId: string) => {
    const port = portById.get(portId)!
    const kind = oltPortIds.has(portId) ? 'OLT' : 'ODF'
    return port.label.toUpperCase().startsWith(`${kind} `) ? port.label : `${kind} ${port.label}`
  }
  const addEdge = (from: string, edge: Edge) => graph.set(from, [...graph.get(from) ?? [], edge])
  const add = (left: string, right: string, step: PathStep) => {
    addEdge(left, { to: right, step })
    addEdge(right, { to: left, step })
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
          routeId: route.id, itemId: item.id, runId: item.runId, tubeIndex, fiberIndex })))
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
  for (const splice of splices) {
    for (const connection of splice.connections) {
      if (!byId.has(connection.left.itemId) || !byId.has(connection.right.itemId)) continue
      add(node(splice.pointId, connection.left.itemId, connection.left.tubeIndex, connection.left.fiberIndex),
        node(splice.pointId, connection.right.itemId, connection.right.tubeIndex, connection.right.fiberIndex),
        { kind: connection.kind === 'fusion' ? 'splice' : 'connector',
          label: connection.kind === 'fusion' ? `Svar v ${splice.name}` : `Konektor v ${splice.name}` })
    }
    for (const splitter of splice.splitters ?? []) {
      if (!splitter.input || !byId.has(splitter.input.itemId)) continue
      const input = node(splice.pointId, splitter.input.itemId,
        splitter.input.tubeIndex, splitter.input.fiberIndex)
      for (const output of splitter.outputs) {
        if (!byId.has(output.fiber.itemId)) continue
        const out = node(splice.pointId, output.fiber.itemId,
          output.fiber.tubeIndex, output.fiber.fiberIndex)
        const { loss1270Db, loss1310Db, loss1490Db, loss1550Db, loss1577Db } = output
        const step: PathStep = { kind: 'splitter', splitterId: splitter.id,
          outputPosition: output.position,
          label: `${splitter.name} · výstup ${output.position} (1:${splitter.outputCount})`,
          source: splitter.lossSource,
          losses: { loss1270Db, loss1310Db, loss1490Db, loss1550Db, loss1577Db } }
        addEdge(input, { to: out, step, splitterFrom: 'input' })
        addEdge(out, { to: input, step, splitterFrom: 'output' })
      }
    }
  }
  for (const document of equipment) for (const port of document.ports) {
    if (port.fiber && byId.has(port.fiber.itemId))
      add(`port:${port.id}`, node(document.pointId, port.fiber.itemId,
        port.fiber.tubeIndex, port.fiber.fiberIndex),
      { kind: 'connector', label: `Ukončení na ODF · ${port.label}` })
    if (port.patchPortId && port.id < port.patchPortId && portById.has(port.patchPortId)) {
      const first = oltPortIds.has(port.id) ? port.id : port.patchPortId
      const second = first === port.id ? port.patchPortId : port.id
      add(`port:${port.id}`, `port:${port.patchPortId}`,
        { kind: 'patch', label: `Propojka ${portLabel(first)} ↔ ${portLabel(second)}` })
    }
  }
  for (const document of distributions) for (const premise of document.premises) {
    if (premise.status !== 'connected' || !premise.fiber || !byId.has(premise.fiber.itemId)) continue
    const steps = indoorSteps(premise.label, premise.indoorCable)
    let previousNode = `premise:${premise.id}`
    steps.forEach((step, index) => {
      const nextNode = index === steps.length - 1
        ? node(document.pointId, premise.fiber!.itemId, premise.fiber!.tubeIndex, premise.fiber!.fiberIndex)
        : `indoor:${premise.id}:${index}`
      add(previousNode, nextNode, step)
      previousNode = nextNode
    })
  }
  const startPortId = start.startsWith('port:') ? start.slice(5) : null
  const startPremiseId = start.startsWith('premise:') ? start.slice(8) : null
  if (startPortId && !portById.has(startPortId)) return { status: 'open', endPortId: null, steps: [], routeIds: [],
    message: 'Vybraný port už neexistuje.', branchChoices: [] }
  if (startPremiseId && !graph.has(start)) return { status: 'open', endPortId: null,
    endPremiseId: startPremiseId, steps: [], routeIds: [], branchChoices: [],
    message: 'Přiřazené vlákno přípojného místa už není v evidenci kabelů.' }
  const steps: PathStep[] = []
  const branchChoices: BranchChoice[] = []
  const visited = new Set<string>([start])
  let previous: string | null = null
  let current = start
  let fromSplitterOutput: string | null = null
  while (true) {
    let candidates: Edge[] = (graph.get(current) ?? []).filter(edge => edge.to !== previous)
      .filter(edge => !fromSplitterOutput || edge.step.splitterId !== fromSplitterOutput
        || edge.splitterFrom !== 'input')
      .filter(edge => current !== start || !startPortId || !odfParentIds.has(portById.get(startPortId)!.parentId)
        || edge.step.kind !== 'patch' || !(graph.get(current) ?? []).some(item => item.step.kind === 'connector'))
    if (candidates.length > 1) {
      const splitterId = candidates[0].step.splitterId
      if (splitterId && candidates.every(edge => edge.step.splitterId === splitterId
        && edge.splitterFrom === 'input')) {
        branchChoices.push(...candidates.map(edge => ({ splitterId,
          position: edge.step.outputPosition!, label: edge.step.label })))
        const selected = candidates.find(edge => edge.step.outputPosition === selectedOutputs[splitterId])
        if (selected) candidates = [selected]
        else return result('ambiguous', null, 'Splitter má více výstupů. Vyberte větev, kterou chcete sledovat.')
      } else return result('ambiguous', null, 'Cesta má větvení. Zkontrolujte propojení.')
    }
    if (candidates.some(edge => visited.has(edge.to)))
      return result('ambiguous', null, 'Cesta tvoří smyčku. Zkontrolujte propojení.')
    if (candidates.length === 0) {
      const endPortId = current !== start && current.startsWith('port:') ? current.slice(5) : null
      const endPremiseId = current !== start && current.startsWith('premise:') ? current.slice(8) : null
      const connected = startPremiseId ? !!endPortId && oltPortIds.has(endPortId)
        : !!endPortId || !!endPremiseId
      return result(connected ? 'connected' : 'open', endPortId,
        connected ? endPremiseId ? premiseMessage(endPremiseId, distributions)
          : startPremiseId ? premiseMessage(startPremiseId, distributions)
            : 'Cesta končí na dalším portu.'
          : endPortId ? 'Cesta končí na portu bez pokračování k OLT.' : 'Cesta končí volným vláknem nebo portem.',
        endPremiseId ?? startPremiseId)
    }
    const next: Edge = candidates[0]
    steps.push(next.step)
    previous = current
    current = next.to
    fromSplitterOutput = next.splitterFrom === 'output' ? next.step.splitterId ?? null : null
    visited.add(current)
  }
  function result(status: OpticalPath['status'], endPortId: string | null, message: string,
    endPremiseId: string | null = startPremiseId): OpticalPath {
    return { status, endPortId, endPremiseId, steps, routeIds: [...new Set(steps.map(step => step.routeId).filter((id): id is string => !!id))],
      message, branchChoices }
  }
}
