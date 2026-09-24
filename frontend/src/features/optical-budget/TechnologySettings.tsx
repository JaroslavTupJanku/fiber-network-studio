import { changeTechnology, directionLabel, ponWavelengths, technologies, wavelengths, type Scenario, type Technology, type Wavelength } from './model'

export function TechnologySettings({ scenario, onChange }: { scenario: Scenario; onChange: (scenario: Scenario) => void }) {
  return <div className="ob-technology">
    <div className="ob-fields"><label>Technologie<select aria-label="Technologie" value={scenario.technology}
      onChange={event => onChange(changeTechnology(scenario, event.target.value as Technology))}>
      {Object.entries(technologies).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
    </select></label>
    {scenario.technology === 'manual' ? <label>Vlnová délka<select aria-label="Vlnová délka" value={scenario.wavelength}
      onChange={event => onChange({ ...scenario, wavelength: event.target.value as Wavelength })}>
      {wavelengths.map(wave => <option value={wave} key={wave}>{wave} nm</option>)}
    </select></label> : <label>Směr přenosu<select aria-label="Směr přenosu" value={scenario.wavelength}
      onChange={event => onChange({ ...scenario, wavelength: event.target.value as Wavelength })}>
      <option value={ponWavelengths[scenario.technology].downstream}>K zákazníkovi · {ponWavelengths[scenario.technology].downstream} nm</option>
      <option value={ponWavelengths[scenario.technology].upstream}>Od zákazníka · {ponWavelengths[scenario.technology].upstream} nm</option>
    </select></label>}</div>
    <p className="ob-source">{directionLabel(scenario)} · {scenario.wavelength} nm</p>
    <p className="ob-muted">Technologie určuje vlnové délky. Útlumy doplňte pro každou zvlášť; chybějící hodnoty se neodhadují. Limity GPON, XGS-PON a vlastního nastavení se uchovávají odděleně.</p>
    {scenario.technology !== 'manual' && <details className="ob-method"><summary>Co profil nastavuje</summary>
      <p>OLT je zařízení operátora, ONT je koncové zařízení zákazníka. Profil určuje směry a nominální vlnové délky, nikoli třídu optiky nebo garantovaný dosah. Změna technologie zachová délky, prvky i již vyplněné útlumy pro jednotlivé vlnové délky.</p>
      <p>Podklady: <a href="https://resources.veexinc.com/assets/productdocs/FX120/content/procedures/gpon/opm-results.htm" target="_blank" rel="noreferrer">VeEX – GPON a XGS-PON</a>. XGS-PON zde používá základní pásmo 1577/1270 nm.</p>
    </details>}
  </div>
}
