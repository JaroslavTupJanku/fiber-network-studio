# Webový vývoj: krátké poznámky

**Frontend** běží v prohlížeči. Skládá obrazovku, reaguje na kliknutí a zobrazuje odpovědi serveru. Tady používáme React a TypeScript; Vite pomáhá při vývoji a sestaví výsledné soubory.

**Backend** běží na serveru. Přijímá požadavky, kontroluje pravidla a pracuje s uloženými daty. Tady ho píšeme v C# na ASP.NET Core.

**API** je domluvené rozhraní mezi frontendem a backendem. Například požadavek na seznam objektů vrátí data, která frontend zobrazí na mapě.

**Uložení dat** zatím zajišťuje lokální JSON soubor na backendu, takže objekty zůstanou i po restartu. Pro společný provoz později použijeme databázi PostgreSQL; PostGIS přidává práci s polohou a tvary na mapě.

**Komponenta** je část uživatelského rozhraní. **Stav** jsou hodnoty, které se během používání mění. V duchu MVVM oddělujeme vzhled od práce se stavem tam, kde to skutečně zjednoduší kód; v Reactu k tomu často slouží vlastní hooks. Backend dělíme podle odpovědností na API, aplikační pravidla a přístup k datům.

**Mapová vrstva** je samostatný obsah nad základní mapou. **WMS** je služba, která podle polohy a měřítka vrací obrázky mapy; zde přes ni zobrazujeme katastr ČÚZK. Není to knihovna ani kopie celého katastru uložená v aplikaci.

**Parcela** je evidovaný pozemek, ne naše budova. **Polygon** je tvar její hranice. Po kliknutí backend požádá online službu RÚIAN o data jedné parcely ve formátu **GeoJSON**; číslo a obrys zobrazíme, ale neukládáme. **WMTS** (hotové mapové dlaždice) a **WFS** (dotazy na mapové objekty) jsou další typy mapových služeb, které zatím nepoužíváme.

**CRUD** znamená založit, načíst, upravit a smazat záznam. Takto teď frontend přes API spravuje budovy a šachty; katastr je pouze podklad, nikoli zdroj těchto záznamů.

**Gesto** je způsob ovládání myší nebo dotykem. MapLibre zde zajišťuje posun tažením a přiblížení kolečkem; aplikace nastavuje vzhled kurzoru.

**Drag and drop** znamená přetáhnout prvek a pustit ho na cílovém místě. U nás mapa převede místo puštění na souřadnice; objekt se uloží až po potvrzení formuláře.
