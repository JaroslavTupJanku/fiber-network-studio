using System.Text.Json;
using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.BuildingDistribution;

public sealed record BuildingRiser(Guid Id, string Name, Guid? CableItemId);
public sealed record FloorBox(Guid Id, Guid RiserId, string Name, int Floor);
public sealed record IndoorLosses(double? Loss1270, double? Loss1310, double? Loss1490,
    double? Loss1550, double? Loss1577);
public sealed record IndoorCableRun(string CableName, Guid? CatalogCableId, double? LengthMeters,
    IndoorLosses? AttenuationDbPerKm, int? SpliceCount, IndoorLosses? SpliceLossDb,
    int? ConnectorPairCount, IndoorLosses? ConnectorLossDb, string? Source);
public sealed record HomePremise(Guid Id, Guid BoxId, string Label, string Status, FiberEnd? Fiber,
    IndoorCableRun? IndoorCable = null);
public sealed record BuildingDistributionDocument(Guid PointId, int Version, List<BuildingRiser> Risers,
    List<FloorBox> Boxes, List<HomePremise> Premises);
public sealed record SaveBuildingDistributionRequest(int Version, List<BuildingRiser>? Risers,
    List<FloorBox>? Boxes, List<HomePremise>? Premises);
public sealed record DistributionResult(int Status, BuildingDistributionDocument? Document, string? Error);

