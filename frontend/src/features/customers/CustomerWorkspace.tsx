import { useEffect, useState } from 'react'
import { listBuildingDistribution, type BuildingDistributionDocument } from '../map/buildingDistribution'
import { listNetworkPoints, type NetworkPoint } from '../map/networkPoints'
import { CustomerPanel } from './CustomerPanel'

export function CustomerWorkspace({ buildingId, onShowBuilding, onDirtyChange }: {
  buildingId: string | null
  onShowBuilding: (id: string) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [buildings, setBuildings] = useState<NetworkPoint[]>([])
  const [distributions, setDistributions] = useState<BuildingDistributionDocument[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([listNetworkPoints(), listBuildingDistribution()]).then(([points, loadedDistributions]) => {
      if (!live) return
      setBuildings(points.filter(point => point.kind === 'building').sort((a, b) => a.name.localeCompare(b.name, 'cs')))
      setDistributions(loadedDistributions)
    }).catch(() => { if (live) setError('Budovy se nepodařilo načíst. Zkuste stránku obnovit.') })
    return () => { live = false }
  }, [])

  return <main className="customer-workspace" aria-label="Evidence zákazníků">
    {error && <p className="customer-error" role="alert">{error}</p>}
    <CustomerPanel buildingId={buildingId} buildings={buildings} distributions={distributions}
      onShowBuilding={onShowBuilding} onDirtyChange={onDirtyChange} />
  </main>
}
