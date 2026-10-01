# Webový vývoj: krátké poznámky

**Domovní rozvod** je další příklad oddělení dat od zobrazení: React editor skládá stoupačku, podlažní box a přípojné místo; API před zápisem ověřuje vazby, jedinečnost vlákna a verzi dokumentu. Typ „bytový dům“ mění ikonu mapového bodu, zatímco identita budovy a navázané trasy zůstávají stejné. Data rozvodu jsou v samostatném JSON souboru; při pozdějším přechodu na databázi se zachovají ID prvků a vazby na kabelová vlákna.

**ODF** je optický rozvaděč, kde se vlákno kabelu ukončí na konkrétním portu. **OLT** je aktivní zařízení v ústředně; jeho karta má vlastní porty. V aplikaci jsou stojan, police, karta a port konkrétní vybavení budovy, zatímco katalogový profil popisuje parametry typu zařízení pro výpočet. **Propojka** spojuje ODF a OLT port. Sledování cesty skládá vazby portů, kabelových vláken, svarů a splitterů jako graf; u větvení vyžaduje volbu výstupu. Mapa zvýrazní dotčené úseky, jednotlivé porty zůstávají uvnitř detailu budovy. Skutečná délka instalovaného kabelu je samostatný volitelný údaj každého úseku, takže přenos do kalkulačky nemusí odhadovat délku z mapy.

## Jak o našem projektu mluvit

> Stavíme webovou aplikaci pro návrh optických sítí. React v prohlížeči zobrazuje mapu, katalogy a kalkulačku. Backend v ASP.NET Core přijímá požadavky, kontroluje data a ukládá katalogy kabelů a chrániček i mapové objekty. Frontend s backendem komunikují přes API. Zatím je to prototyp; část dat ukládá server do JSON souborů a rozpracovaný výpočet zůstává v prohlížeči.

Po nasazení uživatel otevře jen webovou adresu. Dva vývojové procesy spouštíme pouze při práci na kódu; sestavený frontend lze podávat spolu s API z jedné adresy.

## Co se stane po kliknutí na „Uložit“

1. React vezme hodnoty z formuláře. Dokud je uživatel mění, tvoří **stav** stránky a ještě nemusí být uložené.
2. Frontend odešle přes **HTTP** požadavek na **API**. Typicky pošle data jako **JSON**; například `POST` založí nový typ chráničky.
3. Backend zkontroluje pravidla (například že vnitřní průměr je menší než vnější) a platný záznam uloží. Při chybě vrátí vysvětlení a nic neuloží.
4. Frontend zobrazí výsledek nebo chybovou zprávu. Po novém načtení stránky si uložený záznam opět vyžádá od serveru.

## Pojmy webového vývoje

**Frontend** běží v prohlížeči. Skládá obrazovku, reaguje na kliknutí a zobrazuje odpovědi serveru. Tady používáme React a TypeScript.

**Backend** běží na serveru. Přijímá požadavky, kontroluje pravidla a pracuje s uloženými daty. Tady ho píšeme v C# na ASP.NET Core.

**API** je domluvené rozhraní mezi frontendem a backendem, ne další obrazovka. Určuje, jaké požadavky lze poslat a jaká data se vrátí. **HTTP** je způsob přenosu požadavku; **JSON** je běžný textový formát přenášených dat. `GET` načítá, `POST` zakládá, `PUT` upravuje a `DELETE` maže záznamy.

**Uložení dat** má dvě místa. Katalogy a mapové objekty ukládá backend do JSON souborů, takže zůstanou i po restartu serveru a vidí je uživatelé stejné instance. Rozpracovanou kalkulaci a katalog profilů zařízení drží **localStorage** konkrétního prohlížeče. Pro společný provoz později použijeme databázi PostgreSQL; PostGIS přidává práci s polohou a tvary na mapě.

**Komponenta** je část obrazovky, třeba seznam kabelů. **Stav** jsou hodnoty, které se při používání mění, třeba rozepsaný formulář. V Reactu nepoužíváme formální MVVM: komponenty zobrazují rozhraní, vlastní **hook** spravuje stav a akce, model obsahuje pravidla a modul API komunikuje se serverem. Mapa je stejným způsobem oddělená od hlavní navigace. Backend dělíme na endpointy, pravidla a ukládání dat. Při každém PR automaticky běží lint, sestavení a testy.

**Vite** spouští frontend při vývoji a připraví jeho soubory pro nasazení. **Nasazení** znamená umístit sestavenou aplikaci na server, aby ji lidé otevřeli přes webovou adresu.

**CRUD** je zkratka pro založení, načtení, úpravu a smazání záznamu. Takto naše API spravuje například katalog chrániček. Katastr je naproti tomu online podklad od ČÚZK, jehož data při kliknutí pouze čteme.

## Pojmy mapy a optické sítě

**Mapový podklad** je obraz země pod našimi objekty. Uživatel přepíná mezi běžnou mapou a ortofotem ČÚZK. **Mapová vrstva** je samostatný obsah nad podkladem: například katastr nebo naše body. Přepnutí podkladu pouze mění, co MapLibre kreslí; neukládá ani nemaže síťové objekty. **WMS** je služba, která podle polohy a měřítka vrací obrázky mapy; zde přes ni zobrazujeme katastr ČÚZK.

