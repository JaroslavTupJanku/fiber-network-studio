import { ExternalLink, Download } from 'lucide-react'
import { profileLabel, type CableInput, type ColorCodeData } from './model'

export function ColorCodeInfo({ cable, data }: { cable: CableInput; data: ColorCodeData }) {
  const profiles = data.profiles.filter(profile => [cable.fiberColorCode, cable.tubeColorCode].includes(profile.id))
  return <div className="cc-code-info">
    <dl><div><dt>Značení vláken</dt><dd>{profileLabel(data, cable.fiberColorCode)}</dd></div>
      <div><dt>Značení tub</dt><dd>{profileLabel(data, cable.tubeColorCode)}</dd></div></dl>
    <details><summary>Zdroje a podrobnosti značení</summary>
    {profiles.map(profile => <div className="cc-profile-source" key={profile.id}><p>{profile.note}</p>
      <a href={profile.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />{profile.sourceLabel}</a></div>)}
    {cable.sourceUrl && <a href={cable.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />Technický list tohoto kabelu</a>}
    <a href="/api/cable-catalog/color-codes/download" download><Download size={13} />Stáhnout tabulky značení (JSON)</a>
    </details>
  </div>
}
