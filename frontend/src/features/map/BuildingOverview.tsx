import { useEffect, useState, type ReactNode } from 'react'
import { Building2, Cable, ChevronDown, Users } from 'lucide-react'
import { loadBuildingEquipment, type BuildingEquipmentDocument } from './buildingEquipment'
import { isConnectedPremise, loadBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { listCustomers } from '../customers/api'
import type { CustomerRecord } from '../customers/model'
import { countCzech } from './equipmentPresentation'
import './buildingOverview.css'

function OverviewSection({ title, icon, summary, children }: { title: string; icon: ReactNode; summary: string; children: ReactNode }) {
  return <details className="building-overview-section"><summary><span className="building-overview-icon">{icon}</span>
    <span><strong>{title}</strong><small>{summary}</small></span><ChevronDown size={15} /></summary>
    <div className="building-overview-body">{children}</div></details>
}

export function BuildingOverview({ pointId, active, equipmentVersion, distributionVersion, onEquipment, onDistribution, onCustomers }: {
  pointId: string; active: boolean; equipmentVersion?: number; distributionVersion?: number
  onEquipment: () => void; onDistribution: () => void; onCustomers: (customerId?: string) => void
}) {
  const [equipment, setEquipment] = useState<BuildingEquipmentDocument | null>(null)
  const [distribution, setDistribution] = useState<BuildingDistributionDocument | null>(null)
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    setLoading(true)
    Promise.allSettled([loadBuildingEquipment(pointId), loadBuildingDistribution(pointId), listCustomers()]).then(([eq, dist, people]) => {
      if (!live) return
      setEquipment(eq.status === 'fulfilled' ? eq.value : null)
      setDistribution(dist.status === 'fulfilled' ? dist.value : null)
      setCustomers(people.status === 'fulfilled' ? people.value.filter(item => item.buildingPointId === pointId).sort((a, b) => a.name.localeCompare(b.name, 'cs')) : [])
      setErrors([eq.status === 'rejected' ? 'equipment' : '', dist.status === 'rejected' ? 'distribution' : '', people.status === 'rejected' ? 'customers' : ''].filter(Boolean))
      setLoading(false)
    })
    return () => { live = false }
  }, [pointId, active, equipmentVersion, distributionVersion, reload])
  const status = (key: string, text: string) => loading ? 'Načítání…' : errors.includes(key) ? 'Přehled se nenačetl' : text
  const failure = (key: string) => loading ? <p role="status">Načítání přehledu…</p> : errors.includes(key) ? <p role="alert">Přehled se nepodařilo načíst. <button type="button" className="building-overview-action" onClick={() => setReload(value => value + 1)}>Zkusit znovu</button></p> : null
  return <div className="building-overview">
    <OverviewSection title="Optické vybavení" icon={<Cable size={17} />} summary={status('equipment', `${countCzech(equipment?.racks.length ?? 0, 'stojan', 'stojany', 'stojanů')} · ${countCzech(equipment?.ports.length ?? 0, 'port', 'porty', 'portů')}`)}>
      {failure('equipment') ?? <>{equipment?.racks.length ? <ul className="building-overview-list">{equipment.racks.map(rack => <li key={rack.id}><strong>{rack.name}</strong>
        <ul>{equipment.shelves.filter(shelf => shelf.rackId === rack.id).map(shelf => {
          const cardIds = equipment.cards.filter(card => card.shelfId === shelf.id).map(card => card.id)
          const ports = equipment.ports.filter(port => port.parentId === shelf.id || cardIds.includes(port.parentId))
          return <li key={shelf.id}><span>{shelf.name} <small>{shelf.kind.toUpperCase()}</small></span><small>{countCzech(ports.length, 'port', 'porty', 'portů')}{cardIds.length ? ` · ${countCzech(cardIds.length, 'karta', 'karty', 'karet')}` : ''}</small></li>
        })}{!equipment.shelves.some(shelf => shelf.rackId === rack.id) && <li><small>Bez zařízení</small></li>}</ul></li>)}</ul> : <p>V budově zatím není evidované optické vybavení.</p>}
        <button type="button" className="building-overview-action" onClick={onEquipment}>{equipment?.racks.length ? 'Upravit vybavení' : 'Přidat vybavení'}</button></>}
    </OverviewSection>
    <OverviewSection title="Domovní rozvod" icon={<Building2 size={17} />} summary={status('distribution', `${distribution?.premises.filter(isConnectedPremise).length ?? 0}/${distribution?.premises.length ?? 0} míst s přiřazeným vláknem`)}>
      {failure('distribution') ?? <>{distribution?.risers.length || distribution?.premises.length ? <ul className="building-overview-list">
        {distribution.risers.map(riser => <li key={riser.id}><strong>{riser.name}</strong><small>{distribution.boxes.filter(box => box.riserId === riser.id).map(box => `${box.name} (${box.floor}. podlaží)`).join(' · ') || 'Bez podlažních boxů'}</small></li>)}
        {distribution.premises.map(premise => <li key={premise.id}><span>{premise.label}<small>{distribution.boxes.find(box => box.id === premise.boxId)?.name ?? 'Přímá přípojka'}</small></span><small>{isConnectedPremise(premise) ? 'Přiřazené vlákno' : 'Plánováno'}</small></li>)}</ul> : <p>Zatím nejsou evidovaná přípojná místa ani domovní rozvod.</p>}
        <button type="button" className="building-overview-action" onClick={onDistribution}>{distribution?.risers.length || distribution?.premises.length ? 'Upravit rozvod' : 'Přidat přípojné místo'}</button></>}
    </OverviewSection>
    <OverviewSection title="Zákazníci" icon={<Users size={17} />} summary={status('customers', `${countCzech(customers.length, 'zákazník', 'zákazníci', 'zákazníků')} v budově`)}>
      {failure('customers') ?? <>{customers.length ? <ul className="building-overview-list">{customers.map(customer => <li key={customer.id}>
        <span><strong>{customer.name}</strong><small>{distribution?.premises.find(premise => premise.id === customer.premiseId)?.label ?? 'Bez přiřazeného přípojného místa'} · {customer.status === 'active' ? 'Aktivní' : 'Zájemce'}</small></span>
        <button type="button" className="building-overview-action" aria-label={`Otevřít zákazníka ${customer.name}`} onClick={() => onCustomers(customer.id)}>Otevřít</button></li>)}</ul> : <p>K této budově zatím není přiřazený žádný zákazník.</p>}
        <button type="button" className="building-overview-action" onClick={() => onCustomers()}>Spravovat zákazníky budovy</button></>}
    </OverviewSection>
  </div>
}
