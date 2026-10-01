import { useEffect, useState } from 'react'
import { ArrowUpRight, Building2, Users } from 'lucide-react'
import { listCustomers } from './api'
import type { CustomerRecord } from './model'

export function CustomerQuickPanel({ active, buildingId, buildingName, onOpenCustomers }: {
  active: boolean
  buildingId: string | null
  buildingName: string | null
  onOpenCustomers: (buildingId: string | null) => void
}) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!active) return
    let live = true
    listCustomers().then(items => { if (live) { setCustomers(items); setError(false); setLoaded(true) } })
      .catch(() => { if (live) { setError(true); setLoaded(true) } })
    return () => { live = false }
  }, [active, buildingId])

  const scoped = buildingId ? customers.filter(item => item.buildingPointId === buildingId) : []
  return <div className="customer-quick-panel">
    <span className="section-label">ZÁKAZNÍCI</span>
    <h1>{buildingName ?? 'Evidence zákazníků'}</h1>
    <p>{buildingId ? 'Klienti přiřazení k této budově' : 'Zákazníky najdete v samostatné evidenci podle budov.'}</p>
    {buildingId && <div className="customer-quick-summary"><Building2 size={19} />
      <div><strong>{!loaded ? 'Načítání…' : error ? 'Přehled se nenačetl' : `${scoped.length} ${scoped.length === 1 ? 'zákazník' : scoped.length >= 2 && scoped.length <= 4 ? 'zákazníci' : 'zákazníků'}`}</strong>
        <small>{buildingName}</small></div></div>}
    {buildingId && scoped.length > 0 && <ul className="customer-quick-list">
      {scoped.slice(0, 3).map(item => <li key={item.id}><Users size={14} />{item.name}</li>)}
      {scoped.length > 3 && <li className="customer-quick-more">a dalších {scoped.length - 3}</li>}
    </ul>}
    <button type="button" className="primary-button customer-quick-open" onClick={() => onOpenCustomers(buildingId)}>
      Otevřít evidenci <ArrowUpRight size={15} /></button>
  </div>
}
