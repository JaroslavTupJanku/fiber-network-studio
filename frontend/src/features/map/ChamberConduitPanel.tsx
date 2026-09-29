import { useState } from 'react'
import { Check, Layers3 } from 'lucide-react'
import { splitConduitAtChamber, type InstalledItem, type RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export function ChamberConduitPanel({ pointId, routes, documents, onUpdated }: {
  pointId: string
  routes: UndergroundRoute[]
  documents: RouteInstallationDocument[]
  onUpdated: (documents: RouteInstallationDocument[]) => void
}) {
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const incidentRoutes = routes.filter(route => route.startPointId === pointId || route.endPointId === pointId)
  const names = new Map(incidentRoutes.map(route => [route.id, route.name]))
  const grouped = new Map<string, InstalledItem[]>()
  for (const document of documents) {
    if (!names.has(document.routeId)) continue
    for (const item of document.items) {
      if (item.duct?.kind !== 'conduit') continue
      grouped.set(item.runId, [...(grouped.get(item.runId) ?? []), item])
    }
  }
  const conduitRuns = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)
  const throughCount = conduitRuns.filter(([, items]) => items.length === 2).length
  if (conduitRuns.length === 0 && !notice && !error) return null

  const split = async (item: InstalledItem) => {
    const version = documents.find(document => document.routeId === item.routeId)?.version
    if (version === undefined || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      onUpdated(await splitConduitAtChamber(pointId, item.id, version))
      setPendingRunId(null)
      setNotice('Chránička je v šachtě rozdělena na dvě samostatně evidované části.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chráničku se nepodařilo rozdělit.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="chamber-conduit-card" aria-label="Chráničky v šachtě">
    <div className="chamber-conduit-heading"><Layers3 size={17} aria-hidden="true" />
      <div><h2>Chráničky v šachtě</h2><p>Průchozí i končící v navazujících úsecích</p></div>
      {conduitRuns.length > 0 && <strong>{conduitRuns.length}</strong>}
    </div>
    {throughCount > 0 &&
      <p className="chamber-conduit-intro">Chránička může šachtou procházet dál. Rozdělte ji jen tehdy, když zde mají být evidovány dvě samostatné části.</p>
    }
    {conduitRuns.length > 0 &&
      <div className="chamber-conduit-list">{conduitRuns.map(([runId, items]) =>
        <div className="chamber-conduit-item" key={runId}>
          <div><strong>{items[0].label}</strong><small>{items.map(item => names.get(item.routeId) ?? 'Úsek').join(' · ')}</small></div>
          {items.length === 2 && pendingRunId === runId ? <div className="chamber-conduit-confirm">
            <span>Obsah chráničky (mikrotrubičky a kabely) se nezmění. Kabel můžete rozdělit zvlášť ve spojce.</span>
            <div><button type="button" className="move-button" onClick={() => setPendingRunId(null)}>Zpět</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => void split(items[0])}>
                {busy ? 'Rozděluji…' : 'Potvrdit rozdělení'}</button></div>
          </div> : items.length === 2
            ? <button type="button" className="move-button" disabled={busy}
              onClick={() => { setPendingRunId(runId); setNotice(''); setError('') }}>Rozdělit chráničku</button>
            : <span className="chamber-conduit-end">Končí v šachtě</span>}
        </div>)}</div>
    }
    {notice && <p className="chamber-conduit-notice" role="status"><Check size={15} /> {notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}
