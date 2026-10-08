using System.Text.Json;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.BuildingEquipment;

public sealed record EquipmentRack(Guid Id, string Name);
public sealed record EquipmentShelf(Guid Id, Guid RackId, string Kind, string Name);
public sealed record EquipmentCard(Guid Id, Guid ShelfId, string Name);
public sealed record EquipmentPort(Guid Id, Guid ParentId, int Position, string Label,
    FiberEnd? Fiber, Guid? PatchPortId);
public sealed record BuildingEquipmentDocument(Guid PointId, int Version, List<EquipmentRack> Racks,
    List<EquipmentShelf> Shelves, List<EquipmentCard> Cards, List<EquipmentPort> Ports);
public sealed record SaveBuildingEquipmentRequest(int Version, List<EquipmentRack>? Racks,
    List<EquipmentShelf>? Shelves, List<EquipmentCard>? Cards, List<EquipmentPort>? Ports);
public sealed record EquipmentResult(int Status, BuildingEquipmentDocument? Document, string? Error);

public sealed class BuildingEquipmentStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<List<BuildingEquipmentDocument>> ListAsync()
    {
        await gate.WaitAsync();
        try { return await ReadAsync(); }
        finally { gate.Release(); }
    }

    public async Task<BuildingEquipmentDocument> GetAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Find(item => item.PointId == pointId)
            ?? new BuildingEquipmentDocument(pointId, 0, [], [], [], []); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesAnyAsync(IEnumerable<Guid> itemIds)
    {
        var ids = itemIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => document.Ports.Any(port =>
            port.Fiber is not null && ids.Contains(port.Fiber.ItemId))); }
        finally { gate.Release(); }
    }

    public async Task<bool> TerminatesItemAtAnyAsync(Guid itemId, IEnumerable<Guid> pointIds)
    {
        var ids = pointIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => ids.Contains(document.PointId)
            && document.Ports.Any(port => port.Fiber?.ItemId == itemId)); }
        finally { gate.Release(); }
    }

    public async Task<bool> HasEquipmentAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(document => document.PointId == pointId && document.Racks.Count > 0); }
        finally { gate.Release(); }
    }

    public async Task<EquipmentResult> SaveAsync(Guid pointId, SaveBuildingEquipmentRequest request,
        IReadOnlyList<UndergroundRoute> routes, IReadOnlyList<RouteInstallationDocument> installations,
        BuildingDistributionDocument distribution)
    {
        await gate.WaitAsync();
        try
        {
            var documents = await ReadAsync();
            if ((documents.Find(item => item.PointId == pointId)?.Version ?? 0) != request.Version)
                return new(409, null, "Vybavení mezitím změnil někdo jiný. Načtěte ho znovu.");
            var racks = request.Racks; var shelves = request.Shelves;
            var cards = request.Cards; var ports = request.Ports;
            if (racks is null || shelves is null || cards is null || ports is null
                || racks.Count > 50 || shelves.Count > 200 || cards.Count > 500 || ports.Count > 10000
                || racks.Any(item => item is null) || shelves.Any(item => item is null)
                || cards.Any(item => item is null) || ports.Any(item => item is null))
                return new(400, null, "Neplatný počet prvků vybavení.");
            var allIds = racks.Select(item => item.Id).Concat(shelves.Select(item => item.Id))
                .Concat(cards.Select(item => item.Id)).Concat(ports.Select(item => item.Id)).ToArray();
            if (allIds.Any(id => id == Guid.Empty) || allIds.Distinct().Count() != allIds.Length)
                return new(400, null, "Každý prvek musí mít jedinečné ID.");
            static bool NameOk(string? name) => !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 80;
            if (racks.Any(item => !NameOk(item.Name)) || shelves.Any(item => !NameOk(item.Name))
                || cards.Any(item => !NameOk(item.Name)) || ports.Any(item => !NameOk(item.Label)))
                return new(400, null, "Názvy prvků musí mít 1 až 80 znaků.");
            var rackIds = racks.Select(item => item.Id).ToHashSet();
            var shelfById = shelves.ToDictionary(item => item.Id);
            var cardById = cards.ToDictionary(item => item.Id);
            if (shelves.Any(item => !rackIds.Contains(item.RackId) || item.Kind is not ("odf" or "olt"))
                || cards.Any(item => !shelfById.TryGetValue(item.ShelfId, out var shelf) || shelf.Kind != "olt")
                || ports.Any(item => item.Position < 1 || item.Position > 10000
                    || !(shelfById.TryGetValue(item.ParentId, out var shelf) && shelf.Kind == "odf")
                    && !cardById.ContainsKey(item.ParentId))
                || ports.GroupBy(item => (item.ParentId, item.Position)).Any(group => group.Count() > 1))
                return new(400, null, "Neplatné umístění police, karty nebo portu.");
            var routeIds = routes.Where(route => route.StartPointId == pointId || route.EndPointId == pointId)
                .Select(route => route.Id).ToHashSet();
            var cables = installations.Where(document => routeIds.Contains(document.RouteId))
                .SelectMany(document => document.Items).Where(item => item.Cable is not null).ToArray();
            var cableById = cables.ToDictionary(item => item.Id);
            var throughRuns = cables.GroupBy(item => item.RunId).Where(group => group.Count() > 1)
                .Select(group => group.Key).ToHashSet();
            var usedFibers = distribution.Premises.Where(item => item.Fiber is not null)
                .Select(item => item.Fiber!).ToHashSet();
            foreach (var port in ports)
            {
                var isOdf = shelfById.TryGetValue(port.ParentId, out var shelf) && shelf.Kind == "odf";
                if (port.Fiber is null) continue;
                var fiber = port.Fiber;
                if (!isOdf || !cableById.TryGetValue(fiber.ItemId, out var cable)
                    || throughRuns.Contains(cable.RunId) || fiber.TubeIndex < 0
                    || fiber.TubeIndex >= cable.Cable!.Tubes.Length || fiber.FiberIndex < 0
                    || fiber.FiberIndex >= cable.Cable.Tubes[fiber.TubeIndex].Fibers.Length
                    || !usedFibers.Add(fiber))
                    return new(400, null, "ODF port musí končit jedinečným vláknem kabelu přivedeného do tohoto objektu.");
            }
            var portById = ports.ToDictionary(item => item.Id);
            foreach (var port in ports.Where(item => item.PatchPortId is not null))
            {
                if (!portById.TryGetValue(port.PatchPortId!.Value, out var other)
                    || other.Id == port.Id || other.PatchPortId != port.Id
                    || (shelfById.TryGetValue(port.ParentId, out var shelf) && shelf.Kind == "odf")
                        == (shelfById.TryGetValue(other.ParentId, out var otherShelf) && otherShelf.Kind == "odf"))
                    return new(400, null, "Propojka musí spojit právě jeden ODF a jeden OLT port obousměrně.");
            }
            var updated = new BuildingEquipmentDocument(pointId, racks.Count == 0 ? 0 : request.Version + 1,
                racks, shelves, cards, ports);
            documents.RemoveAll(item => item.PointId == pointId);
            if (racks.Count > 0) documents.Add(updated);
            await WriteAsync(documents);
            return new(200, updated, null);
        }
        finally { gate.Release(); }
    }

    private async Task<List<BuildingEquipmentDocument>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<BuildingEquipmentDocument>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Building equipment data must be a JSON array.");
    }

    private async Task WriteAsync(List<BuildingEquipmentDocument> documents)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = Path.Combine(Path.GetDirectoryName(path)!, $"building-equipment-{Guid.NewGuid():N}.tmp");
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
