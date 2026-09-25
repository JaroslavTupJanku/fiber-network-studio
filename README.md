# Fiber Network Studio

Webová pracovní plocha pro provozovatele infrastruktury. Na mapě lze založit budovu nebo šachtu, pojmenovat ji, přesunout a smazat. Katastrální podklad umožňuje vybrat a zvýraznit parcelu; další síťové prvky doplníme později.

## Jak to funguje

React v prohlížeči zobrazuje mapu a objekty. ASP.NET Core API kontroluje vstupy a ukládá objekty do lokálního JSON souboru `backend/FiberNetworkStudio.Api/App_Data/network-points.json`. Soubor se vytvoří při prvním zápisu a není v Gitu. PostgreSQL s PostGIS zatím není připojené.

Přepínač **Katastr** připojuje online WMS ČÚZK od přiblížení 17. Kliknutí na mapu pak přes API načte jednu parcelu z [RÚIAN](https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/5), zvýrazní její obrys a ukáže číslo, území a výměru. Lze odtud založit budovu; parcela se zatím neukládá ani trvale nepřiřazuje k budově. Při výpadku ČÚZK zůstává základní mapa dostupná, pokud funguje její vlastní služba. [Podmínky ČÚZK](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx).

Mapu lze táhnout myší a přiblížit kolečkem bez další klávesy. Fungují také šipky, WASD a tlačítka přiblížení. Vybraná parcela je zvýrazněná modře.

Budovu nebo šachtu lze vybrat a kliknout do mapy, případně přetáhnout z nástrojů přímo na místo. Existující bod lze na mapě uchopit a přesunout; nová poloha se uloží až tlačítkem **Uložit**. Základní mapa zůstává zapnutá; přepíná se pouze Katastr.

## Lokální spuštění

1. API: `dotnet run --project backend/FiberNetworkStudio.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`; objekty přes `/api/network-points` a parcely přes `/api/parcels/at`. Aktuální práce je na větvi `codex/map-point-drag`.

Stručné vysvětlení pojmů je v [poznámkách k webovému vývoji](docs/web-vyvoj.md).

## Katalog kabelů

V horní navigaci otevřete **Katalog kabelů**. Obsahuje obecné šablony 12, 24, 48 a 96 vláken
(1, 2, 4 nebo 8 tub po 12 vláknech) se základním pořadím TIA-598. Nejde o specifikace konkrétního
výrobce; před použitím je potřeba ověřit provedení proti dokumentaci skutečného kabelu.

Šablonu lze zkopírovat, vlastní typ vytvořit, upravit nebo smazat. Editor nabízí názvy a barvy
každé tuby a vlákna, výrobce, poznámku a úpravu struktury (1–24 tub, 1–24 vláken v tubě).
Tuby i vlákna lze přidávat a odebírat jednotlivě; tuby mohou mít různé počty vláken.
Nová tuba přebírá pouze počet vláken vybrané tuby, značení se vytvoří podle zvolených profilů.
Hromadná úprava sjednotí počty vláken a přidává nebo odebírá položky na konci. Zachované
položky si ponechají názvy, barvy i značky. Odebrání vyžaduje potvrzení a poslední tubu či
vlákno nelze odebrat. Po odebrání uprostřed se příslušný profil přepne na vlastní značení,
aby se zbývající barvy nepřepisovaly podle nového pořadí. Výchozí šablony jsou chráněné.
Katalog eviduje specifikace; skutečné kabely, trasy a jejich vazby zatím nevytváří.

