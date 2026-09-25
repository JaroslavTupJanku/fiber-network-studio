import { useEffect, useRef, useState } from 'react'
import { deleteDuct, listDucts, saveDuct } from './api'
import { newDuct, validateDuct, type DuctDraft, type DuctKind, type DuctType } from './model'

export function useDuctCatalog() {
  const [items, setItems] = useState<DuctType[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DuctDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [initialDraft, setInitialDraft] = useState('')
  const mutationPending = useRef(false)
  const dirty = draft !== null && JSON.stringify(draft) !== initialDraft

  useEffect(() => {
    const abort = new AbortController()
    listDucts(abort.signal).then(data => {
      if (abort.signal.aborted) return
      setItems(data); setSelectedId(id => data.some(item => item.id === id) ? id : data[0]?.id ?? null); setError('')
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

  const canLeaveDraft = () => !mutationPending.current && (!dirty || window.confirm('Zahodit neuložené změny typu?'))
  const select = (id: string) => { if (canLeaveDraft()) { setDraft(null); setSelectedId(id); setError(''); setNotice('') } }
  const begin = (value: DuctDraft) => {
    if (!canLeaveDraft()) return
    setInitialDraft(JSON.stringify(value)); setDraft(value); setError(''); setNotice('')
  }
  const create = (kind: DuctKind) => begin(newDuct(kind))
  const edit = (item: DuctType) => begin(structuredClone(item))
  const duplicate = (item: DuctType) => begin({ ...structuredClone(item), id: undefined,
    name: `${item.name.slice(0, 92)} – kopie`, version: 0 })
  const cancel = () => { if (canLeaveDraft()) { setDraft(null); setError('') } }
  const reload = () => { if (canLeaveDraft()) { setDraft(null); setLoading(true); setError(''); setRevision(value => value + 1) } }
  const save = async () => {
    if (!draft || mutationPending.current) return
    const validation = validateDuct(draft)
    if (validation) { setError(validation); return }
    mutationPending.current = true; setBusy(true); setError('')
    try {
      const saved = await saveDuct(draft, draft.id)
      setItems(current => current.some(item => item.id === saved.id)
        ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
      setSelectedId(saved.id); setDraft(null); setNotice('Typ byl uložen.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Uložení se nezdařilo. Vaše změny zůstaly ve formuláři.') }
    finally { mutationPending.current = false; setBusy(false) }
  }
  const remove = async (item: DuctType) => {
    if (mutationPending.current || !window.confirm(`Smazat vlastní typ „${item.name}“?`)) return
    mutationPending.current = true; setBusy(true); setError('')
    try {
      await deleteDuct(item)
      setItems(current => current.filter(value => value.id !== item.id))
      setSelectedId(items.find(value => value.id !== item.id)?.id ?? null)
      setNotice('Typ byl smazán.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Smazání se nezdařilo.') }
    finally { mutationPending.current = false; setBusy(false) }
  }
  return { items, selected: items.find(item => item.id === selectedId), draft, setDraft, loading, busy, dirty,
    error, notice, select, create, edit, duplicate, cancel, reload, save, remove }
}
