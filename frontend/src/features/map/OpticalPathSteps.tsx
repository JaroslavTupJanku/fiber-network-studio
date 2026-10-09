import { allocatedFiberKey, type FiberAllocationDocument } from './fiberAllocations'
import type { OpticalPath } from './traceOpticalPath'

const kindLabel = (kind: OpticalPath['steps'][number]['kind']) => {
  if (kind === 'cable' || kind === 'indoor-cable') return 'Kabel'
  if (kind === 'splitter') return 'Splitter'
  if (kind === 'patch') return 'Propojka'
  if (kind === 'premise') return 'HP'
  return 'Spoj'
}

export function OpticalPathSteps({ path, allocations, onOpenRoute }: {
  path: OpticalPath; allocations: FiberAllocationDocument | null
  onOpenRoute: (routeId: string) => void
}) {
  const assigned = new Map(allocations?.allocations.flatMap(allocation => allocation.fibers.map(fiber =>
    [allocatedFiberKey(fiber), allocation] as const)) ?? [])
  return <><h4>Schéma sledované cesty</h4><ol className="equipment-path-schematic">
    {path.steps.map((step, index) => {
      const key = step.runId !== undefined && step.tubeIndex !== undefined && step.fiberIndex !== undefined
        ? allocatedFiberKey({ runId: step.runId, tubeIndex: step.tubeIndex, fiberIndex: step.fiberIndex }) : null
      const allocation = key ? assigned.get(key) : null
      return <li data-step-kind={step.kind} key={`${step.kind}-${step.itemId ?? step.routeId ?? index}-${index}`}>
        <span className="trace-step-number" aria-hidden="true">{index + 1}</span><div><span>{kindLabel(step.kind)}</span><strong>{step.label}</strong>
          {key && <small className="fiber-path-status">{allocation
            ? `${allocation.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${allocation.label}`
            : 'Volné pro službu'}</small>}</div>
        {step.routeId && <button type="button" className="move-button"
          onClick={() => onOpenRoute(step.routeId!)}>Ukázat na mapě</button>}
      </li>
    })}</ol></>
}
