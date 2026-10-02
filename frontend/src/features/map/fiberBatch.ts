import type { InstalledItem } from './routeInstallations'
import type { EquipmentPort } from './buildingEquipment'
import type { FiberConnection, FiberEnd } from './opticalSplices'

const fiberEndKey = (end: FiberEnd) => `${end.itemId}:${end.tubeIndex}:${end.fiberIndex}`

export type FiberChoice = { end: FiberEnd; label: string }
export type ConnectionPreview = { left: FiberChoice; right: FiberChoice; conflict: string | null }

export function cableFibers(item: InstalledItem): FiberChoice[] {
  return item.cable?.tubes.flatMap((tube, tubeIndex) => tube.fibers.map((fiber, fiberIndex) => ({
    end: { itemId: item.id, tubeIndex, fiberIndex },
    label: `${tube.name} / ${fiber.name || `vlákno ${fiberIndex + 1}`}`,
  }))) ?? []
}

export function previewConnections(left: InstalledItem | undefined, right: InstalledItem | undefined,
  leftStart: number, rightStart: number, count: number, occupied: Set<string>): ConnectionPreview[] {
  if (!left || !right || !Number.isInteger(count) || count < 1 || count > 96
      || !Number.isInteger(leftStart) || !Number.isInteger(rightStart)
      || leftStart < 0 || rightStart < 0) return []
  const leftFibers = cableFibers(left).slice(leftStart, leftStart + count)
  const rightFibers = cableFibers(right).slice(rightStart, rightStart + count)
  if (leftFibers.length !== count || rightFibers.length !== count) return []
  return leftFibers.map((source, index) => {
    const target = rightFibers[index]
    const conflict = left.runId === right.runId ? 'Stejný průběžný kabel'
      : fiberEndKey(source.end) === fiberEndKey(target.end) ? 'Stejné vlákno'
        : occupied.has(fiberEndKey(source.end)) ? 'První konec je obsazený'
          : occupied.has(fiberEndKey(target.end)) ? 'Druhý konec je obsazený' : null
    return { left: source, right: target, conflict }
  })
}

export function connectionsFromPreview(preview: ConnectionPreview[], kind: FiberConnection['kind']): FiberConnection[] {
  if (!preview.length || preview.some(row => row.conflict)) return []
  return preview.map(row => ({ id: crypto.randomUUID(), left: row.left.end, right: row.right.end, kind }))
}

export type PortAssignmentPreview = { port: EquipmentPort; fiber: FiberChoice; conflict: string | null }

export function previewPortAssignments(ports: EquipmentPort[], cable: InstalledItem | undefined,
  firstPortPosition: number, firstFiberIndex: number, count: number,
  occupied: Set<string>): PortAssignmentPreview[] {
  if (!cable || !Number.isInteger(count) || count < 1 || count > 96
      || !Number.isInteger(firstPortPosition) || !Number.isInteger(firstFiberIndex)
      || firstFiberIndex < 0) return []
  const selectedPorts = [...ports].sort((a, b) => a.position - b.position)
    .filter(port => port.position >= firstPortPosition).slice(0, count)
  const fibers = cableFibers(cable).slice(firstFiberIndex, firstFiberIndex + count)
  if (selectedPorts.length !== count || fibers.length !== count) return []
  return selectedPorts.map((port, index) => ({ port, fiber: fibers[index],
    conflict: port.fiber ? 'Port už má vlákno'
      : occupied.has(fiberEndKey(fibers[index].end)) ? 'Vlákno už je připojené' : null }))
}
