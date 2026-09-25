import { useCallback, useEffect, useMemo, useState } from 'react'
import { listCables } from '../cable-catalog/api'
import type { CableSpecification } from '../cable-catalog/model'
import { listDucts } from '../duct-catalog/api'
import type { DuctType } from '../duct-catalog/model'
import { addInstalledItem, emptyInstallation, listRouteInstallations, removeInstalledItem,
  renameInstalledItem, type InstallationAdd, type RouteInstallationDocument } from './routeInstallations'

export function useRouteInstallations(routeId: string | null) {
  const [documents, setDocuments] = useState<RouteInstallationDocument[]>([])
  const [ducts, setDucts] = useState<DuctType[]>([])
  const [cables, setCables] = useState<CableSpecification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([listRouteInstallations(controller.signal), listDucts(controller.signal), listCables(controller.signal)])
      .then(([installed, ductTypes, cableTypes]) => {
        if (controller.signal.aborted) return
        setLoadFailed(installed.status === 'rejected')
        if (installed.status === 'fulfilled') setDocuments(installed.value)
        if (ductTypes.status === 'fulfilled') setDucts(ductTypes.value)
        if (cableTypes.status === 'fulfilled') setCables(cableTypes.value)
        const failed = [installed, ductTypes, cableTypes].filter(result => result.status === 'rejected')
        setError(failed.length ? 'Některá data se nepodařilo načíst. Zkuste obnovení; uložené kusy se nezměnily.' : '')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Data se nepodařilo načíst.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reloadVersion])

  const document = useMemo(() => documents.find(item => item.routeId === routeId) ?? emptyInstallation(routeId ?? ''),
    [documents, routeId])
  const refresh = useCallback(() => { setLoading(true); setReloadVersion(value => value + 1) }, [])
  const mutate = async (operation: () => Promise<RouteInstallationDocument>) => {
    if (busy) return false
    setBusy(true)
    setError('')
    try {
      const updated = await operation()
      setDocuments(current => [...current.filter(item => item.routeId !== routeId), updated])
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Změnu se nepodařilo uložit.')
      return false
    } finally { setBusy(false) }
  }
  const add = (input: Omit<InstallationAdd, 'version'>) => routeId
    ? mutate(() => addInstalledItem(routeId, { ...input, version: document.version })) : Promise.resolve(false)
  const rename = (id: string, label: string) => routeId
    ? mutate(() => renameInstalledItem(routeId, id, label, document.version)) : Promise.resolve(false)
  const remove = (id: string) => routeId
    ? mutate(() => removeInstalledItem(routeId, id, document.version)) : Promise.resolve(false)

  return { documents, document, ducts, cables, loading, loadFailed, busy, error, refresh, add, rename, remove }
}
