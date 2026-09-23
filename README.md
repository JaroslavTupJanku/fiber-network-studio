# Fiber Network Studio

Webová pracovní plocha pro provozovatele infrastruktury. Na mapě lze ručně založit budovu nebo šachtu, pojmenovat ji, přesunout a smazat. Katastrální podklad pomáhá s orientací; další síťové prvky doplníme později.

## Jak to funguje

React v prohlížeči zobrazuje mapu a objekty. ASP.NET Core API kontroluje vstupy a ukládá objekty do lokálního JSON souboru `backend/FiberNetworkStudio.Api/App_Data/network-points.json`. Soubor se vytvoří při prvním zápisu a není v Gitu. PostgreSQL s PostGIS zatím není připojené.

Přepínač **Katastr** v mapě připojuje veřejnou online WMS službu ČÚZK. Při zapnutí a přiblížení se načítají jen viditelné mapové dlaždice; při vypnutí se vrstva odpojí. Při výpadku ČÚZK zůstává základní mapa dostupná, pokud funguje její vlastní služba. Katastr je zatím jen obrazový podklad, ne výběr parcel nebo evidence budov. Zdroj: [ČÚZK](https://wms.cuzk.gov.cz/), [podmínky služby](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx).

## Lokální spuštění

1. API: `dotnet run --project backend/FiberNetworkStudio.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`; objekty přes `/api/network-points`. Aktuální práce je na větvi `codex/network-points`.

Stručné vysvětlení pojmů je v [poznámkách k webovému vývoji](docs/web-vyvoj.md).
