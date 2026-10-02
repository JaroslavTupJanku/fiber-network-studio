import type { OpticalPath } from './traceOpticalPath'

export type AllocatedFiber = { runId: string; tubeIndex: number; fiberIndex: number }
export type FiberAllocation = { id: string; label: string; status: 'reserved' | 'used';
  premiseId: string | null; fibers: AllocatedFiber[] }
export type FiberAllocationDocument = { version: number; allocations: FiberAllocation[] }

export const allocatedFiberKey = (fiber: AllocatedFiber) =>
  `${fiber.runId}:${fiber.tubeIndex}:${fiber.fiberIndex}`

export function pathAllocatedFibers(path: OpticalPath): AllocatedFiber[] {
  const seen = new Set<string>()
  return path.steps.flatMap(step => {
    if (step.kind !== 'cable' || step.runId === undefined || step.tubeIndex === undefined
        || step.fiberIndex === undefined) return []
    const fiber = { runId: step.runId, tubeIndex: step.tubeIndex, fiberIndex: step.fiberIndex }
    const key = allocatedFiberKey(fiber)
    if (seen.has(key)) return []
    seen.add(key)
    return [fiber]
  })
}

export function allocationConflicts(fibers: AllocatedFiber[], allocations: FiberAllocation[],
  exceptId?: string): FiberAllocation[] {
  const keys = new Set(fibers.map(allocatedFiberKey))
  return allocations.filter(item => item.id !== exceptId
    && item.fibers.some(fiber => keys.has(allocatedFiberKey(fiber))))
}

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Využití vláken se nepodařilo uložit (${response.status}).`)
  }
  return response
}

export async function loadFiberAllocations(): Promise<FiberAllocationDocument> {
  return (await expectOk(await fetch('/api/fiber-allocations'))).json()
}

export async function saveFiberAllocations(document: FiberAllocationDocument): Promise<FiberAllocationDocument> {
  return (await expectOk(await fetch('/api/fiber-allocations', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document),
  }))).json()
}
