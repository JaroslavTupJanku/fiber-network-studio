import type { ReactNode } from 'react'
import { Library, Plus } from 'lucide-react'
import './catalogHeader.css'

export function CatalogHeader({ navigation, disabled, onCreate }: {
  navigation?: ReactNode
  disabled: boolean
  onCreate: () => void
}) {
  return <header className="catalog-page-header">
    <div className="catalog-header-main">
      <div className="catalog-header-title"><span className="catalog-header-icon"><Library size={23} /></span>
        <div><h1>Katalog materiálu</h1><p>Typy kabelů, chrániček a mikrotrubiček pro vaši síť.</p></div>
      </div>
      <button type="button" className="cc-button cc-primary" disabled={disabled} onClick={onCreate}><Plus size={17} />Nový typ</button>
    </div>
    {navigation}
  </header>
}
