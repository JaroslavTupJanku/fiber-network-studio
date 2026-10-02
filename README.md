# Fiber Network Studio

Zákazníci mají vlastní stránku se seznamem, hledáním, filtrem podle budovy a kartou klienta. Boční panel mapy ukazuje jen stručný přehled vybrané budovy a odkaz do evidence. Klienta lze navázat na budovu a volitelně na její HP, evidovat kontaktní osoby a ruční přehled zpráv podle tématu a stavu vyřízení. Pro předvedení lze vložit fiktivní ukázku. API ukládá prototypové záznamy do `App_Data/customers.json` a hlídá vazby na budovu a HP. Není připojena e-mailová schránka ani přístupová práva; používejte pouze fiktivní údaje, dokud nebude hotová produkční autentizace a ochrana dat.

U připojeného přípojného místa (HP) v editoru domovních rozvodů lze zvolit **Sledovat cestu k OLT**. U OLT portu lze naopak vybrat cílové HP; aplikace určí větev splitteru podle přiřazeného vlákna a zvýrazní nalezené trasy na mapě. Plánované HP a neúplné propojení se označí jako otevřená cesta. Přenos do kalkulačky zahrne evidované úseky, včetně domovního přívodu od podlažního boxu k HP, a známé ztráty. Neznámá délka nebo ztráta zůstane prázdná, aby výpočet nepředstíral úplný útlum.

Budova může mít typ **běžná budova** nebo **bytový dům**. V mapě mají odlišnou ikonu, ale obě jsou stejným síťovým bodem. V detailu budovy lze otevřít **Domovní FTTH rozvody**: pro každý vchod založit stoupačku, do ní podlažní box a v boxu přípojná místa (HP). HP je nejprve plánované; jako připojené je lze uložit po výběru volného vlákna kabelu, který v budově končí a je přiřazen ke stoupačce. Stejné vlákno nelze současně přiřadit dalšímu HP ani ODF portu. U HP lze navíc zapsat typ a skutečnou délku domovního kabelu, útlum podle vlnové délky, počet svarů a konektorových párů i zdroj hodnot; neznámé údaje nejsou nuly. Rozvody ukládá API do `App_Data/building-distribution.json`. Model vychází ze sekce 7 „Modelování FTTH“ v dodaném školení NetStork (str. 12–13); detailní zapojení splitterů uvnitř domu zatím neeviduje.

Optické vybavení je v detailu budovy: stojan, ODF/OLT police, OLT karty a číslované porty. ODF port ukončuje konkrétní vlákno koncového kabelu, OLT port se k němu připojuje propojkou. Ze zvoleného portu lze sledovat cestu přes kabelové úseky a spoje v šachtách; mapa zvýrazní její úseky. Otevřený konec a nejednoznačné propojení se zobrazí jako problém. Přenos do kalkulačky převezme známý útlum a zadanou skutečnou délku instalovaného kabelu v každém úseku; neznámá délka zůstane prázdná a ztráty spojů je nutné doplnit. Skutečná délka se zadává u kabelu v osazení trasy a může zahrnout rezervy, délka mapové čáry je pouze orientační. Fyzické porty jsou oddělené od katalogových profilů zařízení. Server ukládá vybavení do `App_Data/building-equipment.json`.

Webová pracovní plocha pro provozovatele infrastruktury. Na mapě lze založit budovu nebo šachtu, pojmenovat ji, přesunout a smazat. Dva body lze propojit podzemní trasou. Katastrální podklad umožňuje vybrat a zvýraznit parcelu.

## Nadzemní vedení a sloupy

Nástroj **Sloup** založí samostatný síťový bod. **Nadzemní trasa** propojuje sloupy a/nebo
budovy a používá stejný postup kreslení, úpravy lomů a navazování jako podzemní trasa.
V mapě je přerušovaná, podzemní trasa plná; druh je uveden také v seznamu, detailu,
schématu infrastruktury a výkazu. Podzemní úsek může končit na sloupu pro přechod do nadzemní části.

