# Webový vývoj: krátké poznámky

**Frontend** běží v prohlížeči. Skládá obrazovku, reaguje na kliknutí a zobrazuje odpovědi serveru. Tady používáme React a TypeScript; Vite pomáhá při vývoji a sestaví výsledné soubory.

**Backend** běží na serveru. Přijímá požadavky, kontroluje pravidla a pracuje s uloženými daty. Tady ho píšeme v C# na ASP.NET Core.

**API** je domluvené rozhraní mezi frontendem a backendem. Například požadavek na seznam objektů vrátí data, která frontend zobrazí na mapě.

**Databáze** uchovává data i po vypnutí aplikace. PostgreSQL je databázový systém; PostGIS k němu přidává práci s polohou a tvary na mapě. Připojíme ho, až navrhneme první objekty.

**Komponenta** je část uživatelského rozhraní. **Stav** jsou hodnoty, které se během používání mění. V duchu MVVM oddělujeme vzhled od práce se stavem tam, kde to skutečně zjednoduší kód; v Reactu k tomu často slouží vlastní hooks. Backend dělíme podle odpovědností na API, aplikační pravidla a přístup k datům.
