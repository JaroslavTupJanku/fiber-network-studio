import { kindLabel, type DuctInput } from './model'

export function DuctDiagram({ item }: { item: DuctInput }) {
  const ratio = item.outerDiameterMm && item.innerDiameterMm ? Math.max(.15, Math.min(.9, item.innerDiameterMm / item.outerDiameterMm)) : .64
  return <div className="dc-diagram" role="img" aria-label={item.kind === 'assembly'
    ? `Schematický průřez: ${item.rows} řad, ${item.columns} sloupců, ${item.slots.length} pozic`
    : `Schematický průřez: ${kindLabel(item.kind)}`}>
    {item.kind === 'assembly' ? <div className="dc-diagram-grid" style={{ gridTemplateColumns: `repeat(${item.columns}, minmax(0, 1fr))` }}>
      {item.slots.map((slot, index) => <div className="dc-slot" key={index} title={`${slot.name}: ${kindLabel(slot.kind)}`}>
        <span className="dc-ring" style={{ '--ring': slot.color,
          '--inner': slot.outerDiameterMm && slot.innerDiameterMm ? `${Math.max(18, Math.min(82, slot.innerDiameterMm / slot.outerDiameterMm * 100))}%` : '64%',
        } as React.CSSProperties} /><small>{index + 1}</small></div>)}
    </div> : <span className="dc-ring dc-ring-large" style={{ '--ring': item.color, '--inner': `${ratio * 100}%` } as React.CSSProperties} />}
    <p>Schéma uspořádání · {item.outerDiameterMm === null || item.kind === 'assembly' ? 'bez měřítka' : 'poměr průměrů podle zadaných hodnot'}</p>
  </div>
}
