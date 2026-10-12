import { useEffect, useState } from 'react'
import { listBuildingDistribution, type BuildingDistributionDocument } from '../map/buildingDistribution'
import { listNetworkPoints, type NetworkPoint } from '../map/networkPoints'
import { CustomerPanel } from './CustomerPanel'

export function CustomerWorkspace({ buildingId, initialCustomerId, onShowBuilding, onDirtyChange }: {
  initialCustomerId?: string
  buildingId: string | null
  onShowBuilding: (id: string) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [buildings, setBuildings] = useState<NetworkPoint[]>([])
  const [distributions, setDistributions] = useState<BuildingDistributionDocument[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([listNetworkPoints(), listBuildingDistribution()]).then(([points, loadedDistributions]) => {
      if (!live) return
      setBuildings(points.filter(point => point.kind === 'building').sort((a, b) => a.name.localeCompare(b.name, 'cs')))
      setDistributions(loadedDistributions)
      setLoading(false)
    }).catch(() => { if (live) { setError('Budovy a přípojná místa se nepodařilo načíst.'); setLoading(false) } })
    return () => { live = false }
  }, [reload])

  return <main className="customer-workspace" aria-label="Evidence zákazníků">
    {loading ? <p role="status">Načítání budov a přípojných míst…</p> : error ? <div role="alert"><p>{error}</p>
      <button type="button" className="primary-button" onClick={() => { setLoading(true); setError(''); setReload(value => value + 1) }}>Načíst znovu</button></div>
      : <CustomerPanel initialCustomerId={initialCustomerId} buildingId={buildingId} buildings={buildings} distributions={distributions}
        onShowBuilding={onShowBuilding} onDirtyChange={onDirtyChange} />}
  </main>
}
