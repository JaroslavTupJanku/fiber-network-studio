import type { CSSProperties } from 'react'
import { colorName, markingLabel, type ColorCodeData, type ColorMark } from './model'

export function ColorSwatch({ part, data }: { part: ColorMark; data: ColorCodeData }) {
  const style: CSSProperties = { backgroundColor: part.color }
  if (part.transparent) style.backgroundImage = 'repeating-conic-gradient(#fff 0% 25%, #d3dcd6 0% 50%)'
  return <span className="cc-color-swatch" style={style} role="img" aria-label={`${colorName(part, data)}, ${markingLabel(part, data)}`}>
    {part.marking === 'mark' && <i style={{ background: part.markerColor ?? '#808080' }} />}
  </span>
}

export function ColorMarkFields({ part, data, label, onChange }: {
  part: ColorMark; data: ColorCodeData; label: string; onChange: (value: ColorMark) => void
}) {
  const named = data.colors.some(color => color.hex.toLowerCase() === part.color.toLowerCase())
  return <div className="cc-mark-fields">
    <div className="cc-color-pick"><ColorSwatch part={part} data={data} />
      <select aria-label={`Barva ${label}`} value={part.transparent ? 'clear' : named ? part.color.toLowerCase() : 'custom'}
        onChange={event => onChange({ ...part, transparent: event.target.value === 'clear',
          color: event.target.value === 'clear' ? '#ffffff' : event.target.value === 'custom' ? '#808080' : event.target.value })}>
        {data.colors.map(color => <option key={color.hex} value={color.hex}>{color.name}</option>)}
        <option value="clear">Bezbarvá</option><option value="custom">Vlastní odstín</option>
      </select>
      {!named && !part.transparent && <input type="color" aria-label={`Vlastní odstín ${label}`} value={part.color} onChange={event => onChange({ ...part, color: event.target.value })} />}
    </div>
    <details className="cc-mark-options"><summary>{markingLabel(part, data)}</summary>
      <label>Značení<select aria-label={`Značení ${label}`} value={part.marking} onChange={event => onChange({ ...part,
        marking: event.target.value as ColorMark['marking'], markerColor: null, markingSpacingMm: null })}>
        <option value="none">Bez značky</option><option value="mark">Se značkou</option>
      </select></label>
      {part.marking === 'mark' && <div className="cc-marker-options">
        <label>Barva značky<select aria-label={`Barva značky ${label}`} value={part.markerColor ?? 'unknown'} onChange={event => onChange({ ...part, markerColor: event.target.value === 'unknown' ? null : event.target.value })}>
          <option value="unknown">Neurčena</option>{data.colors.map(color => <option key={color.hex} value={color.hex}>{color.name}</option>)}
          {part.markerColor && !data.colors.some(color => color.hex === part.markerColor) && <option value={part.markerColor}>{part.markerColor}</option>}
        </select></label>
        <label>Rozestup (mm)<input type="number" min={1} max={10000} step={1} aria-label={`Rozestup značek ${label}`} value={part.markingSpacingMm ?? ''} placeholder="Neurčen"
          onChange={event => onChange({ ...part, markingSpacingMm: event.target.value === '' ? null : Number(event.target.value) })} /></label>
      </div>}
    </details>
  </div>
}