Do nadzemního úseku vložte kabel přímo, bez fiktivní chráničky. Pokračování ze sousedního
úseku zachová identitu fyzického kabelu i mezi podzemním a nadzemním vedením. Na sloupu
lze evidovat spojku, rezervu, svary a splittery. Průchozí kabel nevyžaduje umělý svar;
pro odbočení jej nejprve rozdělte na dva kabelové konce v editoru spojky.

V záložce **Trasa** lze vložit jeden sloup kliknutím do mapy nebo rovnoměrně rozmístit
1–100 nových sloupů podle jejich počtu či největší mapové rozteče. Náhled vyznačí polohy
před potvrzením. Jedním zápisem vzniknou všechny úseky; kabel a vazby na vlákna u původního
konce zůstanou zachované. Původní známá délka kabelu se uchová jako historický údaj, nové
délky se doplní zvlášť. Mapová rozteč není délka zavěšeného kabelu: skutečná délka zahrnuje
průvěs a rezervy. Náhled nenavrhuje únosnost sloupů ani dovolené rozpětí kabelu.

Nadzemní kreslení ani přesun nepoužívají kontrolu výkopu proti půdorysům budov. Výška,
průvěs, zavěšení a proveditelnost se z 2D mapy neověřují. Staré záznamy bez `kind` se čtou
jako `underground`; nové nadzemní záznamy mají `kind: aerial`. Oba druhy sdílejí úložiště
`underground-routes.json` a existující API, aby se zachovaly odkazy osazení, vláken a portů.

