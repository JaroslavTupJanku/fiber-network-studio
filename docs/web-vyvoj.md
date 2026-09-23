# Webový vývoj: krátké poznámky

**Frontend** běží v prohlížeči. Skládá obrazovku, reaguje na kliknutí a zobrazuje odpovědi serveru. Tady používáme React a TypeScript; Vite pomáhá při vývoji a sestaví výsledné soubory.

**Backend** běží na serveru. Přijímá požadavky, kontroluje pravidla a pracuje s uloženými daty. Tady ho píšeme v C# na ASP.NET Core.

**API** je domluvené rozhraní mezi frontendem a backendem. Například požadavek na seznam objektů vrátí data, která frontend zobrazí na mapě.

**Uložení dat** zatím zajišťuje lokální JSON soubor na backendu, takže objekty zůstanou i po restartu. Pro společný provoz později použijeme databázi PostgreSQL; PostGIS přidává práci s polohou a tvary na mapě.

**Komponenta** je část uživatelského rozhraní. **Stav** jsou hodnoty, které se během používání mění. V duchu MVVM oddělujeme vzhled od práce se stavem tam, kde to skutečně zjednoduší kód; v Reactu k tomu často slouží vlastní hooks. Backend dělíme podle odpovědností na API, aplikační pravidla a přístup k datům.

**Mapová vrstva** je samostatný obsah nad základní mapou. **WMS** je služba, která podle polohy a měřítka vrací obrázky mapy; zde přes ni zobrazujeme katastr ČÚZK. Není to knihovna ani kopie celého katastru uložená v aplikaci.

**CRUD** znamená založit, načíst, upravit a smazat záznam. Takto teď frontend přes API spravuje budovy a šachty; katastr je pouze podklad, nikoli zdroj těchto záznamů.