Specifikace může obsahovat nepovinný útlum pro 1310 a 1550 nm v dB/km, podle technického listu.
API používá pole `attenuation1310DbPerKm` a `attenuation1550DbPerKm`: nezáporná konečná čísla
nebo `null` pro neuvedenou hodnotu. Nula je platná explicitní hodnota, nikoli náhrada chybějícího
údaje. Staré záznamy a obecné šablony útlum nemají vyplněný. Kopie specifikace jej zachovává.
Výpočty ztrát tras a projektová nastavení nejsou součástí tohoto modulu.

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
node --test tests/cable-structure.test.mjs # Node 24
pnpm --dir frontend build
pnpm --dir frontend lint
```

### Barevné značení a zdroje

Barva vlákna označuje jeho pořadí podle zvoleného systému; neoznačuje službu ani zákazníka.
Výrobce kabelu a barevný systém jsou samostatné údaje. Profily vláken a tub se vybírají odděleně.
Přejmenování vlákna profil zachovává. Ruční změna barvy nebo značky přepne příslušný profil na
**Vlastní značení**. API kontroluje shodu označeného profilu se skutečnými barvami a značkami.

Datový soubor `backend/FiberNetworkStudio.Api/CableCatalog/color-codes.json` je společným zdrojem
pro server, editor i stahování přes `/api/cable-catalog/color-codes/download`. Obsahuje datum
ověření, odkazy na zdroje a tyto profily:

- **TIA-598, pozice 1–12:** základní pořadí pro vlákna i tuby. Nad 12 položek vyžaduje jiný profil.
- **Corning AEN029, rev. 13, tabulky 1–2:** konkrétní provedení až do 24 položek. Vlákno 20
  MiniXtend HD je bezbarvé s černou značkou; tuba 20 je černá s bílou značkou. Toto není
  univerzální pravidlo pro všechny výrobky označené TIA-598.
- **Prysmian E18, DE10_E18_20260908, strana 2:** značení vláken dané řady dle IEC 60794-2 /
  VDE 0888; pozice 13–24 mají značky po 70 mm, pozice 22 je bílá se značkami po 35 mm.
  Barvu značek použitý list neurčuje, proto ji data ponechávají neurčenou. Profil neurčuje tuby.

Zdroje: [Corning AEN029](https://www.corning.com/catalog/coc/documents/application-engineering-notes/AEN029.pdf),
[Prysmian E18](https://datasheet.prysmian.com/pdf/datasheet/en/239099).
Jde o malou ručně ověřenou referenční tabulku, nikoliv úplný katalog produktů výrobců nebo text
normy. RGB hodnoty a kresba značek slouží jen k zobrazení, nejsou kolorimetrickou specifikací.
Každý vlastní kabel může mít odkaz na svůj technický list.

Starší uložené typy zůstávají beze změny barev i názvů; chybějící profil se čte jako vlastní a
chybějící značka jako žádná. Nově přidané položky s vlastním značením jsou neutrální šedé,
které je potřeba vyplnit podle kabelu. Vybraný ověřený profil nikdy tiše neopakuje barvy nad svůj limit.

### Kalkulačka optických ztrát

Panel **Optické ztráty** počítá jednu zadanou optickou cestu bez vazeb na mapové objekty.
Obsahuje kabelové úseky (metry × dB/km / 1000), svary, konektorové spoje, splittery a jiné
pasivní prvky (počet × dB). Konektorový spoj znamená spojený pár; u splitteru se zadává
ztráta konkrétní vstupní–výstupní cesty. Počet vláken kabelu se do ztráty nenásobí.
Pro 1270, 1310, 1490, 1550 a 1577 nm se uchovávají oddělené útlumy všech položek.
Profil GPON nabízí downstream 1490 / upstream 1310 nm, XGS-PON (základní pásmo)
1577 / 1270 nm. Přepnutí PON technologie zachovává směr přenosu, mění vlnovou délku
a používá samostatný limit dané technologie a směru. Vlastní nastavení má vlastní limity.
Chybějící útlum se neodhaduje z jiné vlnové délky. Katalog zatím dodává pouze 1310/1550 nm;
převzetí jiného kabelu vymaže dříve zadané útlumy ostatních vlnových délek.
Základní zobrazení obsahuje cestu, technologii a směr, Pokročilé přidává limit a rezervu.
Skrytí nastavení nemění výpočet. PON zobrazuje výsledky obou směrů samostatně.
V katalogu zařízení lze zadat profily OLT, ONT/ONU a optických modulů podle datasheetu;
žádné produktové hodnoty nejsou předvyplněné. Výběr dvojice posuzuje oba směry:
nejnižší přijímaný výkon po započtení rezervy proti citlivosti a nejvyšší proti přetížení.
Výkon je v dBm, ztráta v dB. Neúplné údaje nebo chybějící rezerva nedají kladný verdikt.
Vlnové délky: [VeEX GPON/XGS-PON](https://resources.veexinc.com/assets/productdocs/FX120/content/procedures/gpon/opm-results.htm).
JSON verze 2 automaticky převede soubory verze 1 na vlastní nastavení a zachová jejich údaje.
Požadovaná návrhová rezerva je společná. Zbývající prostor = povolená ztráta − součet ztrát − rezerva.
Prázdné a neplatné hodnoty neznamenají nulu; neúplná cesta nemá celkový výsledek. Neznámý
limit nebo rezerva dovolují zobrazit součet, ale ne kladné posouzení. Hraniční výsledek se
zobrazuje samostatně. Hodnoty v ukázce jsou ilustrační, nejsou normovými výchozími hodnotami.

Výběr kabelu kopíruje aktuální útlumy a název/verzi katalogové specifikace do zadání. Další
změny katalogu zadání automaticky nepřepisují. Ruční změna útlumu zruší označení převzatého
zdroje. Při nedostupném katalogu lze hodnoty zadávat ručně. Ukládá se jeden rozpracovaný
výpočet v localStorage daného prohlížeče; JSON stažení/načtení umožňuje přenos a archivaci.
Import má kontrolu verze, struktury a velikosti, vadná uložená data se nepřepíší automaticky.
Nejde o sdílené projektové nastavení ani serverovou evidenci výpočtů.

Feature `frontend/src/features/optical-budget` odděluje čistý výpočet (`model.ts`), formát
uložení (`storage.ts`), stav/externí operace (`useOpticalBudget.ts`) a UI komponenty.
Ověření výpočtů a importu: `node --test tests/optical-budget.test.mjs` (Node 24).

Metodika: [FOA – Calculating Fiber Optic Loss Budgets](https://thefoa.org/tech/lossbudg.htm).
Samostatná bilance ztrát posuzuje zadaný horní limit; kontrola zařízení navíc používá
zadané meze vysílačů a přijímačů. Neověřuje disperzi, odrazy ani další přenosové
parametry; výsledek je návrhový odhad, nikoliv měření či úplná certifikace spoje.
Výpočet a katalog profilů zařízení se zatím ukládají v prohlížeči odděleně. Pro přenos
mezi počítači je nutné exportovat oba soubory a na cíli nejprve importovat katalog.
Katalog kabelů ukládá backend prototypu. Zákaznický proklik může běžet z jednoho odkazu;
společná evidence uživatelů a projektů zatím není součástí prototypu.
Pro první proklikání použijte v panelu Optické ztráty tlačítko Ukázka. Skutečné
profily OLT/ONT se vyplňují podle technických listů. Výsledek pro oba směry vznikne
až po výběru kompatibilních zařízení a doplnění ztrát celé cesty.
