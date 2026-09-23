# Síťová evidence

Webová pracovní plocha pro provozovatele infrastruktury. Zatím obsahuje mapu s výběrem místa a prázdné ASP.NET Core API. Evidenci objektů a přesné pracovní postupy doplníme po společném návrhu.

## Jak to funguje

React v prohlížeči zobrazuje mapu. ASP.NET Core bude zpracovávat požadavky a pravidla aplikace. PostgreSQL s PostGIS bude uchovávat objekty a jejich polohu; databáze zatím není připojená.

## Lokální spuštění

1. API: `dotnet run --project backend/Stepan.Api --launch-profile http`
2. Frontend: `pnpm --dir frontend install` a `pnpm --dir frontend dev`
3. Otevřít adresu, kterou vypíše Vite (obvykle `http://localhost:5173`).

API odpovídá na `http://localhost:5291/api/health`. Vývoj probíhá na větvi `dev`, `main` drží stabilní stav. Projekt zatím nemá vzdálený Git repozitář.

Stručné vysvětlení pojmů je v [poznámkách k webovému vývoji](docs/web-vyvoj.md).
