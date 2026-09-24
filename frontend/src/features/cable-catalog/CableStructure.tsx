import { useId } from 'react'
import { ColorMarkFields, ColorSwatch } from './ColorMark'
import { colorName, markingLabel, type CableInput, type CableTube, type ColorCodeData } from './model'

type Props = { cable: CableInput; data: ColorCodeData; activeTube: number; onSelect: (index: number) => void; onChange?: (tube: CableTube) => void }

export function CableStructure({ cable, data, activeTube, onSelect, onChange }: Props) {
  const tube = cable.tubes[activeTube] ?? cable.tubes[0]
  const id = useId()
  return <div className="cc-structure">
    <div className="cc-tube-list" aria-label="Tuby kabelu">
      {cable.tubes.map((part, index) => <button key={index} type="button" className="cc-tube"
        aria-pressed={activeTube === index} onClick={() => onSelect(index)}>
        <ColorSwatch part={part} data={data} />
        <strong>{part.name || `Tuba ${index + 1}`}</strong><small>{colorName(part, data)}</small><small>{part.fibers.length} vláken</small>
        {part.marking === 'mark' && <small>{markingLabel(part, data)}</small>}
      </button>)}
    </div>
    <div className="cc-tube-detail">
      <div className="cc-tube-heading">
        {onChange ? <div className="cc-part-fields">
          <label htmlFor={`${id}-tube`}>Název tuby<input id={`${id}-tube`} value={tube.name} maxLength={40} required
            onChange={event => onChange({ ...tube, name: event.target.value })} /></label>
          <ColorMarkFields part={tube} data={data} label="tuby" onChange={mark => onChange({ ...tube, ...mark })} />
        </div> : <h3><ColorSwatch part={tube} data={data} />{tube.name} · {colorName(tube, data)}</h3>}
        <span className="cc-muted">{tube.fibers.length} vláken · pořadí v tubě</span>
      </div>
      <div className={`cc-fibers ${onChange ? 'cc-fibers-edit' : ''}`}>
        {tube.fibers.map((fiber, index) => <div className="cc-fiber" key={index}>
          <span className="cc-fiber-number">{String(index + 1).padStart(2, '0')}</span>
          {onChange ? <div className="cc-fiber-fields">
            <input aria-label={`Název vlákna ${index + 1}`} value={fiber.name} required maxLength={40} onChange={event => onChange({
              ...tube, fibers: tube.fibers.map((item, i) => i === index ? { ...item, name: event.target.value } : item),
            })} />
            <ColorMarkFields part={fiber} data={data} label={`vlákna ${index + 1}`} onChange={mark => onChange({
              ...tube, fibers: tube.fibers.map((item, i) => i === index ? { ...item, ...mark } : item),
            })} />
          </div> : <><ColorSwatch part={fiber} data={data} /><span className="cc-fiber-description"><strong>{colorName(fiber, data)}</strong>
            {!/^Vlákno \d+$/.test(fiber.name) && <span>{fiber.name}</span>}
            {fiber.marking === 'mark' && <small>{markingLabel(fiber, data)}</small>}</span></>}
        </div>)}
      </div>
    </div>
    <p className="cc-helper">Odstíny a kresba značek jsou schematické. Bezbarvé vlákno znázorňuje šachovnice.</p>
  </div>
}
