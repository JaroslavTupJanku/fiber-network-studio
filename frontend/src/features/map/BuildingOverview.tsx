import { useEffect, useState, type ReactNode } from 'react'
import { Building2, Cable, ChevronDown, Users } from 'lucide-react'
import { loadBuildingEquipment, type BuildingEquipmentDocument } from './buildingEquipment'
import { isConnectedPremise, loadBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { listCustomers } from '../customers/api'
import type { CustomerRecord } from '../customers/model'
import { countCzech } from './equipmentPresentation'
import { BuildingRecordsDialog, CompactRecords, type BuildingRecord, type RecordGroup } from './BuildingRecords'
import './buildingOverview.css'

function OverviewSection({ title, icon, summary, children }: { title: string; icon: ReactNode; summary: string; children: ReactNode }) {
  return <details className="building-overview-section"><summary><span className="building-overview-icon">{icon}</span>
    <span><strong>{title}</strong><small>{summary}</small></span><ChevronDown size={15} /></summary>
    <div className="building-overview-body">{children}</div></details>
}

export function BuildingOverview({ pointId, pointName, active, equipmentVersion, distributionVersion, onEquipment, onDistribution, onCustomers }: {
  pointId: string; pointName: string; active: boolean; equipmentVersion?: number; distributionVersion?: number
  onEquipment: (shelfId?: string) => void; onDistribution: (premiseId?: string) => void; onCustomers: (customerId?: string) => void
}) {
  const [equipment, setEquipment] = useState<BuildingEquipmentDocument | null>(null)
  const [distribution, setDistribution] = useState<BuildingDistributionDocument | null>(null)
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [reload, setReload] = useState(0)
  const [overviewQuery, setOverviewQuery] = useState('')
  const [overview, setOverview] = useState<'equipment' | 'distribution' | 'customers' | null>(null)
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
  const distributionSummary = premises.length ? `${countCzech(premises.length, 'přípojné místo', 'přípojná místa', 'přípojných míst')} · ${connectedCount} s přiřazeným vláknem` : 'Zatím bez přípojných míst'
  const premiseRecords: BuildingRecord[] = premises.map<BuildingRecord>(premise => {
    const box = distribution?.boxes.find(item => item.id === premise.boxId)
    const riser = distribution?.risers.find(item => item.id === box?.riserId)
    return { id: premise.id, name: premise.label, groupId: riser?.id ?? (premise.boxId ? 'unassigned' : 'direct'),
      group: riser?.name ?? (premise.boxId ? 'Nezařazená místa' : 'Přímé přípojky'), floor: box?.floor,
      context: box ? `${riser?.name ?? 'Nezařazený vchod'} · ${box.name} · ${box.floor}. podlaží` : premise.boxId ? 'Podlažní box nenalezen' : 'Vedení: přímo do domu',
      status: isConnectedPremise(premise) ? 'Vlákno přiřazeno' : 'Čeká na přiřazení vlákna', tone: isConnectedPremise(premise) ? 'ready' : 'pending' }
  }).sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }))
  const distributionGroups: RecordGroup[] = (distribution?.risers ?? []).map(riser => ({ id: riser.id, name: riser.name,
    records: premiseRecords.filter(record => record.groupId === riser.id),
    children: distribution!.boxes.filter(box => box.riserId === riser.id).sort((a, b) => a.floor - b.floor).map(box => ({ id: box.id, name: `${box.name} · ${box.floor}. podlaží`,
      records: premiseRecords.filter(record => premises.find(premise => premise.id === record.id)?.boxId === box.id) })) }))
  for (const id of ['direct', 'unassigned']) {
    const records = premiseRecords.filter(record => record.groupId === id)
    if (records.length) distributionGroups.push({ id, name: records[0].group, records })
  }
  const equipmentRecords: BuildingRecord[] = (equipment?.shelves ?? []).map(shelf => {
    const rack = equipment?.racks.find(item => item.id === shelf.rackId)
    const cards = equipment?.cards.filter(card => card.shelfId === shelf.id) ?? []
    const ports = equipment?.ports.filter(port => port.parentId === shelf.id || cards.some(card => card.id === port.parentId)) ?? []
    return { id: shelf.id, name: shelf.name, context: `Stojan: ${rack?.name ?? 'nezařazeno'}`, groupId: rack?.id ?? 'unassigned', group: rack?.name ?? 'Nezařazená zařízení',
      status: shelf.kind.toUpperCase(), detail: `${countCzech(ports.length, 'port', 'porty', 'portů')}${cards.length ? ` · ${countCzech(cards.length, 'karta', 'karty', 'karet')}` : ''}` }
  })
  const equipmentGroups: RecordGroup[] = (equipment?.racks ?? []).map(rack => ({ id: rack.id, name: rack.name, records: equipmentRecords.filter(record => record.groupId === rack.id) }))
  const unassignedEquipment = equipmentRecords.filter(record => record.groupId === 'unassigned')
  if (unassignedEquipment.length) equipmentGroups.push({ id: 'unassigned', name: 'Nezařazená zařízení', records: unassignedEquipment })
  const customerRecords: BuildingRecord[] = customers.map(customer => {
    const premise = premiseRecords.find(item => item.id === customer.premiseId)
    return { id: customer.id, name: customer.name, context: customer.premiseId ? `Přípojné místo: ${premise?.name ?? (errors.includes('distribution') ? 'údaj se nenačetl' : 'nenalezeno')}` : 'Přípojné místo: nepřiřazeno',
      groupId: premise?.groupId ?? 'unassigned', group: premise?.group ?? 'Bez přiřazeného vchodu', floor: premise?.floor,
      detail: premise?.context, status: customer.status === 'active' ? 'Aktivní zákazník' : 'Zájemce' }
  })
  const openEquipment = (id: string) => { setOverview(null); onEquipment(id) }
  const openDistribution = (id: string) => { setOverview(null); onDistribution(id) }
  const openCustomer = (id: string) => { setOverview(null); onCustomers(id) }
  return <div className="building-overview">
    <OverviewSection title="Optické vybavení" icon={<Cable size={17} />} summary={status('equipment', equipment?.racks.length ? `${countCzech(equipment.racks.length, 'stojan', 'stojany', 'stojanů')} · ${countCzech(equipment.ports.length, 'port', 'porty', 'portů')}` : 'Zatím bez vybavení')}>
      {failure('equipment') ?? <>{equipmentGroups.length ? <CompactRecords records={equipmentRecords} groups={equipmentGroups} label="Hledat zařízení" onOpen={openEquipment} onOverview={query => { setOverviewQuery(query ?? ''); setOverview('equipment') }} /> : <p>V budově zatím není evidované optické vybavení.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={() => onEquipment()}>{equipmentGroups.length ? 'Upravit vybavení budovy' : 'Přidat vybavení'}</button></div></>}
    </OverviewSection>
    <OverviewSection title="Domovní rozvod" icon={<Building2 size={17} />} summary={status('distribution', distributionSummary)}>
      {failure('distribution') ?? <>{distributionGroups.length ? <CompactRecords records={premiseRecords} groups={distributionGroups} label="Hledat byt nebo přípojné místo" onOpen={openDistribution} onOverview={query => { setOverviewQuery(query ?? ''); setOverview('distribution') }} /> : <p>Zatím nejsou evidovaná přípojná místa ani domovní rozvod.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={() => onDistribution()}>{distributionGroups.length ? 'Upravit rozvod budovy' : 'Přidat přípojné místo'}</button></div></>}
    </OverviewSection>
    <OverviewSection title="Zákazníci" icon={<Users size={17} />} summary={status('customers', customers.length ? countCzech(customers.length, 'zákazník', 'zákazníci', 'zákazníků') : 'Zatím bez zákazníků')}>
      {failure('customers') ?? <>{customers.length ? <CompactRecords records={customerRecords} label="Hledat zákazníka budovy" onOpen={openCustomer} onOverview={query => { setOverviewQuery(query ?? ''); setOverview('customers') }} action="Otevřít kartu" /> : <p>K této budově zatím není přiřazený žádný zákazník.</p>}
        <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={() => onCustomers()}>Spravovat zákazníky budovy</button></div></>}
    </OverviewSection>
    {overview && <BuildingRecordsDialog key={overview} initialQuery={overviewQuery} title={overview === 'distribution' ? 'Přehled domovního rozvodu' : overview === 'equipment' ? 'Přehled optického vybavení' : 'Přehled zákazníků budovy'} buildingName={pointName}
      records={overview === 'distribution' ? premiseRecords : overview === 'equipment' ? equipmentRecords : customerRecords}
      groupLabel={overview === 'equipment' ? 'Stojan' : 'Vchod'} floors={overview !== 'equipment'} action={overview === 'customers' ? 'Otevřít kartu' : 'Upravit'}
      onOpen={overview === 'distribution' ? openDistribution : overview === 'equipment' ? openEquipment : openCustomer} onClose={() => setOverview(null)} />}
  </div>
}
