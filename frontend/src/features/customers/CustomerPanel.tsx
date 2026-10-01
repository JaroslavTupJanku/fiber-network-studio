import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Mail, MapPin, Plus, RefreshCw, Save, Search, Trash2, Users } from 'lucide-react'
import type { BuildingDistributionDocument } from '../map/buildingDistribution'
import { countCzech } from '../map/equipmentPresentation'
import type { NetworkPoint } from '../map/networkPoints'
import { deleteCustomer, listCustomers, saveCustomer } from './api'
import { categoryLabel, customerError, demoCustomer, newCustomer,
  type CustomerContact, type CustomerDraft, type CustomerMessage, type CustomerRecord,
  type MessageStatus } from './model'
import './customers.css'

type Props = {
  buildingId: string | null
  buildings: NetworkPoint[]
  distributions: BuildingDistributionDocument[]
  onShowBuilding: (id: string) => void
}

export function CustomerPanel({ buildingId, buildings, distributions, onShowBuilding }: Props) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [draft, setDraft] = useState<CustomerDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showAllFor, setShowAllFor] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'contacts' | 'messages'>('contacts')
  const [messageFilter, setMessageFilter] = useState<'all' | MessageStatus>('all')
  const [addingMessage, setAddingMessage] = useState(false)
  const [messageInput, setMessageInput] = useState({ subject: '', sender: '', date: new Date().toISOString().slice(0, 10),
    category: 'request' as CustomerMessage['category'], status: 'todo' as MessageStatus, summary: '' })
  const building = buildings.find(point => point.id === buildingId)
  const showAll = !!buildingId && showAllFor === buildingId
  const filtered = useMemo(() => customers.filter(customer => (showAll || !buildingId || customer.buildingPointId === buildingId)
    && `${customer.name} ${customer.contacts.map(contact => contact.name).join(' ')}`.toLocaleLowerCase('cs').includes(query.toLocaleLowerCase('cs'))),
  [customers, showAll, buildingId, query])
  const premises = distributions.find(item => item.pointId === draft?.buildingPointId)?.premises ?? []
  const buildingName = (id: string) => buildings.find(point => point.id === id)?.name ?? 'Budova již není na mapě'
  const premiseName = (premiseId: string | null, pointId: string) => premiseId
    ? distributions.find(item => item.pointId === pointId)?.premises.find(item => item.id === premiseId)?.label ?? 'HP již neexistuje'
    : 'Bez vazby na HP'

  useEffect(() => {
    let live = true
    listCustomers().then(items => { if (live) { setCustomers(items); setLoading(false) } })
      .catch(reason => { if (live) { setError(reason instanceof Error ? reason.message : 'Zákazníci se nenačetli.'); setLoading(false) } })
    return () => { live = false }
  }, [])

  const leaveDetail = () => {
    if (dirty && !window.confirm('Zahodit neuložené změny zákazníka?')) return
    setDraft(null); setDirty(false); setError(''); setAddingMessage(false)
  }
  const edit = (next: CustomerDraft) => { setDraft(next); setDirty(true); setError('') }
  const open = (item: CustomerRecord) => {
    if (dirty && !window.confirm('Zahodit neuložené změny zákazníka?')) return
    setDraft({ ...item, contacts: item.contacts.map(contact => ({ ...contact })),
      messages: item.messages.map(message => ({ ...message })) })
    setDirty(false); setError(''); setDetailTab('contacts'); setAddingMessage(false)
  }
  const start = () => {
    if (dirty && !window.confirm('Zahodit neuložené změny zákazníka?')) return
    setDraft(newCustomer(buildingId ?? buildings[0]?.id ?? ''))
    setDirty(true); setError(''); setDetailTab('contacts'); setAddingMessage(false)
  }
  const save = async (value = draft) => {
    if (!value || busy) return
    const problem = customerError(value)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try {
      const updated = await saveCustomer(value)
      setCustomers(items => [...items.filter(item => item.id !== updated.id), updated])
      setDraft(updated); setDirty(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Záznam se nepodařilo uložit.') }
    finally { setBusy(false) }
  }
  const addDemo = () => {
    if (!buildingId) return
    const firstPremise = distributions.find(item => item.pointId === buildingId)?.premises[0]?.id ?? null
    void save(demoCustomer(buildingId, firstPremise))
  }
  const remove = async () => {
    const current = customers.find(item => item.id === draft?.id)
    if (!current || !window.confirm(`Odebrat zákazníka ${current.name} včetně kontaktů a ručních záznamů zpráv?`)) return
    setBusy(true); setError('')
    try { await deleteCustomer(current); setCustomers(items => items.filter(item => item.id !== current.id));
      setDraft(null); setDirty(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Záznam se nepodařilo odebrat.') }
    finally { setBusy(false) }
  }
  const addContact = () => {
    if (!draft) return
    edit({ ...draft, contacts: [...draft.contacts,
      { id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' }] })
  }
  const patchContact = (id: string, patch: Partial<CustomerContact>) => {
    if (draft) edit({ ...draft, contacts: draft.contacts.map(contact => contact.id === id ? { ...contact, ...patch } : contact) })
  }
  const addMessage = () => {
    if (!draft || !messageInput.subject.trim() || !messageInput.date) return
    edit({ ...draft, messages: [...draft.messages, { ...messageInput, id: crypto.randomUUID() }] })
    setAddingMessage(false)
    setMessageInput({ subject: '', sender: '', date: new Date().toISOString().slice(0, 10),
      category: 'request', status: 'todo', summary: '' })
  }
  const visibleMessages = draft?.messages.filter(message => messageFilter === 'all' || message.status === messageFilter)
    .sort((a, b) => b.date.localeCompare(a.date)) ?? []
  const todoCount = (record: CustomerRecord | CustomerDraft) => record.messages.filter(message => message.status === 'todo').length

  return <div className="customer-panel">
    {!draft ? <>
      <header className="customer-panel-heading"><div><span className="section-label">ZÁKAZNICKÝ PŘEHLED</span>
        <h1>{building && !showAll ? building.name : 'Zákazníci'}</h1>
        <p>{building && !showAll ? 'Klienti přiřazení k vybrané budově' : 'Kontakty a komunikace podle budov'}</p></div>
        <button type="button" className="icon-button" title="Obnovit zákazníky" aria-label="Obnovit zákazníky"
          onClick={() => { setLoading(true); setError(''); void listCustomers().then(setCustomers)
            .catch(reason => setError(reason instanceof Error ? reason.message : 'Zákazníci se nenačetli.'))
            .finally(() => setLoading(false)) }}><RefreshCw size={16} /></button></header>
      <div className="customer-intro"><Users size={17} /><span>Prototyp pro fiktivní údaje. Zprávy se zadávají ručně; poštovní schránka není připojena.</span></div>
      {building && <button type="button" className="customer-scope" onClick={() => setShowAllFor(showAll ? null : buildingId)}>
        {showAll ? 'Zobrazit jen tuto budovu' : 'Zobrazit všechny budovy'} <ChevronRight size={15} /></button>}
      <div className="customer-list-tools"><label className="search-field"><Search size={16} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Hledat klienta nebo kontakt"
          aria-label="Hledat zákazníka" /></label>
        <button type="button" className="primary-button" disabled={buildings.length === 0 || busy} onClick={start}><Plus size={15} /> Přidat zákazníka</button></div>
      {error && <p className="customer-error" role="alert">{error}</p>}
      {loading ? <p className="customer-empty">Načítání zákazníků…</p> : filtered.length === 0 ?
        <div className="customer-empty-card"><Users size={22} /><strong>{query ? 'Nic nenalezeno' : 'Zatím žádní zákazníci'}</strong>
          <p>{query ? 'Zkuste jiné hledání.' : building && !showAll
            ? 'K této budově můžete přidat klienta nebo si vložit fiktivní ukázku.'
            : 'Vyberte budovu na mapě a založte jejího prvního klienta.'}</p>
          {building && !showAll && !query && <button type="button" className="move-button" disabled={busy}
            onClick={addDemo}>Vložit ukázkového klienta</button>}</div> :
        <div className="customer-list">{filtered.map(customer => <button type="button" key={customer.id}
          className="customer-list-card" onClick={() => open(customer)}>
          <span className="customer-avatar"><Users size={19} /></span><span className="customer-list-copy"><strong>{customer.name}</strong>
            <small>{buildingName(customer.buildingPointId)} · {premiseName(customer.premiseId, customer.buildingPointId)}</small>
            <span>{countCzech(customer.contacts.length, 'kontakt', 'kontakty', 'kontaktů')} · {countCzech(customer.messages.length, 'zpráva', 'zprávy', 'zpráv')}{todoCount(customer) > 0 ? ` · ${todoCount(customer)} k vyřízení` : ''}</span></span>
          <ChevronRight size={17} /></button>)}</div>}
    </> : <>
      <button type="button" className="customer-back" onClick={leaveDetail}><ArrowLeft size={16} /> Seznam zákazníků</button>
      <header className="customer-detail-heading"><span className="section-label">KARTA ZÁKAZNÍKA</span>
        <h1>{draft.name.trim() || 'Nový zákazník'}</h1>
        <span className={`customer-status ${draft.status}`}>{draft.status === 'active' ? 'Aktivní' : 'Zájemce'}</span></header>
      <details className="customer-meta" key={draft.id ?? 'new'} open={!draft.id || undefined}>
        <summary><span>Údaje a vazba</span><small>{buildingName(draft.buildingPointId)} · {premiseName(draft.premiseId, draft.buildingPointId)}</small></summary>
      <div className="customer-fields"><label>Název zákazníka<input value={draft.name} maxLength={120}
        placeholder="Např. bytové družstvo" onChange={event => edit({ ...draft, name: event.target.value })} /></label>
        <label>Stav<select value={draft.status} onChange={event => edit({ ...draft, status: event.target.value as CustomerDraft['status'] })}>
          <option value="lead">Zájemce</option><option value="active">Aktivní</option></select></label>
        <label>Budova<select value={draft.buildingPointId} onChange={event => edit({ ...draft,
          buildingPointId: event.target.value, premiseId: null })}><option value="">Vyberte budovu</option>
          {buildings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Přípojné místo (HP)<select value={draft.premiseId ?? ''} disabled={!draft.buildingPointId}
          onChange={event => edit({ ...draft, premiseId: event.target.value || null })}><option value="">Bez vazby na HP</option>
          {premises.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <button type="button" className="customer-map-link" onClick={() => onShowBuilding(draft.buildingPointId)}
          disabled={!draft.buildingPointId || !buildings.some(item => item.id === draft.buildingPointId)}><MapPin size={14} /> Otevřít budovu v mapě</button>
        <label>Poznámka<textarea value={draft.note} maxLength={2000} rows={2} placeholder="Nepovinná poznámka"
          onChange={event => edit({ ...draft, note: event.target.value })} /></label></div>
      </details>
      <nav className="customer-detail-tabs" aria-label="Detail zákazníka">
        <button type="button" aria-pressed={detailTab === 'contacts'} onClick={() => setDetailTab('contacts')}>Kontakty <span>{draft.contacts.length}</span></button>
        <button type="button" aria-pressed={detailTab === 'messages'} onClick={() => setDetailTab('messages')}>Zprávy <span>{draft.messages.length}</span></button>
      </nav>
      {detailTab === 'contacts' ? <section className="customer-detail-section" aria-label="Kontakty">
        <div className="customer-section-title"><strong>Kontaktní osoby</strong><button type="button" onClick={addContact}><Plus size={14} /> Kontakt</button></div>
        {draft.contacts.length === 0 && <p className="customer-empty">Zatím bez kontaktů.</p>}
        {draft.contacts.map((contact, index) => <div className="customer-contact-card" key={contact.id}>
          <div className="customer-item-heading"><strong>Kontakt {index + 1}</strong><button type="button" className="icon-button"
            aria-label={`Odebrat kontakt ${index + 1}`} onClick={() => edit({ ...draft,
              contacts: draft.contacts.filter(item => item.id !== contact.id) })}><Trash2 size={14} /></button></div>
          <label>Jméno<input value={contact.name} maxLength={120} placeholder="Jméno kontaktu"
            onChange={event => patchContact(contact.id, { name: event.target.value })} /></label>
          <label>Role<input value={contact.role} maxLength={80} placeholder="Např. správce objektu"
            onChange={event => patchContact(contact.id, { role: event.target.value })} /></label>
          <label>E-mail<input type="email" value={contact.email} maxLength={200} placeholder="kontakt@example.invalid"
            onChange={event => patchContact(contact.id, { email: event.target.value })} /></label>
          <label>Telefon<input type="tel" value={contact.phone} maxLength={80} placeholder="Nepovinné"
            onChange={event => patchContact(contact.id, { phone: event.target.value })} /></label>
        </div>)}</section> : <section className="customer-detail-section" aria-label="Zprávy">
        <div className="customer-section-title"><strong>Přiřazené zprávy</strong><button type="button" onClick={() => setAddingMessage(true)}>
          <Plus size={14} /> Záznam</button></div>
        <p className="customer-message-hint"><Mail size={14} /> Ruční přehled pro prototyp. Zprávy se zatím nenačítají ze schránky.</p>
        <div className="customer-message-filters" aria-label="Filtr zpráv">
          {([['all', 'Vše'], ['todo', 'K vyřízení'], ['done', 'Vyřízené']] as const).map(([value, label]) =>
            <button type="button" key={value} aria-pressed={messageFilter === value} onClick={() => setMessageFilter(value)}>{label}</button>)}</div>
        {addingMessage && <div className="customer-message-form"><strong>Nový záznam zprávy</strong>
          <label>Předmět<input value={messageInput.subject} maxLength={180} onChange={event => setMessageInput({ ...messageInput,
            subject: event.target.value })} /></label>
          <label>Odesílatel<input value={messageInput.sender} maxLength={200} onChange={event => setMessageInput({ ...messageInput,
            sender: event.target.value })} /></label>
          <label>Datum<input type="date" value={messageInput.date} onChange={event => setMessageInput({ ...messageInput,
            date: event.target.value })} /></label>
          <label>Kategorie<select value={messageInput.category} onChange={event => setMessageInput({ ...messageInput,
            category: event.target.value as CustomerMessage['category'] })}>
            {Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Stav<select value={messageInput.status} onChange={event => setMessageInput({ ...messageInput,
            status: event.target.value as MessageStatus })}><option value="todo">K vyřízení</option><option value="done">Vyřízené</option></select></label>
          <label>Stručná poznámka<textarea value={messageInput.summary} maxLength={1000} rows={2}
            onChange={event => setMessageInput({ ...messageInput, summary: event.target.value })} /></label>
          <div className="customer-message-actions"><button type="button" onClick={() => setAddingMessage(false)}>Zrušit</button>
            <button type="button" className="primary-button" disabled={!messageInput.subject.trim() || !messageInput.date}
              onClick={addMessage}>Přidat do přehledu</button></div></div>}
        {visibleMessages.length === 0 && <p className="customer-empty">V tomto filtru nejsou žádné zprávy.</p>}
        {visibleMessages.map(message => <article className="customer-message-card" key={message.id}>
          <div className="customer-item-heading"><span className={`customer-message-status ${message.status}`}>
            {message.status === 'todo' ? 'K vyřízení' : 'Vyřízené'}</span><small>{message.date}</small></div>
          <strong>{message.subject}</strong><small>{categoryLabel[message.category]}{message.sender && ` · ${message.sender}`}</small>
          {message.summary && <p>{message.summary}</p>}
          <button type="button" onClick={() => edit({ ...draft, messages: draft.messages.map(item => item.id === message.id
            ? { ...item, status: item.status === 'todo' ? 'done' : 'todo' } : item) })}>
            <Check size={13} /> {message.status === 'todo' ? 'Označit vyřízené' : 'Vrátit k vyřízení'}</button>
        </article>)}</section>}
      {error && <p className="customer-error" role="alert">{error}</p>}
      <div className={`customer-save-bar${dirty ? ' is-dirty' : ''}`}>
        {dirty ? <button type="button" className="primary-button" onClick={() => void save()}
          disabled={busy}><Save size={15} /> {busy ? 'Ukládání…' : 'Uložit zákazníka'}</button>
          : <span className="customer-saved"><Check size={15} /> Vše uloženo</span>}
        {draft.id && <button type="button" className="customer-delete" disabled={busy} onClick={() => void remove()}>
          <Trash2 size={15} /> Odebrat zákazníka</button>}</div>
    </>}
  </div>
}
