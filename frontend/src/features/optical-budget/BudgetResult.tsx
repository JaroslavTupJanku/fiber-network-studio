import { calculate, directionLabel, ponWavelengths, type Scenario } from './model'

const format = (value: number) => value.toLocaleString('cs-CZ', { maximumFractionDigits: 6 })
export function BudgetResult({ result, scenario, onAdvanced }: { result: ReturnType<typeof calculate>; scenario: Scenario; onAdvanced: () => void }) {
  const titles = { unknown: 'Posouzení není úplné', pass: 'Ztráta v limitu včetně rezervy', fail: 'Zadaný limit nestačí', boundary: 'Přesně na hranici limitu' }
  return <aside className="ob-result ob-panel" aria-label="Výsledek výpočtu">
    <span className="ob-eyebrow">BILANCE · {scenario.wavelength} nm</span><h2>Odhad ztráty trasy</h2>
    <p className="ob-source">{directionLabel(scenario)}</p>
    <div className="ob-total" aria-live="polite">{result.total === null ? '—' : format(result.total)} <small>dB</small></div>
    <p className="ob-muted">Součet kabelů a pasivních prvků. Bez návrhové rezervy.</p>
    {result.errors.length > 0 && <div className="ob-message"><strong>Doplňte zadání</strong><ul>{result.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
    {result.rows.length > 0 && <div className="ob-breakdown">{result.rows.map(row => <div key={row.id}>
      <div><span>{row.name}</span><strong>{row.loss === null ? 'Neuvedeno' : `${format(row.loss)} dB`}</strong></div>
      <div className="ob-bar" aria-hidden="true"><i style={{ width: `${result.total && row.loss !== null ? row.loss / result.total * 100 : 0}%` }} /></div>
    </div>)}</div>}
    <dl className="ob-totals"><div><dt>Povolená ztráta</dt><dd>{result.limit === null ? 'Neuvedeno' : `${format(result.limit)} dB`}</dd></div>
      <div><dt>Požadovaná rezerva</dt><dd>{result.reserve === null ? 'Neuvedeno' : `${format(result.reserve)} dB`}</dd></div>
      <div><dt>Zbývá nad rezervu</dt><dd>{result.margin === null ? '—' : `${format(result.margin)} dB`}</dd></div></dl>
    <div className={`ob-verdict ob-${result.verdict}`} role="status"><strong>{titles[result.verdict as keyof typeof titles]}</strong>
      {result.margin === null && <p>Pro posouzení doplňte všechny ztráty, povolený limit a rezervu. Nulovou rezervu zadejte výslovně.</p>}</div>
    <button className="ob-text-button" onClick={onAdvanced}>Upravit limit a rezervu</button>
    {scenario.technology !== 'manual' && <div className="ob-directions"><h3>Oba směry přenosu</h3>
      {Object.entries(ponWavelengths[scenario.technology]).map(([direction, wavelength]) => {
        const value = calculate({ ...scenario, wavelength })
        return <div key={direction}><strong>{direction === 'downstream' ? 'K zákazníkovi' : 'Od zákazníka'} · {wavelength} nm</strong>
          <span>{value.total === null ? 'Chybí údaje o ztrátách' : `${format(value.total)} dB`}</span><small>{titles[value.verdict as keyof typeof titles]}</small></div>
      })}<p className="ob-muted">Každý směr se posuzuje zvlášť. Vyhovující výsledek jednoho směru neznamená, že vyhovuje celý spoj.</p>
    </div>}
    <p className="ob-muted">Tento přehled kontroluje limit ztráty trasy. Kontrolu citlivosti a přetížení přijímačů podle vybraných profilů najdete v části Zařízení. Skutečnou trasu ověřte měřením.</p>
    <details className="ob-method"><summary>Jak se výsledek počítá</summary>
      <p>Kabel: délka v metrech ÷ 1000 × útlum v dB/km. Pasivní prvek: počet × ztráta v dB. Vše pro vybranou vlnovou délku.</p>
      <p>Zbývající prostor = povolená ztráta − ztráta trasy − požadovaná rezerva. Útlum se nenásobí počtem vláken; počítáme jednu optickou cestu.</p>
      <a href="https://thefoa.org/tech/lossbudg.htm" target="_blank" rel="noreferrer">FOA: výpočet optických ztrát ↗</a>
    </details>
  </aside>
}