**Parcela** je evidovaný pozemek, ne naše budova. **Polygon** je tvar její hranice. Po kliknutí backend požádá online službu RÚIAN o data jedné parcely ve formátu **GeoJSON**; číslo a obrys zobrazíme, ale neukládáme. **WMTS** dodává hotové mapové dlaždice; ortofoto ČÚZK načítáme jako dlaždice kompatibilní s tímto principem. **WFS** umí dotazy na mapové objekty, ale zatím ho nepoužíváme.

**Gesto** je způsob ovládání myší nebo dotykem. MapLibre zde zajišťuje posun tažením a přiblížení kolečkem; aplikace nastavuje vzhled kurzoru.

**Drag and drop** znamená přetáhnout prvek a pustit ho na cílovém místě. U nás mapa převede místo puštění na souřadnice; objekt se uloží až po potvrzení formuláře.

V editoru osazení se přetažením ve stromu mění nadřazený prvek kabelu nebo trubičky. Frontend zvýrazní jen vhodné cíle a po puštění volá API s ID prvku, novým rodičem, případnou pozicí v sestavě a verzí dokumentu. Backend znovu ověří pravidla uložení; tlačítko **Přesunout…** nabídne stejnou operaci bez přetahování. Při odebrání rodiče API atomicky odebere celý jeho podstrom, pokud tím nepřeruší souvislý prvek v jiných úsecích.

**Rozpracovaná poloha** je změna bodu viditelná ve frontendu. Při tažení se překreslí bod v mapové vrstvě GeoJSON, ale backend dostane nové souřadnice až po kliknutí na **Uložit**.

**Podzemní trasa** propojuje dva uložené mapové body a mezi nimi může mít seřazené lomové body. Po výběru obou konců jen kliknutí nebo uchopení přímo na trase vloží lomový bod do geometricky nejbližšího segmentu; výpočet probíhá v obrazových souřadnicích mapy. Uložená trasa nabízí přímou akci **Upravit průběh trasy**, která otevře režim kreslení. Při kreslení a úpravách vidí uživatel náhled; server dostane změnu až po **Uložit**. Krajní body uchováváme jejich identitou, takže se průběh trasy přizpůsobí přesunu budovy či šachty. Přibližná délka vychází z mapy, ne z evidence skutečně uloženého kabelu. Backend kontroluje koncové body a souřadnice a ukládá trasy do samostatného JSON souboru. Při dokončení i přesunu navázaného bodu frontend požádá API o půdorysy budov z RÚIAN jen podél trasy a označí průchod cizí budovou. Mapové budovy dál ukládáme jako body; tato kontrola nenahrazuje ověření skutečné proveditelnosti výkopu.

**Optické ztráty** jsou úbytek signálu na kabelu, spojích a rozbočovačích. V aplikaci se
počítají pro jednu zadanou cestu. **dB** je jednotka ztráty; **dBm** vyjadřuje výkon signálu
na výstupu nebo vstupu zařízení. Stejné číslo v dB a dBm proto neznamená totéž.

**OLT** je zařízení provozovatele sítě; **ONT/ONU** je koncové zařízení u zákazníka.
**GPON** a **XGS-PON** jsou dva způsoby přenosu po pasivní optické síti. Každý má svůj
směr k zákazníkovi a zpět, odlišné vlnové délky a vhodné typy zařízení. **Profil zařízení**
je katalogový typ portu, karty, koncového zařízení nebo optického modulu s hodnotami
z technického listu výrobce, ne jednotlivý namontovaný prvek.

**Návrhová rezerva** je prostor pro budoucí zhoršení cesty. Kalkulačka ji připočte ke
ztrátě při kontrole, zda do přijímače dorazí dostatečně silný signál. Příliš silný signál
kontroluje zvlášť podle nejvyššího výkonu vysílače a hranice přetížení přijímače.
Výsledek je odhad podle zadaných údajů, nikoli náhrada měření hotové sítě.

**Úsek trasy** je jedna podzemní cesta mezi dvěma síťovými body; lomové body mění jen její tvar. Více chrániček v úseku leží vedle sebe. Osazení zde zatím platí po celé délce úseku.

**Katalogový typ** popisuje výrobek nebo opakovaně použitelné rozložení. **Instalovaný
prvek** je konkrétní chránička či kabel v jednom úseku mapové trasy. Při vložení se pořídí
kopie katalogových údajů, takže úprava typu nemění již zaznamenaný prvek. Prvky tvoří strom
(chránička → mikrotrubička → kabel); obsazená pozice se nesmí použít dvakrát. Stejný
fyzický prvek může pokračovat v sousedním úseku, pokud sdílejí koncový síťový bod.
**Mikrotrubička** chrání kabel zvenku. **Tuba kabelu** je naopak součást
samotného kabelu a obsahuje optická vlákna. Jejich průměry ani barvy se nezaměňují.
**Předběžná rozměrová kontrola** porovná kabel s vnitřkem trubičky; sama nepotvrzuje,
že je výrobek vhodný pro zvolený způsob instalace.

**Uložení prototypu:** rozpracovaný výpočet a katalog profilů zařízení jsou nyní
v tomto prohlížeči. Pro přenos na jiný počítač se exportují dva soubory: nejprve se
tam importuje katalog profilů, potom výpočet. Katalog kabelů i chrániček ukládá API na
backendu. Zákazníkovi lze nasazenou aplikaci otevřít jedním odkazem; frontend a
backend spouští zvlášť jen vývojář při práci na vlastním počítači.
