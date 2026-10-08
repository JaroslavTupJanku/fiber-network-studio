import { Plus, Trash2 } from 'lucide-react'
import type { CableSpecification } from '../cable-catalog/model'
import { emptyIndoorLosses, indoorRunFromCatalog, indoorWavelengths, newIndoorCableRun,
  type IndoorCableRun, type IndoorLosses, type IndoorLossKey } from './indoorCable'

type Props = {
  direct?: boolean
  run: IndoorCableRun | null | undefined
  cables: CableSpecification[]
  catalogError: string
  onChange: (run: IndoorCableRun | null) => void
}

const optionalNumber = (value: string) => value.trim() === '' ? null : Number(value.replace(',', '.'))

function LossFields({ title, values, unit, onChange }: {
  title: string; values: IndoorLosses; unit: string; onChange: (values: IndoorLosses) => void
}) {
  return <div className="distribution-indoor-losses"><strong>{title}</strong><div>
    {indoorWavelengths.map(wave => {
      const key: IndoorLossKey = `loss${wave}`
      return <label className="equipment-field" key={wave}>{wave} nm <span>{unit}</span>
        <input type="number" min="0" max="100" step="any" inputMode="decimal" value={values[key] ?? ''}
          aria-label={`${title} · ${wave} nm`} placeholder="Neznámé"
          onChange={event => onChange({ ...values, [key]: optionalNumber(event.target.value) })} /></label>
    })}</div></div>
}

export function IndoorCableFields({ run, cables, catalogError, onChange, direct = false }: Props) {
  const selectedCatalogMissing = !!run?.catalogCableId && !cables.some(cable => cable.id === run.catalogCableId)
  return <section className="distribution-indoor" aria-label="Domovní přívod k HP">
    <div className="distribution-indoor-heading"><div><small>OPTICKÁ CESTA V BUDOVĚ</small><h4>Domovní přívod k HP</h4></div>
      {run && <button type="button" className="icon-button" title="Odebrat evidenci přívodu" aria-label="Odebrat evidenci domovního přívodu"
        onClick={() => { if (window.confirm('Odebrat evidenci domovního přívodu k tomuto HP?')) onChange(null) }}><Trash2 size={16} /></button>}</div>
    {!run ? <><p>{direct ? 'Přívod uvnitř domu a jeho ztráty zatím nejsou evidované. Doplňte je, pokud je mezi přívodním kabelem a zákazníkem další úsek.' : 'Od podlažního boxu k HP zatím není evidován kabel ani jeho ztráty.'}</p>
      <button type="button" className="move-button" onClick={() => onChange(newIndoorCableRun())}><Plus size={15} /> Evidovat přívod</button></>
      : <>
        <p>Zadejte údaje použitého přívodu. Prázdné pole znamená neznámou hodnotu; nula znamená potvrzenou nulu.</p>
        <label className="equipment-field">Označení domovního přívodu
          <input maxLength={120} value={run.cableName} placeholder={direct ? 'Např. přívod uvnitř domu' : 'Např. kabel od boxu k HP'}
            onChange={event => onChange({ ...run, cableName: event.target.value })} /></label>
        <details className="distribution-indoor-more">
          <summary>Převzít kabel z katalogu</summary>
          <p>{direct ? 'Vyberte jen typ skutečně použitého přívodu uvnitř domu.' : 'Vyberte jen typ, který je skutečně použitý mezi boxem a HP.'} Výchozí katalog obsahuje i kabely pro venkovní trasu.</p>
          <label className="equipment-field">Katalogový typ
          <select value={run.catalogCableId ?? ''} onChange={event => {
            const cable = cables.find(item => item.id === event.target.value)
            onChange(cable ? indoorRunFromCatalog(run, cable) : {
              ...run, catalogCableId: null, cableName: '', attenuationDbPerKm: emptyIndoorLosses(), source: '',
            })
          }}><option value="">Vlastní označení</option>
            {selectedCatalogMissing && <option value={run.catalogCableId!}>Uložený typ (již není v katalogu)</option>}
            {cables.map(cable => <option key={cable.id} value={cable.id}>{cable.name}</option>)}
          </select></label>
          {catalogError && <small className="distribution-indoor-note">Katalog není dostupný; typ můžete zadat ručně.</small>}
        </details>
        <label className="equipment-field">Skutečná délka včetně rezerv <span>m</span>
          <input type="number" min="0.001" max="10000" step="any" inputMode="decimal" value={run.lengthMeters ?? ''}
            placeholder="Zatím neznámá" onChange={event => onChange({ ...run, lengthMeters: optionalNumber(event.target.value) })} /></label>
        <details className="distribution-indoor-more"><summary>Útlum kabelu podle vlnové délky</summary>
          <LossFields title="Útlum kabelu" values={run.attenuationDbPerKm} unit="dB/km"
            onChange={attenuationDbPerKm => onChange({ ...run, attenuationDbPerKm })} />
          <p>Hodnoty 1310/1550 nm se při výběru kabelu převezmou z katalogu. Ostatní doplňte jen podle podkladů.</p>
        </details>
        <details className="distribution-indoor-more"><summary>Svary a konektorové spoje</summary>
          <label className="equipment-field">Počet svarů <span>0 = žádný</span>
            <input type="number" min="0" max="100" step="1" value={run.spliceCount ?? ''} placeholder="Neznámý"
              onChange={event => { const spliceCount = optionalNumber(event.target.value); onChange({ ...run,
                spliceCount, spliceLossDb: spliceCount === null || spliceCount === 0 ? emptyIndoorLosses() : run.spliceLossDb }) }} /></label>
          {run.spliceCount !== null && run.spliceCount > 0 && <LossFields title="Ztráta jednoho svaru" values={run.spliceLossDb} unit="dB/ks"
            onChange={spliceLossDb => onChange({ ...run, spliceLossDb })} />}
          <label className="equipment-field">Počet konektorových párů <span>0 = žádný</span>
            <input type="number" min="0" max="100" step="1" value={run.connectorPairCount ?? ''} placeholder="Neznámý"
              onChange={event => { const connectorPairCount = optionalNumber(event.target.value); onChange({ ...run,
                connectorPairCount, connectorLossDb: connectorPairCount === null || connectorPairCount === 0 ? emptyIndoorLosses() : run.connectorLossDb }) }} /></label>
          {run.connectorPairCount !== null && run.connectorPairCount > 0 && <LossFields title="Ztráta jednoho konektorového páru" values={run.connectorLossDb} unit="dB/ks"
            onChange={connectorLossDb => onChange({ ...run, connectorLossDb })} />}
          <p>Konektorový spoj je jeden spojený pár. Neznámý počet nebo útlum ponechá bilanci neúplnou.</p>
        </details>
        <label className="equipment-field">Zdroj hodnot <span>technický list, měření nebo poznámka</span>
          <input maxLength={2000} value={run.source} placeholder="Nepovinné"
            onChange={event => onChange({ ...run, source: event.target.value })} /></label>
      </>}
  </section>
}
