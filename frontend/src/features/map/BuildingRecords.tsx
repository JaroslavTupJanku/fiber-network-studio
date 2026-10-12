import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

import { findBuildingRecords, type BuildingRecord } from './buildingRecordSearch'
export type { BuildingRecord } from './buildingRecordSearch'
export type RecordGroup = { id: string; name: string; records: BuildingRecord[]; children?: RecordGroup[] }

function RecordRows({ records, onOpen, action }: { records: BuildingRecord[]; onOpen: (id: string) => void; action: string }) {
  return <ul className="building-overview-list">{records.map(record => <li className="building-overview-row" key={record.id}>
    <strong>{record.name}</strong><small className="building-overview-description">{record.context}</small>
    {record.detail && <small>{record.detail}</small>}
    <div className="building-overview-row-footer"><span className={`building-overview-status is-${record.tone ?? 'neutral'}`}>{record.status}</span>
      <button type="button" className="building-overview-action" aria-label={`${action}: ${record.name}`} onClick={() => onOpen(record.id)}>{action}</button></div>
  </li>)}</ul>
}

function CompactGroup({ group, onOpen, onOverview, action }: { group: RecordGroup; onOpen: (id: string) => void; onOverview: () => void; action: string }) {
  return <details className="building-record-group"><summary><span>{group.name}</span><small>{group.records.length}</small><ChevronDown size={14} /></summary>
    {group.children?.length ? <>{group.children.slice(0, 4).map(child => <CompactGroup key={child.id} group={child} onOpen={onOpen} onOverview={onOverview} action={action} />)}
      {group.children.length > 4 && <button type="button" className="building-overview-action" onClick={() => onOverview()}>Všechny skupiny ({group.children.length})</button>}</>
      : <><RecordRows records={group.records.slice(0, 4)} onOpen={onOpen} action={action} />
        {!group.records.length && <p>Zatím bez položek.</p>}
        {group.records.length > 4 && <button type="button" className="building-overview-action" onClick={() => onOverview()}>Otevřít celý přehled ({group.records.length})</button>}</>}
  </details>
}

export function CompactRecords({ records, groups, label, onOpen, onOverview, action = 'Upravit' }: {
  records: BuildingRecord[]; groups?: RecordGroup[]; label: string; onOpen: (id: string) => void; onOverview: (query?: string) => void; action?: string
}) {
  const [query, setQuery] = useState('')
  const found = findBuildingRecords(records, query)
  return <div className="building-compact-records"><label className="building-record-search">{label}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Název, umístění nebo stav…" /></label>
    {query.trim() ? <><p role="status">Nalezeno: {found.length}</p><RecordRows records={found.slice(0, 4)} onOpen={onOpen} action={action} />
      {found.length > 4 && <button type="button" className="building-overview-action" onClick={() => onOverview(query)}>Další výsledky v přehledu</button>}
      {!found.length && <p>Zkuste jiný název nebo umístění.</p>}</>
      : groups?.length ? <>{groups.slice(0, 4).map(group => <CompactGroup key={group.id} group={group} onOpen={onOpen} onOverview={onOverview} action={action} />)}
        {groups.length > 4 && <button type="button" className="building-overview-action" onClick={() => onOverview()}>Všechny skupiny ({groups.length})</button>}</>
        : <RecordRows records={records.slice(0, 4)} onOpen={onOpen} action={action} />}
    <div className="building-overview-actions"><button type="button" className="building-overview-action" onClick={() => onOverview()}>Otevřít přehled ({records.length})</button></div>
  </div>
}

export function BuildingRecordsDialog({ title, buildingName, records, groupLabel, floors = false, action = 'Upravit', initialQuery = '', onOpen, onClose }: {
  title: string; buildingName: string; records: BuildingRecord[]; groupLabel: string; floors?: boolean; action?: string; initialQuery?: string
  onOpen: (id: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [group, setGroup] = useState('')
  const [floor, setFloor] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const size = 20
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  const filtered = findBuildingRecords(records, query, { group, floor, status })
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const current = Math.min(page, pages - 1)
  const groups = Array.from(new Map(records.map(record => [record.groupId, record.group])).entries())
  const floorOptions = Array.from(new Set(records.filter(record => !group || record.groupId === group).flatMap(record => record.floor === undefined ? [] : [record.floor]))).sort((a, b) => a - b)
  const statuses = Array.from(new Set(records.map(record => record.status)))
  return createPortal(<dialog ref={ref} className="building-record-dialog" aria-labelledby="building-record-title" onCancel={onClose}>
    <header><div><small>{buildingName}</small><h2 id="building-record-title">{title}</h2></div><button type="button" aria-label="Zavřít přehled" onClick={onClose}><X size={20} /></button></header>
    <div className="building-record-filters">
      <label>Hledat v celém přehledu<input type="search" autoFocus value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Název, umístění nebo stav…" /></label>
      <label>{groupLabel}<select value={group} onChange={event => { setGroup(event.target.value); setFloor(''); setPage(0) }}><option value="">Vše</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {floors && <label>Podlaží<select value={floor} onChange={event => { setFloor(event.target.value); setPage(0) }}><option value="">Všechna podlaží</option>{floorOptions.map(value => <option key={value} value={String(value)}>{value}. podlaží</option>)}</select></label>}
      <label>{floors ? 'Stav' : 'Typ zařízení'}<select value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}><option value="">Všechny stavy</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" className="building-overview-action" onClick={() => { setQuery(''); setGroup(''); setFloor(''); setStatus(''); setPage(0) }}>Vymazat filtry</button>
    </div>
    <p className="building-record-count" role="status">{filtered.length ? `${current * size + 1}–${Math.min((current + 1) * size, filtered.length)} z ${filtered.length}` : 'Žádné výsledky'} · celkem {records.length}</p>
    <div className="building-record-results"><RecordRows records={filtered.slice(current * size, (current + 1) * size)} onOpen={onOpen} action={action} />{!filtered.length && <p>Zvoleným filtrům neodpovídá žádná položka. Zkuste změnit hledání nebo vymazat filtry.</p>}</div>
    <footer><button type="button" onClick={onClose}>Zavřít</button><nav aria-label="Stránkování přehledu"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Předchozí</button><span>Strana {current + 1} z {pages}</span><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Další</button></nav></footer>
  </dialog>, document.body)
}