Rozsah vychází z dodaného **Školení NetStork**, str. 21, oddílu 15.3 (trasy mezi sloupy/budovami,
rovnoměrné dělení podle počtu nebo vzdálenosti), z [popisu modelování infrastruktury od Globemy](https://netstork.globema.cz/5-kroku-k-navrhu-vasi-telco-site-primo-v-netstorku-nasem-evidencnim-systemu/)
a z [instalační příručky Corning SRP 005-010](https://www.corning.com/content/dam/corning/catalog/coc/documents/standard-recommended-procedures/005-010.pdf),
oddílů 2.10 a 3.36–3.39 (rezervy a umístění spojek). Údaje konkrétního kabelu je potřeba převzít z jeho dokumentace.

## Jak to funguje

V prázdném poli se šedým příkladem „Např. …“ jej převezmete šipkou doprava; Tab dál přechází mezi poli.

React v prohlížeči zobrazuje mapu a objekty. ASP.NET Core API kontroluje vstupy a ukládá objekty do lokálního JSON souboru `backend/FiberNetworkStudio.Api/App_Data/network-points.json`. Soubor se vytvoří při prvním zápisu a není v Gitu. PostgreSQL s PostGIS zatím není připojené.

Přepínač **Katastr** připojuje online WMS ČÚZK od přiblížení 17. Kliknutí na mapu pak přes API načte jednu parcelu z [RÚIAN](https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/5), zvýrazní její obrys a ukáže číslo, území a výměru. Lze odtud založit budovu; parcela se zatím neukládá ani trvale nepřiřazuje k budově. Při výpadku ČÚZK zůstává základní mapa dostupná, pokud funguje její vlastní služba. [Podmínky ČÚZK](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx).

Mapu lze táhnout myší a přiblížit kolečkem bez další klávesy. Fungují také šipky, WASD a tlačítka přiblížení. Vybraná parcela je zvýrazněná modře.

Budovu nebo šachtu lze vybrat a kliknout do mapy, případně přetáhnout z nástrojů přímo na místo. Novou značku lze ještě před uložením uchopit a přesunout. Přetažením existujícího bodu nebo volbou **Změnit polohu kliknutím** se nová poloha uloží hned; tlačítko **Uložit** pak slouží ke změně názvu.

Panel **Nástroje mapy** seskupuje umisťování objektů a nastavení vrstev. Lze ho sbalit; na úzké obrazovce se otevírá sbalený.

Pravý panel **Infrastruktura** lze sbalit do úzké boční lišty a znovu otevřít. Přejetí položky v seznamu nebo objektu přímo v mapě zvýrazní příslušný bod či trasu; kliknutí na položku seznamu mapu přiblíží. Aktivní kreslení trasy a umisťování bodu označuje jemný barevný okraj mapy, podklad zůstává čitelný.

**Podzemní trasa:** nejprve založte alespoň dva body sítě. Koncové objekty vyberte v panelu Infrastruktura nebo kliknutím na mapu; před výběrem konce lze lomové body přidávat klikáním do mapy. U uložené trasy zvolte **Upravit průběh trasy** přímo nad záložkami. Po výběru obou konců klikněte přímo na úsek trasy nebo jej uchopte myší a táhněte kolem překážky. Kliknutí mimo trasu ji nezmění. Lomový bod mění jen průběh trasy, není samostatným objektem sítě. Mapové budovy se ukládají jako body; při kreslení a úpravě trasy aplikace načítá okolní půdorysy z RÚIAN, průchod cizí budovou zvýrazní a při dokončení znovu ověří. Nedostupná služba není považována za potvrzení bezkolizního průběhu; kontrola nenahrazuje posouzení skutečné proveditelnosti výkopu. Tlačítko Zpět odebere poslední krok; Esc kreslení zruší. Tlačítkem Dokončit kreslení přejdete do formuláře, zadáte název a teprve Uložit zapíše trasu. Uloženou trasu lze vybrat na mapě, upravit její lomové body tažením, prodloužit či smazat. Zobrazená délka je přibližná délka z mapy, nikoliv délka instalovaného kabelu. Posun koncového bodu plynule posune také lomové body navázané trasy podle jejich vzdálenosti od přesouvaného konce; počet lomů se nemění. Bod s navázanou trasou nelze smazat, dokud se trasa neupraví či nesmaže. Trasy ukládá API do `backend/FiberNetworkStudio.Api/App_Data/underground-routes.json`, odděleně od bodů.

**Osazení trasy:** vyberte uloženou trasu. Ta je jedním úsekem mezi dvěma body sítě. Do úseku vložte jednu nebo více chrániček, mikrotrubiček či sestav z katalogu. V další úrovni vyberte volnou pozici sestavy nebo vnitřek chráničky; kabel lze vložit do mikrotrubičky nebo přímo do prázdné chráničky. Přepínač **Pokračování** naváže tentýž fyzický prvek na sousední trasu se společným koncovým bodem. U sestavy mikrotrubiček lze v editoru jedním krokem vyplnit volné pozice podle vybraného katalogového typu; u výrobkového typu musí odpovídat také barva. Každý instalovaný prvek má vlastní ID, označení a kopii katalogové specifikace z okamžiku vložení; pozdější editace nebo smazání katalogového typu jej nepřepíše. Při odebrání se po potvrzení smaže i vše uložené uvnitř; souvislý prvek nelze tímto krokem rozdělit uprostřed. API brání dvojímu obsazení pozice a známému rozměrovému rozporu, ale chybějící průměry i společné uložení více trubiček zůstávají **neověřené**; schematický průřez není v měřítku. Trasu s osazením nelze smazat ani změnit její koncové body. Osazení ukládá API do `backend/FiberNetworkStudio.Api/App_Data/route-installations.json`. Sledování propojení jednotlivých vláken je popsáno výše.

**Šachta, potrubí a spojka:** mapa ukazuje trasu vedení a šachtu jako přístupný prostor. Detail šachty zobrazuje průchozí i končící chráničky. Průchozí chráničku lze rozdělit na dvě samostatně evidované části; oba konce pak zůstávají v detailu viditelné. Mikrotrubičky a kabely uvnitř se tím automaticky nerozdělí. V záložce **Trasa** lze naopak vložit novou šachtu do již osazené trasy: kliknutím na její čáru zvolíte místo a vzniknou dva navazující úseky. Celé osazení se rozdělí včetně vnořených prvků; průchozí kabel si zachová identitu fyzického vedení bez umělého svaru. Odkazy na vlákna u původního konce se přesunou na odpovídající nový úsek. Původní známá délka kabelu zůstane jako historický údaj, ale délky obou nových úseků je třeba změřit a zadat zvlášť. Šachta s evidovanou optickou spojkou má jemný fialový okraj; kliknutí na šachtu otevře její detail a odtud spojku. Jednotlivé svary a splittery se v mapě nekreslí, protože jsou uvnitř spojky. Editor má oddělené části pro spoje, splittery a kabelové rezervy. Svar propojuje dvě konkrétní vlákna; splitter eviduje jedno vstupní vlákno a jednotlivé připojené výstupy. Ztrátu lze zadat pro každou vlnovou délku a výstup zvlášť spolu se zdrojem hodnoty. Kabel, který má v šachtě zůstat průchozí, se nemusí znovu spojovat. Chcete-li zde jeho vlákna spojovat či odbočit, rozdělte jej v editoru na dva konce a pak je propojte. Prototyp eviduje jednu spojku v šachtě; jiná umístění spojek zatím neeviduje. API nepovolí dvojí obsazení vlákna ani smazání používaného kabelu. Data ukládá do `backend/FiberNetworkStudio.Api/App_Data/optical-splices.json`.

Prvky na nejvyšší úrovni leží v jednom úseku vedle sebe a v tomto prototypu platí po celé jeho délce. Pokud se osazení v průběhu trasy mění, model vyžaduje dva úseky s mezilehlým síťovým bodem; lomový bod mění pouze tvar čáry na mapě.

Po výběru uložené trasy se otevře záložka **Osazení** se stručným přehledem a rychlým přidáním prvku. **Otevřít editor osazení** zobrazí schéma po jednotlivých úrovních a úplný seznam. V seznamu lze prvek uchopit za úchyt a pustit přímo na vhodného rodiče, volnou pozici sestavy nebo na úsek; v detailu je tlačítko **Přesunout…** pro výběr cíle bez tažení. **Odebrat…** před smazáním prvku i jeho obsahu ukáže potvrzení. Přechod po cestě „Úsek → prvek“ současně přepne detail editovaného prvku. Server odmítá nepřípustné vztahy, cykly, obsazené pozice a známé rozměrové rozpory; chybějící údaje zůstávají neověřené. Záložka **Trasa** obsahuje koncové body, délku, název a úpravu průběhu. Mapa rozlišuje trasu bez osazení, osazenou bez kabelu a s kabelem barvou; legenda vysvětluje význam a seznam tras ukazuje počty. Barva vyjadřuje evidovaný obsah úseku, nikoliv ověřenou proveditelnost nebo propojení vláken.

V panelu mapy lze přepnout podklad mezi běžnou mapou a **Ortofotem ČR** od ČÚZK. **Katastr** je samostatná vrstva, kterou lze zapnout nad kterýmkoli podkladem. Přepnutí podkladu nemění uložené ani rozpracované objekty. Ortofoto je online služba pro území ČR; při jejím výpadku lze přepnout zpět na mapu. [Zdroj a podmínky služby ČÚZK](https://geoportal.cuzk.gov.cz/Default.aspx?metadataID=CZ-CUZK-WMTS-ORTOFOTO_900913&metadataXSL=metadata.sluzba&mode=TextMeta&side=wmts.uvod).

## Lokální spuštění

1. API: `dotnet run --project backend/FiberNetworkStudio.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`; objekty přes `/api/network-points` a parcely přes `/api/parcels/at`.

### Ukázka na jedné adrese

Kontejner sestaví frontend a API do jedné aplikace. Pro místní zákaznický proklik spusťte z kořene projektu:

```sh
docker build -t fiber-network-studio-preview:local .
docker volume create fiber-network-studio-demo-data
docker run --rm -p 127.0.0.1:8080:8080 -v fiber-network-studio-demo-data:/app/App_Data fiber-network-studio-preview:local
```

Otevřete `http://127.0.0.1:8080`. Mapa, katalogy, zákazníci i API běží pod stejnou adresou;
obnovení stránky funguje i na vnitřní cestě aplikace. Pojmenovaný svazek uchová backendová data
po restartu kontejneru. Kalkulačka ztrát a profily zařízení se zatím ukládají lokálně v prohlížeči;
pro přenos na jiný počítač použijte jejich export. Mapové podklady a kontrola půdorysů vyžadují
spojení s externími službami.

Zákazník otevírá pouze odkaz, Docker spouští provozovatel. Pro vzdálený přístup je třeba zvolit
hosting, zajistit trvalý svazek pro `/app/App_Data` a omezit přístup k ukázce; aplikace zatím nemá
přihlášení a může obsahovat záznamy zákazníků. Tento postup sám nevytváří veřejnou adresu.

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
Katalog eviduje specifikace; konkrétní kusy v mapových trasách eviduje oddělený modul osazení.

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

Ověření API, katalogů, výpočtů a mapových interakcí (Node 24):

```sh
dotnet build backend/FiberNetworkStudio.Api
node --test tests/*.test.mjs
pnpm --dir frontend build
pnpm --dir frontend lint
```

Stejné kontroly spouští GitHub Actions při PR do `dev` nebo `main`.

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

Panel **Optické ztráty** počítá jednu ručně zadanou nebo z mapy přenesenou optickou cestu.
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

## Katalog chrániček a mikrotrubiček

V horní navigaci otevřete **Chráničky**. Katalog obsahuje samostatné chráničky,
mikrotrubičky a schematické sestavy pozic (např. 2 × 5 chrániček). Základní
šablony nemají vymyšlené rozměry ani výrobce. Jeden vzorový typ Hexatronic 7/3,5 mm
má údaje převzaté z [technického listu výrobce](https://www.hexatronic.com/hubfs/datasheets/28701-MPB30284BK1AX_en-uk_Hexatronic.pdf).
Vytvořte kopii šablony a doplňte
parametry konkrétního výrobku z technického listu. Pro každou pozici sestavy lze
zadat druh, název, barvu a vnější/vnitřní průměr. Grafický průřez je přehledové
schéma; u sestav není instalačním výkresem v měřítku.

Katalog kabelů nově ukládá nepovinný vnější průměr kabelu a výrobcem uváděný
nejmenší vnitřní průměr trubičky. Starší kabely tyto údaje nemají. Výběr kabelu
v detailu chráničky provede pouze předběžnou rozměrovou kontrolu. Výsledek
„možný“ neznamená, že výrobce schvaluje zafouknutí nebo zatažení; závisí také
na typu výrobku, způsobu instalace a trase. Chybějící rozměr se nebere jako nula.

API `/api/duct-catalog` ukládá vlastní typy do `App_Data/duct-catalog.json`;
cestu lze změnit přes `DuctCatalog:Path`. Záznamy jsou verzované proti souběžnému
přepsání. Modul `frontend/src/features/duct-catalog` odděluje datový model,
komunikaci, stav a UI. Jde o katalog **typů**; skutečné kusy vložené do mapové
trasy, jejich návaznost a obsazení pozic přijdou v navazujícím issue #8.

Podklady: školení NetStork str. 5–6, [ITU-T L.162](https://www.itu.int/itu-t/recommendations/rec.aspx?lang=en&rec=13112),
[Prysmian Sirocco](https://www.prysmiangroup.com/sites/default/files/atoms/files/122698-pry-sirocco-2023-210x297mm-aw-v06.pdf).
