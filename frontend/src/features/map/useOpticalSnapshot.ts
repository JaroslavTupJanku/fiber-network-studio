import { useEffect, useState } from 'react'
import { listRouteInstallations } from './routeInstallations'
import { listBuildingEquipment } from './buildingEquipment'
import { listOpticalSplices } from './opticalSplices'
import { listBuildingDistribution } from './buildingDistribution'
import { loadFiberAllocations } from './fiberAllocations'

export async function loadOpticalSnapshot() {
  const [equipment, splices, distributions, installations, allocations] = await Promise.all([
    listBuildingEquipment(), listOpticalSplices(), listBuildingDistribution(), listRouteInstallations(), loadFiberAllocations()])
  return { equipment, splices, distributions, installations, allocations }
}
export function useOpticalSnapshot(open: boolean) {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof loadOpticalSnapshot>> | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let live = true
    void Promise.resolve().then(async () => {
      if (!live) return
      setSnapshot(null); setError('')
      try { const value = await loadOpticalSnapshot(); if (live) setSnapshot(value) }
      catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Zapojení se nenačetlo.') }
    })
    return () => { live = false }
  }, [open, attempt])
  return { snapshot, error, retry: () => setAttempt(a => a + 1) }
}
