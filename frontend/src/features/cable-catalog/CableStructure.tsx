import { useId } from 'react'
import type { CableInput, CableTube } from './model'

type Props = { cable: CableInput; activeTube: number; onSelect: (index: number) => void; onChange?: (tube: CableTube) => void }

export function CableStructure({ cable, activeTube, onSelect, onChange }: Props) {
  const tube = cable.tubes[activeTube] ?? cable.tubes[0]
  const id = useId()
  return <div className="cc-structure">
    <div className="cc-tube-list" aria-label="Tuby kabelu">
      {cable.tubes.map((part, index) => <button key={index} type="button" className="cc-tube"
        aria-pressed={activeTube === index} onClick={() => onSelect(index)}>
        <span className="cc-tube-symbol" style={{ borderColor: part.color }} aria-hidden="true"><span /> <span /> <span /></span>
        <strong>{part.name || `Tuba ${index + 1}`}</strong><small>{part.fibers.length} vláken</small>
      </button>)}
    </div>
    <div className="cc-tube-detail">
      <div className="cc-tube-heading">
        {onChange ? <div className="cc-part-fields">
          <label htmlFor={`${id}-tube`}>Název tuby<input id={`${id}-tube`} value={tube.name} maxLength={40} required
            onChange={event => onChange({ ...tube, name: event.target.value })} /></label>
          <label>Barva tuby<input type="color" value={tube.color} onChange={event => onChange({ ...tube, color: event.target.value })} /></label>
        </div> : <h3><span className="cc-dot" style={{ background: tube.color }} />{tube.name}</h3>}
        <span className="cc-muted">{tube.fibers.length} vláken · pořadí v tubě</span>
      </div>
      <div className="cc-fibers">
        {tube.fibers.map((fiber, index) => <div className="cc-fiber" key={index}>
          <span className="cc-fiber-number">{String(index + 1).padStart(2, '0')}</span>
          {onChange ? <>
            <input type="color" aria-label={`Barva vlákna ${index + 1}`} value={fiber.color} onChange={event => onChange({
              ...tube, fibers: tube.fibers.map((item, i) => i === index ? { ...item, color: event.target.value } : item),
            })} />
            <input aria-label={`Název vlákna ${index + 1}`} value={fiber.name} required maxLength={40} onChange={event => onChange({
              ...tube, fibers: tube.fibers.map((item, i) => i === index ? { ...item, name: event.target.value } : item),
            })} />
          </> : <><span className="cc-dot" style={{ background: fiber.color }} /><span>{fiber.name}</span><code>{fiber.color.toUpperCase()}</code></>}
        </div>)}
      </div>
    </div>
  </div>
}
