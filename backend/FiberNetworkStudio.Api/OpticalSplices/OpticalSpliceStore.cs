using System.Text.Json;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.OpticalSplices;

public sealed record FiberEnd(Guid ItemId, int TubeIndex, int FiberIndex);
public sealed record FiberConnection(Guid Id, FiberEnd Left, FiberEnd Right, string Kind);
public sealed record CableReserve(Guid ItemId, double LengthMeters);
public sealed record SplitterOutput(int Position, FiberEnd Fiber, double? Loss1270Db,
    double? Loss1310Db, double? Loss1490Db, double? Loss1550Db, double? Loss1577Db);
public sealed record OpticalSplitter(Guid Id, string Name, int OutputCount, FiberEnd? Input,
    List<SplitterOutput> Outputs, string? LossSource);
public sealed record OpticalSpliceDocument(Guid PointId, int Version, string Name,
    List<FiberConnection> Connections, List<CableReserve> Reserves, List<OpticalSplitter> Splitters);
public sealed record SaveOpticalSpliceRequest(int Version, string? Name,
    List<FiberConnection>? Connections, List<CableReserve>? Reserves, List<OpticalSplitter>? Splitters);
public sealed record SpliceResult(int Status, OpticalSpliceDocument? Document, string? Error)
{
    public static SpliceResult Ok(OpticalSpliceDocument document) => new(200, document, null);
    public static SpliceResult Fail(int status, string error) => new(status, null, error);
}

