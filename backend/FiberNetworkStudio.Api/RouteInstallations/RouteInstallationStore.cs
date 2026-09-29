using System.Text.Json;
using FiberNetworkStudio.Api.CableCatalog;
using FiberNetworkStudio.Api.DuctCatalog;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.RouteInstallations;

public sealed record InstalledItem(Guid Id, Guid RouteId, Guid? ParentId, int? SlotIndex,
    string Label, Guid CatalogId, Guid RunId, DuctType? Duct, CableSpecification? Cable);

public sealed record RouteInstallationDocument(Guid RouteId, int Version, List<InstalledItem> Items);

public sealed record AddInstalledItemRequest(Guid? CatalogId, Guid? ParentId, int? SlotIndex,
    string? Label, int Version, Guid? ContinueFromItemId);

public sealed record RenameInstalledItemRequest(string? Label, int Version);
public sealed record MoveInstalledItemRequest(Guid? ParentId, int? SlotIndex, int Version);

public sealed record InstallationResult(int Status, RouteInstallationDocument? Document, string? Error)
{
    public static InstallationResult Ok(RouteInstallationDocument document) => new(200, document, null);
    public static InstallationResult Fail(int status, string error) => new(status, null, error);
}

public sealed class RouteInstallationStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<IReadOnlyList<RouteInstallationDocument>> ListAsync()
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).ToArray(); }
        finally { gate.Release(); }
    }

    public async Task<bool> HasItemsAsync(Guid routeId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => document.RouteId == routeId && document.Items.Count > 0); }
        finally { gate.Release(); }
    }

    public async Task<InstallationResult> AddAsync(UndergroundRoute route,
        IReadOnlyList<UndergroundRoute> routes, AddInstalledItemRequest request,
        DuctType? duct, CableSpecification? cable)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            var current = documents.Find(document => document.RouteId == route.Id)
                ?? new RouteInstallationDocument(route.Id, 0, []);
            if (current.Version != request.Version) return InstallationResult.Fail(409, "Osazení mezitím změnil jiný uživatel. Načtěte trasu znovu.");

            var runId = Guid.NewGuid();
            var catalogId = request.CatalogId;
            string? continuationLabel = null;
            if (request.ContinueFromItemId is Guid continuedId)
            {
                var source = documents.SelectMany(document => document.Items)
                    .FirstOrDefault(item => item.Id == continuedId);
                var sourceRoute = routes.FirstOrDefault(item => item.Id == source?.RouteId);
                if (source is null || sourceRoute is null || sourceRoute.Id == route.Id
                    || !ShareEndpoint(route, sourceRoute))
                    return InstallationResult.Fail(400, "Navázat lze jen na instalaci v sousedním úseku se společným koncovým bodem.");
                if (current.Items.Any(item => item.RunId == source.RunId))
                    return InstallationResult.Fail(409, "Stejný souvislý prvek je v této trase už evidován.");
                var runRoutes = documents.SelectMany(document => document.Items)
                    .Where(item => item.RunId == source.RunId).Select(item => item.RouteId).ToHashSet();
                runRoutes.Add(route.Id);
                if (!FormsSinglePath(runRoutes, routes))
                    return InstallationResult.Fail(409, "Pokračování by vytvořilo odbočku nebo nesouvislou cestu jednoho prvku.");
                (duct, cable, catalogId, runId, continuationLabel) =
                    (source.Duct, source.Cable, source.CatalogId, source.RunId, source.Label);
            }
            if (catalogId is null || (duct is null) == (cable is null))
                return InstallationResult.Fail(400, "Vyberte existující typ chráničky, mikrotrubičky, sestavy nebo kabelu.");
            var label = string.IsNullOrWhiteSpace(request.Label)
                ? continuationLabel ?? duct?.Name ?? cable!.Name : request.Label.Trim();
            if (label.Length is < 1 or > 80) return InstallationResult.Fail(400, "Označení prvku musí mít 1 až 80 znaků.");
            var placementError = ValidatePlacement(current.Items, request.ParentId, request.SlotIndex, duct, cable);
            if (placementError is not null) return InstallationResult.Fail(409, placementError);

            var item = new InstalledItem(Guid.NewGuid(), route.Id, request.ParentId, request.SlotIndex,
                label, catalogId.Value, runId, duct, cable);
            var updated = new RouteInstallationDocument(route.Id, current.Version + 1, [.. current.Items, item]);
            documents.RemoveAll(document => document.RouteId == route.Id);
            documents.Add(updated);
            await WriteAsync(documents);
            return InstallationResult.Ok(updated);
        }
        finally { gate.Release(); }
    }

    public async Task<InstallationResult> RenameAsync(Guid routeId, Guid itemId, RenameInstalledItemRequest request)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            var current = documents.Find(document => document.RouteId == routeId);
            if (current is null) return InstallationResult.Fail(404, "Osazení trasy neexistuje.");
            if (current.Version != request.Version) return InstallationResult.Fail(409, "Osazení mezitím změnil jiný uživatel. Načtěte trasu znovu.");
            if (string.IsNullOrWhiteSpace(request.Label) || request.Label.Trim().Length > 80)
                return InstallationResult.Fail(400, "Označení prvku musí mít 1 až 80 znaků.");
            if (current.Items.All(item => item.Id != itemId)) return InstallationResult.Fail(404, "Instalovaný prvek neexistuje.");
            var updated = current with { Version = current.Version + 1,
                Items = current.Items.Select(item => item.Id == itemId ? item with { Label = request.Label.Trim() } : item).ToList() };
            documents[documents.IndexOf(current)] = updated;
            await WriteAsync(documents);
            return InstallationResult.Ok(updated);
        }
        finally { gate.Release(); }
    }

    public async Task<InstallationResult> MoveAsync(Guid routeId, Guid itemId, MoveInstalledItemRequest request)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            var current = documents.Find(document => document.RouteId == routeId);
            if (current is null) return InstallationResult.Fail(404, "Osazení trasy neexistuje.");
            if (current.Version != request.Version) return InstallationResult.Fail(409, "Osazení mezitím změnil jiný uživatel. Načtěte trasu znovu.");
            var moved = current.Items.Find(item => item.Id == itemId);
            if (moved is null) return InstallationResult.Fail(404, "Instalovaný prvek neexistuje.");
            if (moved.ParentId == request.ParentId && moved.SlotIndex == request.SlotIndex)
                return InstallationResult.Ok(current);

            var ancestorId = request.ParentId;
            var visited = new HashSet<Guid>();
            while (ancestorId is Guid id)
            {
                if (id == moved.Id || !visited.Add(id))
                    return InstallationResult.Fail(409, "Prvek nelze vložit do sebe ani do svého obsahu.");
                ancestorId = current.Items.Find(item => item.Id == id)?.ParentId;
            }
            var remaining = current.Items.Where(item => item.Id != itemId).ToList();
            var placementError = ValidatePlacement(remaining, request.ParentId, request.SlotIndex,
                moved.Duct, moved.Cable);
            if (placementError is not null) return InstallationResult.Fail(409, placementError);

            var updated = current with { Version = current.Version + 1,
                Items = [.. remaining, moved with { ParentId = request.ParentId, SlotIndex = request.SlotIndex }] };
            documents[documents.IndexOf(current)] = updated;
            await WriteAsync(documents);
            return InstallationResult.Ok(updated);
        }
        finally { gate.Release(); }
    }

    public async Task<InstallationResult> RemoveAsync(Guid routeId, Guid itemId, int version,
        IReadOnlyList<UndergroundRoute> routes)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            var current = documents.Find(document => document.RouteId == routeId);
            if (current is null) return InstallationResult.Fail(404, "Osazení trasy neexistuje.");
            if (current.Version != version) return InstallationResult.Fail(409, "Osazení mezitím změnil jiný uživatel. Načtěte trasu znovu.");
            var removed = current.Items.Find(item => item.Id == itemId);
            if (removed is null) return InstallationResult.Fail(404, "Instalovaný prvek neexistuje.");
            var removedIds = new HashSet<Guid> { itemId };
            while (true)
            {
                var children = current.Items.Where(item => item.ParentId is Guid parentId && removedIds.Contains(parentId))
                    .Select(item => item.Id).ToArray();
                var found = false;
                foreach (var childId in children) found |= removedIds.Add(childId);
                if (!found) break;
            }
            var affectedRuns = current.Items.Where(item => removedIds.Contains(item.Id))
                .Select(item => item.RunId).Distinct();
            foreach (var runId in affectedRuns)
            {
                var remainingRunRoutes = documents.SelectMany(document => document.Items)
                    .Where(item => item.RunId == runId && !removedIds.Contains(item.Id))
                    .Select(item => item.RouteId).ToHashSet();
                if (!FormsSinglePath(remainingRunRoutes, routes))
                    return InstallationResult.Fail(409, "Nejdřív odeberte navazující krajní úseky; souvislý prvek nelze rozdělit uprostřed.");
            }
            var updated = current with { Version = current.Version + 1,
                Items = current.Items.Where(item => !removedIds.Contains(item.Id)).ToList() };
            documents[documents.IndexOf(current)] = updated;
            await WriteAsync(documents);
            return InstallationResult.Ok(updated);
        }
        finally { gate.Release(); }
    }

    private static bool ShareEndpoint(UndergroundRoute a, UndergroundRoute b) =>
        a.StartPointId == b.StartPointId || a.StartPointId == b.EndPointId
        || a.EndPointId == b.StartPointId || a.EndPointId == b.EndPointId;

    private static bool FormsSinglePath(HashSet<Guid> routeIds, IReadOnlyList<UndergroundRoute> routes)
    {
        if (routeIds.Count <= 1) return true;
        var selected = routes.Where(route => routeIds.Contains(route.Id)).ToArray();
        if (selected.Length != routeIds.Count) return false;
        var degree = new Dictionary<Guid, int>();
        foreach (var route in selected)
        {
            degree[route.StartPointId] = degree.GetValueOrDefault(route.StartPointId) + 1;
            degree[route.EndPointId] = degree.GetValueOrDefault(route.EndPointId) + 1;
        }
        if (degree.Values.Any(value => value > 2)) return false;
        var seen = new HashSet<Guid> { selected[0].Id };
        var queue = new Queue<UndergroundRoute>();
        queue.Enqueue(selected[0]);
        while (queue.TryDequeue(out var current))
            foreach (var next in selected.Where(route => !seen.Contains(route.Id) && ShareEndpoint(current, route)))
            {
                seen.Add(next.Id);
                queue.Enqueue(next);
            }
        return seen.Count == selected.Length && degree.Values.Count(value => value == 1) == 2;
    }

    private static string? ValidatePlacement(List<InstalledItem> items, Guid? parentId, int? slotIndex,
        DuctType? duct, CableSpecification? cable)
    {
        if (parentId is null)
            return slotIndex is not null || cable is not null
                ? "Na volnou trasu vložte nejdřív chráničku, mikrotrubičku nebo sestavu." : null;
        var parent = items.Find(item => item.Id == parentId);
        if (parent?.Duct is null) return "Vybraný nadřazený prvek neexistuje nebo není trubičkou.";
        var siblings = items.Where(item => item.ParentId == parentId).ToArray();
        if (parent.Duct.Kind == "assembly")
        {
            if (cable is not null || duct is null || slotIndex is null || slotIndex < 0
                || slotIndex >= parent.Duct.Slots.Length)
                return "V sestavě vyberte volnou pozici pro odpovídající chráničku či mikrotrubičku.";
            if (siblings.Any(item => item.SlotIndex == slotIndex)) return "Tato pozice je už obsazená.";
            var slot = parent.Duct.Slots[slotIndex.Value];
            if (duct.Kind != slot.Kind) return "Druh prvku neodpovídá vybrané pozici sestavy.";
            if (TooLarge(duct.OuterDiameterMm, slot.InnerDiameterMm)) return "Prvek je větší než volný vnitřní průměr pozice.";
            return null;
        }
        if (slotIndex is not null) return "Pozici lze vybírat jen uvnitř sestavy.";
        if (parent.Duct.Kind == "microduct")
        {
            if (cable is null) return "Do mikrotrubičky lze vložit kabel.";
            if (siblings.Length > 0) return "Mikrotrubička už obsahuje kabel.";
        }
        else if (parent.Duct.Kind == "conduit")
        {
            if (cable is not null && siblings.Length > 0)
                return "Chránička už obsahuje kabel nebo trubičky; přímé osazení nemíchejte.";
            if (duct is not null && (duct.Kind == "conduit" || siblings.Any(item => item.Cable is not null)))
                return "Do chráničky lze vložit mikrotrubičku či sestavu, pokud v ní není přímý kabel.";
            if (duct?.OuterDiameterMm is double outer && parent.Duct.InnerDiameterMm is double inner
                && siblings.All(item => item.Duct?.OuterDiameterMm is not null)
                && outer * outer + siblings.Sum(item => Math.Pow(item.Duct!.OuterDiameterMm!.Value, 2)) >= inner * inner)
                return "Součet průřezů vložených prvků překračuje dostupný průřez chráničky.";
        }
        if (duct is not null && TooLarge(duct.OuterDiameterMm, parent.Duct.InnerDiameterMm))
            return "Vnější průměr vloženého prvku překračuje vnitřní průměr trubičky.";
        if (cable is not null)
        {
            var minimum = cable.MinimumDuctInnerDiameterMm ?? cable.OuterDiameterMm;
            if (minimum is not null && parent.Duct.InnerDiameterMm is not null
                && (cable.MinimumDuctInnerDiameterMm is not null
                    ? parent.Duct.InnerDiameterMm < minimum : parent.Duct.InnerDiameterMm <= minimum))
                return "Kabel se podle zadaných průměrů do trubičky nevejde.";
        }
        return null;
    }

    private static bool TooLarge(double? outer, double? inner) =>
        outer is not null && inner is not null && outer >= inner;

    private async Task<List<RouteInstallationDocument>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<RouteInstallationDocument>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Route installation data must be a JSON array.");
    }

    private async Task WriteAsync(List<RouteInstallationDocument> documents)
    {
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);
        var tempPath = Path.Combine(directory, $"route-installations-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, documents, JsonOptions);
                await stream.FlushAsync();
            }
            File.Move(tempPath, path, true);
        }
        finally { if (File.Exists(tempPath)) File.Delete(tempPath); }
    }
}
