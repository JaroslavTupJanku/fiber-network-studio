import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, Copy, Layers3, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { listCables } from '../cable-catalog/api'
import type { CableSpecification } from '../cable-catalog/model'
import { DuctDiagram } from './DuctDiagram'
import { DuctEditor } from './DuctEditor'
import { cableFit, kindLabel, type DuctType } from './model'
import { useDuctCatalog } from './useDuctCatalog'
import './duct-catalog.css'

function FitPreview({ item, cables }: { item: DuctType; cables: CableSpecification[] }) {
  const [cableId, setCableId] = useState('')
  const cable = cables.find(value => value.id === cableId)
  const channels = item.kind === 'assembly' ? item.slots.map(slot => slot.innerDiameterMm) : [item.innerDiameterMm]
  const outcomes = cable ? channels.map(inner => cableFit(cable, inner)) : []
  return <section className="dc-fit"><div className="cc-section-title"><h3>Kontrola kabelu</h3></div>
    <p>Vyberte kabel z katalogu. Kontrolujeme jen průměry, bez délky trasy a podmínek instalace.</p>
    <label>Kabel<select value={cableId} onChange={event => setCableId(event.target.value)}><option value="">Vyberte kabel…</option>
      {cables.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
    {cable && <div className="dc-fit-result"><strong>{outcomes.every(value => value === 'unknown') ? 'Rozměry nelze posoudit' : outcomes.some(value => value === 'possible')
      ? `${outcomes.filter(value => value === 'possible').length} ${outcomes.length === 1 ? 'průchod rozměrově možný' : 'pozic rozměrově možných'}` : 'Kabel je pro známé pozice příliš velký'}</strong>
      <p>Kabel: {cable.outerDiameterMm === null ? 'vnější Ø neznámý' : `vnější Ø ${cable.outerDiameterMm} mm`}; požadované minimum trubičky: {cable.minimumDuctInnerDiameterMm === null ? 'neuvedeno' : `${cable.minimumDuctInnerDiameterMm} mm`}.</p>
      {outcomes.includes('unknown') && <p>U {outcomes.filter(value => value === 'unknown').length} pozic chybí rozměr pro posouzení.</p>}
      <small>Výsledek „možný“ není souhlas výrobce s instalací. Ověřte technické listy a způsob pokládky.</small></div>}
    {cables.length === 0 && <p>V katalogu kabelů zatím není žádný kabel k porovnání.</p>}
  </section>
}

function DuctDetail({ item, busy, cables, onEdit, onDuplicate, onRemove }: {
  item: DuctType; busy: boolean; cables: CableSpecification[]; onEdit: () => void; onDuplicate: () => void; onRemove: () => void
}) {
  return <><div className="cc-detail-heading"><div><span className="cc-eyebrow">{kindLabel(item.kind).toUpperCase()}</span><h2>{item.name}</h2>
    <p className="cc-muted">{[item.manufacturer, item.model].filter(Boolean).join(' · ') || 'Obecná šablona bez výrobce'}</p></div>
    <span className={`cc-badge ${item.isPreset ? '' : 'cc-badge-custom'}`}>{item.isPreset ? item.sourceUrl ? 'Vzorový výrobek' : 'Obecná šablona' : 'Vlastní typ'}</span></div>
    <div className="cc-detail-actions"><button type="button" className="cc-button cc-primary" disabled={busy} onClick={onDuplicate}><Copy size={16} /> Vytvořit kopii</button>
      {!item.isPreset && <><button type="button" className="cc-button" disabled={busy} onClick={onEdit}><Pencil size={16} /> Upravit</button>
        <button type="button" className="cc-button cc-delete" disabled={busy} onClick={onRemove}><Trash2 size={16} /> Smazat</button></>}</div>
    <div className="dc-specs"><div><span>Druh</span><strong>{kindLabel(item.kind)}</strong></div>
      {item.kind === 'assembly' ? <div><span>Rozložení</span><strong>{item.rows} × {item.columns} · {item.slots.length} pozic</strong></div>
        : <><div><span>Vnější průměr</span><strong>{item.outerDiameterMm === null ? 'Neuveden' : `${item.outerDiameterMm} mm`}</strong></div>
          <div><span>Vnitřní průměr</span><strong>{item.innerDiameterMm === null ? 'Neuveden' : `${item.innerDiameterMm} mm`}</strong></div></>}</div>
    <DuctDiagram item={item} />
    {item.kind === 'assembly' && <div className="dc-slot-list"><h3>Pozice sestavy</h3><div>{item.slots.map((slot, index) => <div key={index}><span className="dc-small-dot" style={{ background: slot.color }} /><strong>{index + 1}. {slot.name}</strong><span>{kindLabel(slot.kind)}</span><span>{slot.outerDiameterMm === null ? 'Ø ?' : `Ø ${slot.outerDiameterMm}`} / {slot.innerDiameterMm === null ? '?' : slot.innerDiameterMm} mm</span></div>)}</div></div>}
    {item.notes && <p className="dc-notes">{item.notes}</p>}
    {item.sourceUrl && <a className="dc-source" href={item.sourceUrl} target="_blank" rel="noreferrer">Technický list výrobku ↗</a>}
    <FitPreview item={item} cables={cables} />
    {item.isPreset && <p className="cc-preset-note"><Copy size={16} /> {item.sourceUrl
      ? 'Údaje jsou převzaté z uvedeného technického listu. Ověřte jeho aktuálnost a pro úpravy vytvořte kopii.'
      : 'Obecná šablona není technický list výrobku. Pro vlastní hodnoty vytvořte kopii.'}</p>}
  </>
}

export function DuctCatalogPage({ active, navigation }: { active: boolean; navigation?: ReactNode }) {
  const catalog = useDuctCatalog()
  const [cables, setCables] = useState<CableSpecification[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'conduit' | 'microduct' | 'assembly'>('all')
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    listCables(abort.signal).then(setCables).catch(() => {})
    return () => abort.abort()
  }, [active])
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs')
  const matches = catalog.items.filter(item => (filter === 'all' || item.kind === filter)
    && normalize(`${item.name} ${item.manufacturer} ${item.model}`).includes(normalize(query.trim())))
  return <main className="cable-catalog duct-catalog" aria-label="Katalog chrániček a mikrotrubiček">
    <div className="cc-page-heading"><div><span className="cc-eyebrow">KNIHOVNA INFRASTRUKTURY</span><h1>Chráničky a mikrotrubičky</h1>
      <p>Typy chrániček, mikrotrubiček a sestav, které můžete vložit do mapových tras.</p>{navigation}</div>
      <div className="dc-create-actions"><button type="button" className="cc-button cc-primary" disabled={catalog.loading || catalog.busy} onClick={() => catalog.create('conduit')}><Plus size={17} /> Chránička</button>
        <button type="button" className="cc-button" disabled={catalog.loading || catalog.busy} onClick={() => catalog.create('microduct')}><Plus size={17} /> Mikrotrubička</button>
        <button type="button" className="cc-button" disabled={catalog.loading || catalog.busy} onClick={() => catalog.create('assembly')}><Plus size={17} /> Sestava</button></div></div>
    <div className="cc-layout"><aside className="cc-sidebar" aria-label="Seznam typů"><div className="cc-sidebar-top"><h2>Typy <span>{catalog.items.length}</span></h2>
      <button type="button" className="cc-icon-button" disabled={catalog.loading || catalog.busy} title="Načíst znovu" aria-label="Načíst katalog znovu" onClick={catalog.reload}><RefreshCw size={16} /></button></div>
      <label className="cc-search"><Search size={17} /><input aria-label="Hledat typ" placeholder="Název, výrobce, model…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="dc-filters" aria-label="Filtr druhů">{([['all', 'Vše'], ['conduit', 'Chráničky'], ['microduct', 'Mikrotrubičky'], ['assembly', 'Sestavy']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {catalog.loading ? <div className="cc-empty" role="status">Načítání katalogu…</div> : <ul className="cc-cable-list">{matches.map(item => <li key={item.id}><button type="button" className="cc-cable-card" aria-current={!catalog.draft && catalog.selected?.id === item.id ? 'true' : undefined}
        disabled={catalog.busy} onClick={() => catalog.select(item.id)}><span className="cc-card-icon"><Layers3 size={19} /></span><span className="cc-card-text"><strong>{item.name}</strong>
        <small>{kindLabel(item.kind)}{item.kind === 'assembly' ? ` · ${item.rows} × ${item.columns}` : item.outerDiameterMm ? ` · Ø ${item.outerDiameterMm} mm` : ''}</small>
        <span className="cc-card-bottom"><span>{item.isPreset ? item.sourceUrl ? 'Vzorový výrobek' : 'Šablona' : 'Vlastní'}</span><span>{item.manufacturer}</span></span></span><ArrowUpRight size={15} className="cc-card-arrow" /></button></li>)}</ul>}
      {!catalog.loading && matches.length === 0 && <div className="cc-empty"><Search size={23} /><strong>Žádný odpovídající typ</strong><p>Zkuste jiný název nebo filtr.</p></div>}
      <div className="cc-sidebar-note"><Layers3 size={18} /><p>Zde upravujete typy. Konkrétní prvky vložíte do vybrané mapové trasy v panelu Osazení.</p></div>
    </aside><section className="cc-detail" aria-label="Detail typu" aria-busy={catalog.busy}>
      {catalog.error && <div className="cc-error" role="alert"><span>{catalog.error}</span><button type="button" className="cc-button" disabled={catalog.busy || catalog.loading} onClick={catalog.reload}>Načíst znovu</button></div>}
      {catalog.notice && <div className="cc-success" role="status"><Check size={16} />{catalog.notice}</div>}
      {catalog.draft ? <DuctEditor draft={catalog.draft} busy={catalog.busy} dirty={catalog.dirty} onChange={catalog.setDraft} onSave={catalog.save} onCancel={catalog.cancel} />
        : catalog.selected ? <DuctDetail key={catalog.selected.id} item={catalog.selected} cables={cables} busy={catalog.busy}
          onEdit={() => catalog.edit(catalog.selected!)} onDuplicate={() => catalog.duplicate(catalog.selected!)} onRemove={() => catalog.remove(catalog.selected!)} />
          : <div className="cc-empty"><Layers3 size={36} /><h2>Vyberte typ</h2><p>Prohlédněte si průřez nebo vytvořte vlastní specifikaci.</p></div>}
    </section></div>
  </main>
}
