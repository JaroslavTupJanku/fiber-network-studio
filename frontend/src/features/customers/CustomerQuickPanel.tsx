import { useEffect, useState } from 'react'
import { ArrowUpRight, Building2, ChevronRight, Mail, Users } from 'lucide-react'
import { listCustomers } from './api'
import type { CustomerRecord } from './model'

export function CustomerQuickPanel({ active, buildingId, buildingName, buildings, onOpenCustomers }: {
  active: boolean
  buildingId: string | null
  buildingName: string | null
  buildings: { id: string; name: string }[]
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

  const scoped = buildingId ? customers.filter(item => item.buildingPointId === buildingId) : customers
  const countByBuilding = new Map<string, number>()
  for (const item of customers) countByBuilding.set(item.buildingPointId, (countByBuilding.get(item.buildingPointId) ?? 0) + 1)
  const pendingMessages = scoped.reduce((count, item) => count + item.messages.filter(message => message.status === 'todo').length, 0)
  const customerCount = (count: number) => `${count} ${count === 1 ? 'zákazník' : count >= 2 && count <= 4 ? 'zákazníci' : 'zákazníků'}`

  return <div className="customer-quick-panel">
    <span className="section-label">ZÁKAZNÍCI</span>
    <h1>{buildingName ?? 'Zákazníci v síti'}</h1>
    <p>{buildingId ? 'Záznamy přiřazené k vybrané budově.' : 'Rychlý přehled podle budov. Podrobnosti a úpravy otevřete v evidenci.'}</p>
    {error ? <div className="customer-quick-empty" role="alert">Přehled zákazníků se nenačetl. Otevřete evidenci a zkuste to znovu.</div>
      : !loaded ? <p className="customer-quick-empty">Načítání zákazníků…</p> : <>
        <div className="customer-quick-metrics">
          <div><Users size={17} aria-hidden="true" /><strong>{scoped.length}</strong><span>Zákazníci</span></div>
          <div><Mail size={17} aria-hidden="true" /><strong>{pendingMessages}</strong><span>Zprávy k vyřízení</span></div>
        </div>
        {buildingId ? <>
          {scoped.length > 0 ? <ul className="customer-quick-list">
            {scoped.slice(0, 5).map(item => <li key={item.id}><Users size={14} /><span>{item.name}</span><small>{item.status === 'active' ? 'Aktivní' : 'Zájemce'}</small></li>)}
            {scoped.length > 5 && <li className="customer-quick-more">a dalších {scoped.length - 5}</li>}
          </ul> : <div className="customer-quick-empty">U této budovy zatím nikdo není. První záznam můžete založit v evidenci.</div>}
        </> : <>
          {customers.length === 0 && <div className="customer-quick-empty">Zatím tu nejsou žádní zákazníci. Vyberte budovu a založte první záznam v evidenci.</div>}
          <div className="customer-quick-buildings">
            <h2>Budovy v mapě <span>{buildings.length}</span></h2>
            {buildings.length ? <div className="customer-quick-building-list">{buildings.map(building =>
              <button type="button" key={building.id} onClick={() => onOpenCustomers(building.id)}>
                <Building2 size={17} aria-hidden="true" /><span><strong>{building.name}</strong><small>{customerCount(countByBuilding.get(building.id) ?? 0)}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>)}</div> : <p className="customer-quick-empty">Nejdřív přidejte budovu do mapy.</p>}
          </div>
        </>}
      </>}
    <button type="button" className="primary-button customer-quick-open" onClick={() => onOpenCustomers(buildingId)}>
      {buildingId ? 'Otevřít evidenci budovy' : 'Otevřít celou evidenci'} <ArrowUpRight size={15} />
    </button>
  </div>
}
