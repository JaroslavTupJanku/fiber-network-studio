import { useState } from 'react'
import { ArrowLeft, MapPin, Network } from 'lucide-react'
import { infrastructureLinks } from './infrastructureSchematic'
import { countCzech } from './equipmentPresentation'
import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export function InfrastructureSchematic({ pointId, pointName, pointNames, routes, installations, tracedRouteIds, onOpenRoute }: {
  pointId: string; pointName: string; pointNames: Record<string, string>
  routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  tracedRouteIds: string[]
  onOpenRoute: (routeId: string) => void
}) {
  const [focusId, setFocusId] = useState(pointId)
  const links = infrastructureLinks(focusId, routes, installations, pointNames)
  return <section className="infrastructure-schematic" aria-label="Schéma fyzické infrastruktury">
    <div className="infrastructure-schematic-heading"><div><h4>Fyzická infrastruktura</h4>
      <p>Navazující úseky a body. Kliknutím na bod můžete pokračovat sítí, trasu otevřete na mapě.</p></div>
      {focusId !== pointId && <button type="button" className="move-button" onClick={() => setFocusId(pointId)}>
        <ArrowLeft size={14} /> Zpět ke spojce</button>}</div>
    <div className="infrastructure-schematic-node"><Network size={17} />
      <strong>{focusId === pointId ? pointName : pointNames[focusId] ?? 'Síťový bod'}</strong>
      <span>{links.length} {links.length === 1 ? 'navazující úsek' : links.length < 5 ? 'navazující úseky' : 'navazujících úseků'}</span></div>
    {links.length ? <div className="infrastructure-schematic-links">{links.map(link =>
      <div className="infrastructure-schematic-link" key={link.routeId}>
        <button type="button" className={`infrastructure-schematic-route${tracedRouteIds.includes(link.routeId) ? ' traced' : ''}`}
          onClick={() => onOpenRoute(link.routeId)}>
          <span>{link.routeName}</span><small>{countCzech(link.conduitRuns, 'prvek potrubí', 'prvky potrubí', 'prvků potrubí')}
            {' · '}{countCzech(link.cableRuns, 'kabelový běh', 'kabelové běhy', 'kabelových běhů')}
            {tracedRouteIds.includes(link.routeId) ? ' · Sledovaná cesta' : ' · Otevřít na mapě'}</small>
        </button>
        <button type="button" className="infrastructure-schematic-next" onClick={() => setFocusId(link.otherPointId)}>
          <MapPin size={15} /><strong>{link.otherPointName}</strong><small>Pokračovat od tohoto bodu</small>
        </button>
      </div>)}</div> : <p className="splice-empty">Na tento bod zatím nenavazuje žádný úsek.</p>}
  </section>
}
