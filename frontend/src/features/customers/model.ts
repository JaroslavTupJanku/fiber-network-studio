export type CustomerStatus = 'lead' | 'active'
export type MessageStatus = 'todo' | 'done'
export type MessageCategory = 'request' | 'installation' | 'service'

export type CustomerContact = { id: string; name: string; role: string; email: string; phone: string }
export type CustomerMessage = { id: string; subject: string; sender: string; date: string;
  category: MessageCategory; status: MessageStatus; summary: string }
export type CustomerRecord = { id: string; version: number; buildingPointId: string; premiseId: string | null;
  name: string; status: CustomerStatus; note: string; contacts: CustomerContact[]; messages: CustomerMessage[] }
export type CustomerDraft = Omit<CustomerRecord, 'id'> & { id: string | null }

export const newCustomer = (buildingPointId: string): CustomerDraft => ({
  id: null, version: 0, buildingPointId, premiseId: null, name: '', status: 'lead', note: '',
  contacts: [], messages: [],
})

export const demoCustomer = (buildingPointId: string, premiseId: string | null): CustomerDraft => ({
  ...newCustomer(buildingPointId), premiseId, name: 'Ukázkový zákazník', status: 'active',
  note: 'Fiktivní záznam pro předvedení obrazovky zákazníkovi.',
  contacts: [{ id: crypto.randomUUID(), name: 'Jana Ukázková', role: 'Technický kontakt',
    email: 'jana@example.invalid', phone: '' }],
  messages: [
    { id: crypto.randomUUID(), subject: 'Dotaz k termínu připojení', sender: 'jana@example.invalid',
      date: '2026-09-24', category: 'installation', status: 'todo', summary: 'Čeká na návrh termínu.' },
    { id: crypto.randomUUID(), subject: 'Potvrzení údajů k přípojce', sender: 'jana@example.invalid',
      date: '2026-09-18', category: 'request', status: 'done', summary: 'Údaje byly ověřeny.' },
  ],
})

export function customerError(draft: CustomerDraft): string | null {
  if (!draft.buildingPointId) return 'Vyberte budovu.'
  if (!draft.name.trim() || draft.name.trim().length > 120) return 'Zadejte název zákazníka (nejvýše 120 znaků).'
  if (draft.contacts.some(contact => !contact.name.trim() || contact.name.length > 120))
    return 'Každý kontakt potřebuje jméno.'
  if (draft.messages.some(message => !message.subject.trim() || !message.date))
    return 'Každá zpráva potřebuje předmět a datum.'
  return null
}

export const categoryLabel: Record<MessageCategory, string> = {
  request: 'Poptávka', installation: 'Instalace', service: 'Servis',
}
