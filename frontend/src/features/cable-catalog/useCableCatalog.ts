import { useEffect, useRef, useState } from 'react'
import { deleteCable, listCables, saveCable } from './api'
import { newCable, validateCable, type CableDraft, type CableSpecification } from './model'

export function useCableCatalog() {
  const [items, setItems] = useState<CableSpecification[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CableDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [initialDraft, setInitialDraft] = useState('')
  const [draftSession, setDraftSession] = useState(0)
  const mutationPending = useRef(false)
  const dirty = draft !== null && JSON.stringify(draft) !== initialDraft

  useEffect(() => {
    const abort = new AbortController()
    listCables(abort.signal).then(data => {
      setItems(data)
      setSelectedId(id => data.some(item => item.id === id) ? id : data[0]?.id ?? null)
      setError('')
    }).catch((reason: unknown) => {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'Katalog se nepodařilo načíst.')
    }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [revision])

  useEffect(() => {
    if (!dirty && !busy) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty, busy])

  const canLeaveDraft = () => !mutationPending.current && (!dirty || window.confirm('Zahodit neuložené změny kabelu?'))
  const select = (id: string) => {
    if (!canLeaveDraft()) return
    setDraft(null); setSelectedId(id); setError(''); setNotice('')
  }
  const begin = (value: CableDraft) => {
    if (!canLeaveDraft()) return
    setInitialDraft(JSON.stringify(value))
    setDraftSession(session => session + 1)
    setDraft(value); setError(''); setNotice('')
  }
  const create = () => begin(newCable())
  const edit = (item: CableSpecification) => begin(structuredClone(item))
  const duplicate = (item: CableSpecification) => begin({
    ...structuredClone(item), id: undefined, name: `${item.name.slice(0, 92)} – kopie`, version: 0,
  })
  const cancel = () => { if (canLeaveDraft()) { setDraft(null); setError('') } }
  const reload = () => {
    if (!canLeaveDraft()) return
    setDraft(null); setLoading(true); setError(''); setRevision(value => value + 1)
  }
  const save = async () => {
    if (!draft || mutationPending.current) return
    const validation = validateCable(draft)
    if (validation) { setError(validation); return }
    mutationPending.current = true; setBusy(true); setError('')
    try {
      const saved = await saveCable(draft, draft.id)
      setItems(current => current.some(item => item.id === saved.id)
        ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
      setSelectedId(saved.id); setDraft(null); setNotice('Kabel byl uložen.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Uložení se nezdařilo. Vaše úpravy zůstaly ve formuláři.')
    } finally { mutationPending.current = false; setBusy(false) }
  }
  const remove = async (item: CableSpecification) => {
    if (mutationPending.current || !window.confirm(`Smazat vlastní typ „${item.name}“? Tuto akci nelze vrátit.`)) return
    mutationPending.current = true; setBusy(true); setError('')
    try {
      await deleteCable(item)
      setItems(current => current.filter(value => value.id !== item.id))
      setSelectedId(items.find(value => value.id !== item.id)?.id ?? null)
      setNotice('Typ kabelu byl smazán.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Smazání se nezdařilo.') }
    finally { mutationPending.current = false; setBusy(false) }
  }

  return { items, selected: items.find(item => item.id === selectedId), draft, draftSession, setDraft, loading, busy, dirty,
    error, notice, select, create, edit, duplicate, cancel, reload, save, remove }
}
