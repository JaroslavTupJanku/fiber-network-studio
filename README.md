# Fiber Network Studio

Webová pracovní plocha pro provozovatele infrastruktury. Zatím obsahuje mapu s výběrem místa, zapínatelný katastrální podklad a prázdné ASP.NET Core API. Evidenci objektů a přesné pracovní postupy doplníme po společném návrhu.

## Jak to funguje

React v prohlížeči zobrazuje mapu. ASP.NET Core bude zpracovávat požadavky a pravidla aplikace. PostgreSQL s PostGIS bude uchovávat objekty a jejich polohu; databáze zatím není připojená.

Přepínač **Katastr** v mapě připojuje veřejnou online WMS službu ČÚZK. Při zapnutí a přiblížení se načítají jen viditelné mapové dlaždice; při vypnutí se vrstva odpojí. Při výpadku ČÚZK zůstává základní mapa dostupná, pokud funguje její vlastní služba. Katastr je zatím jen obrazový podklad, ne výběr parcel nebo evidence budov. Zdroj: [ČÚZK](https://wms.cuzk.gov.cz/), [podmínky služby](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-sitovych-sluzeb-CUZK.aspx).

## Lokální spuštění

1. API: `dotnet run --project backend/FiberNetworkStudio.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`. Vývoj probíhá na větvi `dev`, `main` drží stabilní stav.

Stručné vysvětlení pojmů je v [poznámkách k webovému vývoji](docs/web-vyvoj.md).
