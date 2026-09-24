import type { CableInput } from './model'

const fields = [
  ['attenuation1310DbPerKm', '1310 nm'],
  ['attenuation1550DbPerKm', '1550 nm'],
] as const

export function CableAttenuation({ cable, onChange }: {
  cable: CableInput; onChange?: (key: typeof fields[number][0], value: number | null) => void
}) {
  return <section className="cc-attenuation" aria-label="Útlum kabelu">
    <h3>Útlum kabelu <span className="cc-optional">nepovinné</span></h3>
    {onChange ? <>
      <p>Hodnoty z technického listu v dB/km. Neznámé údaje ponechte prázdné.</p>
      <div className="cc-fields">{fields.map(([key, wavelength]) => <label key={key}>
        {wavelength} · dB/km
        <input type="number" inputMode="decimal" min={0} step="any" aria-label={`Útlum ${wavelength} (dB/km)`}
          placeholder="Neuvedeno" value={cable[key] ?? ''}
          onChange={event => onChange(key, event.target.value === '' ? null : Number(event.target.value))} />
      </label>)}</div>
    </> : <dl>{fields.map(([key, wavelength]) => <div key={key}><dt>{wavelength}</dt>
      <dd>{cable[key] == null ? 'Neuvedeno' : `${cable[key].toLocaleString('cs-CZ', { maximumFractionDigits: 10 })} dB/km`}</dd>
    </div>)}</dl>}
  </section>
}
