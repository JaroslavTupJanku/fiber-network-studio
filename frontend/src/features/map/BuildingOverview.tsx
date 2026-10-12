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

function PreviewList({ items, label }: { items: ReactNode[]; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const limit = 4
  return <><ul className="building-overview-list" aria-label={label}>{expanded ? items : items.slice(0, limit)}</ul>
    {items.length > limit && <button type="button" className="building-overview-action building-overview-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Zobrazit méně' : `Zobrazit vše (${items.length})`}</button>}</>
}

function OverviewRow({ name, description, status, tone = 'neutral', action }: {
  name: string; description: string; status?: string; tone?: 'neutral' | 'ready' | 'pending'; action?: ReactNode
}) {
  return <li className="building-overview-row"><strong>{name}</strong>
    <small className="building-overview-description">{description}</small>
    {(status || action) && <div className="building-overview-row-footer">
      {status && <span className={`building-overview-status is-${tone}`}>{status}</span>}{action}
    </div>}</li>
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
  const premises = distribution?.premises ?? []
  const connectedCount = premises.filter(isConnectedPremise).length
  const premiseCount = countCzech(premises.length, 'přípojné místo', 'přípojná místa', 'přípojných míst')
  const distributionSummary = premises.length ? `${premiseCount} · vlákno přiřazeno: ${connectedCount}` : 'Zatím bez přípojných míst'
  const premiseRow = (premise: typeof premises[number]) => <OverviewRow key={premise.id} name={premise.label}
    description={premise.boxId ? 'Vedení: přes podlažní box' : 'Vedení: přímo do domu'}
    status={isConnectedPremise(premise) ? 'Vlákno přiřazeno' : 'Čeká na přiřazení vlákna'}
    tone={isConnectedPremise(premise) ? 'ready' : 'pending'} />
  const distributionGroups: ReactNode[] = (distribution?.risers ?? []).map(riser => <li className="building-overview-group" key={riser.id}>
    <h3>{riser.name}</h3>
    <PreviewList label={`Boxy – ${riser.name}`} items={distribution!.boxes.filter(box => box.riserId === riser.id).sort((a, b) => a.floor - b.floor).map(box => <li className="building-overview-group" key={box.id}>
      <h4>{box.name}<small>{box.floor}. podlaží</small></h4>
      {premises.some(premise => premise.boxId === box.id) ? <PreviewList label={`Přípojná místa – ${box.name}`} items={premises.filter(premise => premise.boxId === box.id).map(premiseRow)} /> : <p className="building-overview-empty">Zatím bez přípojných míst.</p>}
    </li>)} />
    {!distribution!.boxes.some(box => box.riserId === riser.id) && <p className="building-overview-empty">Zatím bez podlažních boxů.</p>}
  </li>)
  const directPremises = premises.filter(premise => !premise.boxId)
  if (directPremises.length) distributionGroups.push(<li className="building-overview-group" key="direct"><h3>Přímé přípojky</h3><PreviewList label="Přímé přípojky" items={directPremises.map(premiseRow)} /></li>)
  // Keep imported records with an unknown box visible instead of silently losing them.
  const unassignedPremises = premises.filter(premise => premise.boxId && !distribution?.boxes.some(box => box.id === premise.boxId && distribution.risers.some(riser => riser.id === box.riserId)))
  if (unassignedPremises.length) distributionGroups.push(<li className="building-overview-group" key="unassigned"><h3>Nezařazená místa</h3><PreviewList label="Nezařazená místa" items={unassignedPremises.map(premiseRow)} /></li>)
  return <div className="building-overview">
    <OverviewSection title="Optické vybavení" icon={<Cable size={17} />} summary={status('equipment', equipment?.racks.length ? `${countCzech(equipment.racks.length, 'stojan', 'stojany', 'stojanů')} · ${countCzech(equipment.ports.length, 'port', 'porty', 'portů')}` : 'Zatím bez vybavení')}>
      {failure('equipment') ?? <>{equipment?.racks.length ? <PreviewList label="Stojany" items={equipment.racks.map(rack => <li className="building-overview-group" key={rack.id}><h3>{rack.name}</h3>
        <PreviewList label={`Zařízení – ${rack.name}`} items={equipment.shelves.filter(shelf => shelf.rackId === rack.id).map(shelf => {
          const cards = equipment.cards.filter(card => card.shelfId === shelf.id)
          const ports = equipment.ports.filter(port => port.parentId === shelf.id || cards.some(card => card.id === port.parentId))
          return <OverviewRow key={shelf.id} name={shelf.name} description={`Typ: ${shelf.kind.toUpperCase()}`}
            status={`${countCzech(ports.length, 'port', 'porty', 'portů')}${cards.length ? ` · ${countCzech(cards.length, 'karta', 'karty', 'karet')}` : ''}`} />
        })} />
        {!equipment.shelves.some(shelf => shelf.rackId === rack.id) && <p className="building-overview-empty">Zatím bez zařízení.</p>}</li>)} /> : <p>V budově zatím není evidované optické vybavení.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={onEquipment}>{equipment?.racks.length ? 'Upravit vybavení' : 'Přidat vybavení'}</button></div></>}
    </OverviewSection>
    <OverviewSection title="Domovní rozvod" icon={<Building2 size={17} />} summary={status('distribution', distributionSummary)}>
      {failure('distribution') ?? <>{distributionGroups.length ? <PreviewList label="Rozvod v budově" items={distributionGroups} /> : <p>Zatím nejsou evidovaná přípojná místa ani domovní rozvod.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={onDistribution}>{distributionGroups.length ? 'Upravit rozvod' : 'Přidat přípojné místo'}</button></div></>}
    </OverviewSection>
    <OverviewSection title="Zákazníci" icon={<Users size={17} />} summary={status('customers', customers.length ? countCzech(customers.length, 'zákazník', 'zákazníci', 'zákazníků') : 'Zatím bez zákazníků')}>
      {failure('customers') ?? <>{customers.length ? <PreviewList label="Zákazníci budovy" items={customers.map(customer => <OverviewRow key={customer.id} name={customer.name}
        description={customer.premiseId ? `Přípojné místo: ${errors.includes('distribution') ? 'údaj se nenačetl' : premises.find(premise => premise.id === customer.premiseId)?.label ?? 'nenalezeno'}` : 'Přípojné místo: nepřiřazeno'}
        status={customer.status === 'active' ? 'Aktivní zákazník' : 'Zájemce'}
        action={<button type="button" className="building-overview-action" aria-label={`Otevřít zákazníka ${customer.name}`} onClick={() => onCustomers(customer.id)}>Otevřít kartu</button>} />)} /> : <p>K této budově zatím není přiřazený žádný zákazník.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={() => onCustomers()}>Spravovat zákazníky budovy</button></div></>}
    </OverviewSection>
  </div>
}
