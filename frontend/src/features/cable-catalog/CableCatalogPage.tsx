import { useState } from 'react'
import { ArrowUpRight, Cable, Check, Copy, Layers, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { CableEditor } from './CableEditor'
import { CableStructure } from './CableStructure'
import { countFibers, type CableSpecification, type ColorCodeData } from './model'
import { ColorCodeInfo } from './ColorCodeInfo'
import { CableAttenuation } from './CableAttenuation'
import { useCableCatalog } from './useCableCatalog'
import './cable-catalog.css'

function CableDetail({ cable, data, busy, onEdit, onDuplicate, onRemove }: {
  cable: CableSpecification; data: ColorCodeData; busy: boolean; onEdit: () => void; onDuplicate: () => void; onRemove: () => void
}) {
  const [activeTube, setActiveTube] = useState(0)
  return <>
    <div className="cc-detail-heading"><div><span className="cc-eyebrow">SPECIFIKACE KABELU</span><h2>{cable.name}</h2>
      <p className="cc-muted">{cable.manufacturer || 'Bez přiřazeného výrobce'}</p></div>
      <span className={`cc-badge ${cable.isPreset ? '' : 'cc-badge-custom'}`}>{cable.isPreset ? 'Výchozí šablona' : 'Vlastní kabel'}</span></div>
    <div className="cc-detail-actions">
      <button type="button" className="cc-button cc-primary" disabled={busy} onClick={onDuplicate}><Copy size={16} /> Vytvořit kopii</button>
      {!cable.isPreset && <><button type="button" className="cc-button" disabled={busy} onClick={onEdit}><Pencil size={16} /> Upravit</button>
        <button type="button" className="cc-button cc-delete" disabled={busy} onClick={onRemove}><Trash2 size={16} /> Smazat</button></>}
    </div>
    <div className="cc-stats"><div><strong>{countFibers(cable)}</strong><span>optických vláken</span></div>
      <div><strong>{cable.tubes.length}</strong><span>{cable.tubes.length === 1 ? 'tuba' : cable.tubes.length < 5 ? 'tuby' : 'tub'}</span></div>
      <div><strong>{new Set(cable.tubes.map(tube => tube.fibers.length)).size === 1 ? cable.tubes[0].fibers.length : 'Různý'}</strong><span>vláken v tubě</span></div></div>
    {cable.notes && <p className="cc-notes">{cable.notes}</p>}
    <div className="cc-code-info"><dl><div><dt>Vnější průměr kabelu</dt><dd>{cable.outerDiameterMm === null ? 'Neuveden' : `${cable.outerDiameterMm} mm`}</dd></div>
      <div><dt>Nejmenší vnitřní průměr trubičky</dt><dd>{cable.minimumDuctInnerDiameterMm === null ? 'Neuveden' : `${cable.minimumDuctInnerDiameterMm} mm`}</dd></div></dl></div>
    <CableAttenuation cable={cable} />
    <ColorCodeInfo cable={cable} data={data} />
    <div className="cc-section-title"><Layers size={18} /><h3>Struktura kabelu</h3><span>Vyberte tubu pro detail</span></div>
    <CableStructure cable={cable} data={data} activeTube={activeTube} onSelect={setActiveTube} />
    {cable.isPreset && <p className="cc-preset-note"><Copy size={16} /> Potřebujete jiné barvy nebo označení? Vytvořte si vlastní kopii.</p>}
  </>
}

export function CableCatalogPage() {
  const catalog = useCableCatalog()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'preset' | 'custom'>('all')
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs')
  const matches = catalog.items.filter(item => (filter === 'all' || item.isPreset === (filter === 'preset'))
    && normalize(`${item.name} ${item.manufacturer} ${countFibers(item)}`).includes(normalize(query.trim())))
  const customCount = catalog.items.filter(item => !item.isPreset).length

  return <main className="cable-catalog" aria-label="Katalog kabelů">
    <div className="cc-page-heading"><div><span className="cc-eyebrow">KNIHOVNA SÍTĚ</span><h1>Katalog kabelů</h1>
      <p>Typy kabelů, jejich tuby a vlákna na jednom místě.</p></div>
      <button type="button" className="cc-button cc-primary" disabled={catalog.loading || catalog.busy || catalog.items.length === 0}
        onClick={catalog.create}><Plus size={18} /> Nový typ kabelu</button></div>
    <div className="cc-layout">
      <aside className="cc-sidebar" aria-label="Seznam kabelů">
        <div className="cc-sidebar-top"><h2>Typy kabelů <span>{catalog.items.length}</span></h2>
          <button type="button" className="cc-icon-button" disabled={catalog.loading || catalog.busy} title="Načíst katalog znovu" aria-label="Načíst katalog znovu" onClick={catalog.reload}><RefreshCw size={16} /></button></div>
        <label className="cc-search"><Search size={17} /><input aria-label="Hledat kabel" placeholder="Název, výrobce, počet vláken…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="cc-filters" aria-label="Filtr kabelů">{([
          ['all', 'Vše'], ['preset', 'Šablony'], ['custom', `Vlastní (${customCount})`],
        ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {catalog.loading ? <div className="cc-empty" role="status">Načítání katalogu…</div> : <ul className="cc-cable-list">{matches.map(item => <li key={item.id}>
          <button type="button" className="cc-cable-card" aria-current={!catalog.draft && catalog.selected?.id === item.id ? 'true' : undefined}
            disabled={catalog.busy} onClick={() => catalog.select(item.id)}>
            <span className="cc-card-icon"><Cable size={20} /></span><span className="cc-card-text"><strong>{item.name}</strong>
              <small>{item.tubes.length} × {new Set(item.tubes.map(tube => tube.fibers.length)).size === 1 ? item.tubes[0].fibers.length : '…'} vláken{item.manufacturer ? ` · ${item.manufacturer}` : ''}</small>
              <span className="cc-card-bottom"><span>{item.isPreset ? 'Šablona' : 'Vlastní'}</span><span className="cc-swatches" aria-hidden="true">{item.tubes.slice(0, 8).map((tube, index) => <i key={index} style={{ background: tube.color }} />)}</span></span>
            </span><ArrowUpRight size={15} className="cc-card-arrow" />
          </button></li>)}</ul>}
        {!catalog.loading && matches.length === 0 && <div className="cc-empty"><Search size={24} /><strong>{filter === 'custom' && !query ? 'Zatím žádné vlastní kabely' : 'Žádný odpovídající kabel'}</strong>
          <p>{filter === 'custom' && !query ? 'Začněte kopií šablony nebo vytvořte nový typ.' : 'Zkuste jiný název nebo změňte filtr.'}</p></div>}
        <div className="cc-sidebar-note"><Layers size={18} /><p>Zde upravujete typy kabelů.<br />Konkrétní kabely vložíte do vybrané mapové trasy v panelu Osazení.</p></div>
      </aside>
      <section className="cc-detail" aria-label="Detail kabelu" aria-busy={catalog.busy}>
        {catalog.error && <div className="cc-error" role="alert"><span>{catalog.error}</span><button className="cc-button" type="button" disabled={catalog.busy || catalog.loading} onClick={catalog.reload}>Načíst znovu</button></div>}
        {catalog.notice && <div className="cc-success" role="status"><Check size={16} />{catalog.notice}</div>}
        {catalog.draft && catalog.colorCodes ? <CableEditor key={catalog.draftSession} data={catalog.colorCodes} draft={catalog.draft} busy={catalog.busy} dirty={catalog.dirty}
          onChange={catalog.setDraft} onSave={catalog.save} onCancel={catalog.cancel} />
          : catalog.selected && catalog.colorCodes ? <CableDetail key={catalog.selected.id} data={catalog.colorCodes} cable={catalog.selected} busy={catalog.busy}
            onEdit={() => catalog.edit(catalog.selected!)} onDuplicate={() => catalog.duplicate(catalog.selected!)} onRemove={() => catalog.remove(catalog.selected!)} />
            : <div className="cc-empty"><Cable size={36} /><h2>{catalog.loading ? 'Připravujeme katalog' : 'Vyberte typ kabelu'}</h2><p>Prohlédněte si jeho strukturu nebo vytvořte vlastní specifikaci.</p></div>}
      </section>
    </div>
  </main>
}