public sealed class OpticalSpliceStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<List<OpticalSpliceDocument>> ListAsync()
    {
        await gate.WaitAsync();
        try { return await ReadAsync(); }
        finally { gate.Release(); }
    }

    public async Task<OpticalSpliceDocument> GetAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Find(item => item.PointId == pointId)
            ?? new OpticalSpliceDocument(pointId, 0, "", [], [], []); }
        finally { gate.Release(); }
    }

    public async Task<bool> HasSpliceAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(item => item.PointId == pointId); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesAnyAsync(IEnumerable<Guid> itemIds)
    {
        var ids = itemIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => document.Connections.Any(connection =>
            ids.Contains(connection.Left.ItemId) || ids.Contains(connection.Right.ItemId))
            || document.Reserves.Any(reserve => ids.Contains(reserve.ItemId))
            || document.Splitters.Any(splitter => splitter.Input is not null && ids.Contains(splitter.Input.ItemId)
                || splitter.Outputs.Any(output => ids.Contains(output.Fiber.ItemId)))); }
        finally { gate.Release(); }
    }

    public async Task<bool> ConnectsItemAtAnyAsync(Guid itemId, IEnumerable<Guid> pointIds)
    {
        var ids = pointIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => ids.Contains(document.PointId)
            && (document.Connections.Any(connection => connection.Left.ItemId == itemId
                || connection.Right.ItemId == itemId)
                || document.Splitters.Any(splitter => splitter.Input?.ItemId == itemId
                    || splitter.Outputs.Any(output => output.Fiber.ItemId == itemId)))); }
        finally { gate.Release(); }
    }

    public async Task<SpliceResult> SaveAsync(Guid pointId, SaveOpticalSpliceRequest request,
        IReadOnlyList<UndergroundRoute> routes, IReadOnlyList<RouteInstallationDocument> installations)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            var current = documents.Find(item => item.PointId == pointId);
            if ((current?.Version ?? 0) != request.Version)
                return SpliceResult.Fail(409, "Spojku mezitím změnil jiný uživatel. Načtěte ji znovu.");
            if (request.Name is null || request.Name.Trim().Length is < 1 or > 80)
                return SpliceResult.Fail(400, "Zadejte název spojky (1 až 80 znaků).");
            if (request.Connections is null || request.Reserves is null
                || request.Connections.Count > 1000 || request.Reserves.Count > 100
                || request.Reserves.Any(item => item is null))
                return SpliceResult.Fail(400, "Příliš mnoho spojů nebo kabelových rezerv.");

            var splitters = request.Splitters ?? current?.Splitters ?? [];
            if (splitters.Count > 100 || splitters.Any(item => item is null))
                return SpliceResult.Fail(400, "Příliš mnoho splitterů.");
            var routeIds = routes.Where(route => route.StartPointId == pointId || route.EndPointId == pointId)
                .Select(route => route.Id).ToHashSet();
            var cables = installations.Where(document => routeIds.Contains(document.RouteId))
                .SelectMany(document => document.Items).Where(item => item.Cable is not null).ToArray();
            var byId = cables.ToDictionary(item => item.Id);
            // One continuous run passing through this point is already connected by the route model.
            var throughRuns = cables.GroupBy(item => item.RunId).Where(group => group.Count() > 1)
                .Select(group => group.Key).ToHashSet();
            string? ValidateEnd(FiberEnd end)
            {
                if (!byId.TryGetValue(end.ItemId, out var item) || throughRuns.Contains(item.RunId))
                    return "Vyberte konec kabelu přivedeného do tohoto bodu. Průběžný kabel se nespojuje znovu.";
                if (end.TubeIndex < 0 || end.TubeIndex >= item.Cable!.Tubes.Length
                    || end.FiberIndex < 0 || end.FiberIndex >= item.Cable.Tubes[end.TubeIndex].Fibers.Length)
                    return "Vybrané vlákno v kabelu neexistuje.";
                return null;
            }
            var used = new HashSet<FiberEnd>();
            foreach (var connection in request.Connections)
            {
                if (connection is null || connection.Left is null || connection.Right is null
                    || connection.Id == Guid.Empty || connection.Kind is not ("fusion" or "connector"))
                    return SpliceResult.Fail(400, "Spoj musí mít platný typ a obě vlákna.");
                var error = ValidateEnd(connection.Left) ?? ValidateEnd(connection.Right);
                if (error is not null) return SpliceResult.Fail(400, error);
                if (connection.Left == connection.Right || !used.Add(connection.Left) || !used.Add(connection.Right))
                    return SpliceResult.Fail(409, "Jeden konec vlákna už je v této spojce obsazený.");
                if (byId[connection.Left.ItemId].RunId == byId[connection.Right.ItemId].RunId)
                    return SpliceResult.Fail(409, "Dva konce stejného průběžného kabelu se zde znovu nespojují.");
            }
            if (request.Connections.Select(item => item.Id).Distinct().Count() != request.Connections.Count)
                return SpliceResult.Fail(400, "Spoje musí mít jedinečná ID.");
            if (splitters.Any(item => item.Id == Guid.Empty)
                || splitters.Select(item => item.Id).Distinct().Count() != splitters.Count)
                return SpliceResult.Fail(400, "Splittery musí mít jedinečná ID.");
            static bool ValidLoss(double? value) => value is null || double.IsFinite(value.Value)
                && value.Value >= 0 && value.Value <= 100;
            foreach (var splitter in splitters)
            {
                if (string.IsNullOrWhiteSpace(splitter.Name) || splitter.Name.Trim().Length > 80
                    || splitter.OutputCount is not (2 or 4 or 8 or 16 or 32 or 64)
                    || splitter.Outputs is null || splitter.Outputs.Count > splitter.OutputCount
                    || splitter.Outputs.Any(output => output is null)
                    || (splitter.LossSource?.Length ?? 0) > 200)
                    return SpliceResult.Fail(400, "Neplatný název, poměr nebo počet výstupů splitteru.");
                if (splitter.Input is not null)
                {
                    var error = ValidateEnd(splitter.Input);
                    if (error is not null) return SpliceResult.Fail(400, error);
                    if (!used.Add(splitter.Input))
                        return SpliceResult.Fail(409, "Konec vlákna je již obsazen ve spojce nebo splitteru.");
                }
                var positions = new HashSet<int>();
                foreach (var output in splitter.Outputs)
                {
                    if (output.Fiber is null || output.Position < 1 || output.Position > splitter.OutputCount
                        || !positions.Add(output.Position)
                        || !ValidLoss(output.Loss1270Db) || !ValidLoss(output.Loss1310Db)
                        || !ValidLoss(output.Loss1490Db) || !ValidLoss(output.Loss1550Db)
                        || !ValidLoss(output.Loss1577Db))
                        return SpliceResult.Fail(400, "Neplatný výstup nebo ztráta splitteru.");
                    var error = ValidateEnd(output.Fiber);
                    if (error is not null) return SpliceResult.Fail(400, error);
                    if (!used.Add(output.Fiber))
                        return SpliceResult.Fail(409, "Konec vlákna je již obsazen ve spojce nebo splitteru.");
                }
            }
            if (request.Reserves.Select(item => item.ItemId).Distinct().Count() != request.Reserves.Count
                || request.Reserves.Any(item => !byId.ContainsKey(item.ItemId)
                    || !double.IsFinite(item.LengthMeters) || item.LengthMeters < 0 || item.LengthMeters > 1000)
                || request.Reserves.Select(item => byId.TryGetValue(item.ItemId, out var cable) ? cable.RunId : Guid.Empty)
                    .Distinct().Count() != request.Reserves.Count)
                return SpliceResult.Fail(400, "Rezerva musí odkazovat na přivedený kabel a mít délku 0 až 1000 m.");

            var normalizedSplitters = splitters.Select(splitter => splitter with
                { Name = splitter.Name.Trim(), LossSource = splitter.LossSource?.Trim() ?? "" }).ToList();
            var updated = new OpticalSpliceDocument(pointId, request.Version + 1, request.Name.Trim(),
                request.Connections, request.Reserves, normalizedSplitters);
            documents.RemoveAll(item => item.PointId == pointId);
            documents.Add(updated);
            await WriteAsync(documents);
            return SpliceResult.Ok(updated);
        }
        finally { gate.Release(); }
    }

    public async Task<bool> DeleteAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            if (documents.RemoveAll(item => item.PointId == pointId) == 0) return false;
            await WriteAsync(documents);
            return true;
        }
        finally { gate.Release(); }
    }

    private async Task<List<OpticalSpliceDocument>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        var documents = await JsonSerializer.DeserializeAsync<List<OpticalSpliceDocument>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Optical splice data must be a JSON array.");
        return documents.Select(item => item with { Splitters = item.Splitters ?? [] }).ToList();
    }

    private async Task WriteAsync(List<OpticalSpliceDocument> documents)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = Path.Combine(Path.GetDirectoryName(path)!, $"optical-splices-{Guid.NewGuid():N}.tmp");
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