public sealed class BuildingDistributionStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static bool ValidLosses(IndoorLosses? losses) => losses is not null
        && new[] { losses.Loss1270, losses.Loss1310, losses.Loss1490, losses.Loss1550, losses.Loss1577 }
            .All(value => value is null || double.IsFinite(value.Value) && value is >= 0 and <= 100);
    private static bool HasLosses(IndoorLosses losses) => new[] {
        losses.Loss1270, losses.Loss1310, losses.Loss1490, losses.Loss1550, losses.Loss1577,
    }.Any(value => value is not null);
    private static bool ValidIndoorCable(IndoorCableRun? indoor)
    {
        if (indoor is null) return true;
        if (string.IsNullOrWhiteSpace(indoor.CableName) || indoor.CableName.Trim().Length > 120
            || indoor.CatalogCableId == Guid.Empty || indoor.Source is null or { Length: > 2000 }
            || indoor.LengthMeters is not null && (!double.IsFinite(indoor.LengthMeters.Value)
                || indoor.LengthMeters is <= 0 or > 10000)
            || indoor.SpliceCount is < 0 or > 100 || indoor.ConnectorPairCount is < 0 or > 100
            || !ValidLosses(indoor.AttenuationDbPerKm) || !ValidLosses(indoor.SpliceLossDb)
            || !ValidLosses(indoor.ConnectorLossDb)) return false;
        return (indoor.SpliceCount is > 0 || !HasLosses(indoor.SpliceLossDb!))
            && (indoor.ConnectorPairCount is > 0 || !HasLosses(indoor.ConnectorLossDb!));
    }
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<List<BuildingDistributionDocument>> ListAsync()
    {
        await gate.WaitAsync();
        try { return await ReadAsync(); }
        finally { gate.Release(); }
    }

    public async Task<BuildingDistributionDocument> GetAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Find(item => item.PointId == pointId)
            ?? new BuildingDistributionDocument(pointId, 0, [], [], []); }
        finally { gate.Release(); }
    }

    public async Task<bool> HasDistributionAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(item => item.PointId == pointId && item.Risers.Count > 0); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesAnyAsync(IEnumerable<Guid> itemIds)
    {
        var ids = itemIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => document.Risers.Any(riser =>
                riser.CableItemId is Guid cableId && ids.Contains(cableId))
            || document.Premises.Any(premise => premise.Fiber is not null && ids.Contains(premise.Fiber.ItemId))); }
        finally { gate.Release(); }
    }

    public async Task<bool> TerminatesItemAtAnyAsync(Guid itemId, IEnumerable<Guid> pointIds)
    {
        var ids = pointIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => ids.Contains(document.PointId)
            && document.Risers.Any(riser => riser.CableItemId == itemId)); }
        finally { gate.Release(); }
    }

    public async Task<DistributionResult> SaveAsync(Guid pointId, SaveBuildingDistributionRequest request,
        IReadOnlyList<UndergroundRoute> routes, IReadOnlyList<RouteInstallationDocument> installations,
        BuildingEquipmentDocument equipment)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            if ((documents.Find(item => item.PointId == pointId)?.Version ?? 0) != request.Version)
                return new(409, null, "Rozvody mezitím změnil někdo jiný. Načtěte je znovu.");
            var risers = request.Risers; var boxes = request.Boxes; var premises = request.Premises;
            if (risers is null || boxes is null || premises is null
                || risers.Count > 100 || boxes.Count > 1000 || premises.Count > 10000
                || risers.Any(item => item is null) || boxes.Any(item => item is null)
                || premises.Any(item => item is null))
                return new(400, null, "Neplatný počet prvků rozvodu.");
            var ids = risers.Select(item => item.Id).Concat(boxes.Select(item => item.Id))
                .Concat(premises.Select(item => item.Id)).ToArray();
            if (ids.Any(id => id == Guid.Empty) || ids.Distinct().Count() != ids.Length)
                return new(400, null, "Každý prvek musí mít jedinečné ID.");
            static bool NameOk(string? name) => !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 80;
            if (risers.Any(item => !NameOk(item.Name)) || boxes.Any(item => !NameOk(item.Name))
                || premises.Any(item => !NameOk(item.Label)))
                return new(400, null, "Označení musí mít 1 až 80 znaků.");
            if (premises.Any(item => !ValidIndoorCable(item.IndoorCable)))
                return new(400, null, "Domovní přívod potřebuje typ kabelu, platnou délku, počty spojů a nezáporné útlumy.");
            var riserIds = risers.Select(item => item.Id).ToHashSet();
            var boxById = boxes.ToDictionary(item => item.Id);
            if (premises.Any(item => item.Status == "connected" && item.Fiber is null))
                return new(400, null, "U připojeného přípojného místa vyberte konkrétní vlákno přívodního kabelu.");
            if (boxes.Any(item => !riserIds.Contains(item.RiserId) || item.Floor is < -10 or > 150)
                || premises.Any(item => !boxById.ContainsKey(item.BoxId)
                    || item.Status is not ("planned" or "connected")
                    || (item.Status == "planned" && item.Fiber is not null)
                    || (item.Status == "connected" && item.Fiber is null)))
                return new(400, null, "Neplatný box, podlaží nebo stav přípojného místa.");
            var incidentRouteIds = routes.Where(route => route.StartPointId == pointId || route.EndPointId == pointId)
                .Select(route => route.Id).ToHashSet();
            var cables = installations.Where(item => incidentRouteIds.Contains(item.RouteId))
                .SelectMany(item => item.Items).Where(item => item.Cable is not null).ToArray();
            var cableById = cables.ToDictionary(item => item.Id);
            var throughRuns = cables.GroupBy(item => item.RunId).Where(group => group.Count() > 1)
                .Select(group => group.Key).ToHashSet();
            var riserCables = new HashSet<Guid>();
            foreach (var riser in risers)
            {
                if (riser.CableItemId is not Guid cableId) continue;
                if (!cableById.TryGetValue(cableId, out var cable) || throughRuns.Contains(cable.RunId)
                    || !riserCables.Add(cableId))
                    return new(400, null, "Ke stoupačce lze přiřadit jedinečný kabel končící v budově.");
            }
            var riserById = risers.ToDictionary(item => item.Id);
            var usedFibers = equipment.Ports.Where(port => port.Fiber is not null)
                .Select(port => port.Fiber!).ToHashSet();
            foreach (var premise in premises)
            {
                if (premise.Fiber is null) continue;
                var fiber = premise.Fiber;
                var riser = riserById[boxById[premise.BoxId].RiserId];
                if (riser.CableItemId != fiber.ItemId || !cableById.TryGetValue(fiber.ItemId, out var cable)
                    || fiber.TubeIndex < 0 || fiber.TubeIndex >= cable.Cable!.Tubes.Length
                    || fiber.FiberIndex < 0 || fiber.FiberIndex >= cable.Cable.Tubes[fiber.TubeIndex].Fibers.Length
                    || !usedFibers.Add(fiber))
                    return new(400, null, "Připojené místo potřebuje volné vlákno kabelu přiřazeného ke stoupačce.");
            }
            var updated = new BuildingDistributionDocument(pointId, risers.Count == 0 ? 0 : request.Version + 1,
                risers, boxes, premises);
            documents.RemoveAll(item => item.PointId == pointId);
            if (risers.Count > 0) documents.Add(updated);
            await WriteAsync(documents);
            return new(200, updated, null);
        }
        finally { gate.Release(); }
    }

    private async Task<List<BuildingDistributionDocument>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<BuildingDistributionDocument>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Building distribution data must be a JSON array.");
    }

    private async Task WriteAsync(List<BuildingDistributionDocument> documents)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = Path.Combine(Path.GetDirectoryName(path)!, $"building-distribution-{Guid.NewGuid():N}.tmp");
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
