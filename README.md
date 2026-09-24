# Fiber Network Studio

Webová pracovní plocha pro provozovatele infrastruktury. Na mapě lze založit budovu nebo šachtu, pojmenovat ji, přesunout a smazat. Katastrální podklad umožňuje vybrat a zvýraznit parcelu; další síťové prvky doplníme později.

## Jak to funguje

React v prohlížeči zobrazuje mapu a objekty. ASP.NET Core API kontroluje vstupy a ukládá objekty do lokálního JSON souboru `backend/FiberNetworkStudio.Api/App_Data/network-points.json`. Soubor se vytvoří při prvním zápisu a není v Gitu. PostgreSQL s PostGIS zatím není připojené.

Přepínač **Katastr** připojuje online WMS ČÚZK od přiblížení 17. Kliknutí na mapu pak přes API načte jednu parcelu z [RÚIAN](https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/5), zvýrazní její obrys a ukáže číslo, území a výměru. Lze odtud založit budovu; parcela se zatím neukládá ani trvale nepřiřazuje k budově. Při výpadku ČÚZK zůstává základní mapa dostupná, pokud funguje její vlastní služba. [Podmínky ČÚZK](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx).

Mapu lze táhnout myší a přiblížit kolečkem bez další klávesy. Fungují také šipky, WASD a tlačítka přiblížení. Vybraná parcela je zvýrazněná modře.

Budovu nebo šachtu lze vybrat a kliknout do mapy, případně přetáhnout z nástrojů přímo na místo. Objekt se uloží až po zadání názvu a potvrzení. Základní mapa zůstává zapnutá; přepíná se pouze Katastr.

## Lokální spuštění

1. API: `dotnet run --project backend/FiberNetworkStudio.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`; objekty přes `/api/network-points` a parcely přes `/api/parcels/at`. Aktuální práce je na větvi `codex/placement-cursor`.

Stručné vysvětlení pojmů je v [poznámkách k webovému vývoji](docs/web-vyvoj.md).

## Katalog kabelů

V horní navigaci otevřete **Katalog kabelů**. Obsahuje obecné šablony 12, 24, 48 a 96 vláken
(1, 2, 4 nebo 8 tub po 12 vláknech). Nejde o specifikace konkrétního výrobce; barevné pořadí je
ilustrační a před použitím je potřeba ověřit je proti dokumentaci skutečného kabelu.

Šablonu lze zkopírovat, vlastní typ vytvořit, upravit nebo smazat. Editor nabízí názvy a barvy
každé tuby a vlákna, výrobce, poznámku a přestavění struktury (1–24 tub, 1–24 vláken v tubě).
Přestavění vyžaduje potvrzení, protože nahradí vlastní názvy a barvy. Výchozí šablony jsou chráněné.
Katalog eviduje specifikace; skutečné kabely, trasy a jejich vazby zatím nevytváří.

API `/api/cable-catalog` ukládá vlastní typy do `App_Data/cable-catalog.json`; cestu lze změnit
konfigurací `CableCatalog:Path`. Soubor není verzovaný. Verze záznamu brání přepsání novější
úpravy jiným uživatelem. Stejně jako současná evidence bodů je úložiště určeno pro jednu instanci
API; pro více instancí je potřeba databáze. Před zavřením stránky s neuloženými úpravami prohlížeč
zobrazí upozornění. Přepínání mezi mapou a katalogem zachovává rozpracované formuláře.

Frontend je seskupený v `frontend/src/features/cable-catalog`: komponenty zobrazují UI,
`useCableCatalog` spravuje stav a akce, `model.ts` obsahuje typy a pravidla a `api.ts` komunikaci
se serverem. Backend je v `backend/FiberNetworkStudio.Api/CableCatalog`. Integrace zasahuje pouze
do navigace v `App.tsx` a registrace služby a endpointů v `Program.cs`.

Ověření API včetně persistence po restartu a konfliktu souběžných změn:

```sh
dotnet build backend/FiberNetworkStudio.Api
node --test tests/cable-catalog.test.mjs
pnpm --dir frontend build
pnpm --dir frontend lint
```
