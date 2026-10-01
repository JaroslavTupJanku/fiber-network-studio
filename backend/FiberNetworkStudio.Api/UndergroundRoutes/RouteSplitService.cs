using System.Text.Json;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.UndergroundRoutes;

public sealed record SplitRouteRequest(UndergroundRoute? ExpectedRoute, int InstallationVersion,
    int SegmentIndex, double Fraction, string? ChamberName);
public sealed record SplitRouteOutcome(NetworkPoint Chamber, UndergroundRoute FirstRoute,
    UndergroundRoute SecondRoute, List<RouteInstallationDocument> Installations);
public sealed record SplitRouteResult(int Status, SplitRouteOutcome? Outcome, string? Error)
{
    public static SplitRouteResult Fail(int status, string error) => new(status, null, error);
}

// A journal makes the six JSON snapshots recoverable if the process stops between file replacements.
// API requests touching these files share one gate, so readers never observe a partial split.
public sealed class RouteSplitService(string pointPath, string routePath, string installationPath,
    string splicePath, string equipmentPath, string distributionPath)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string journalPath = routePath + ".split-journal.json";
    private sealed record PendingWrite(string Path, string ContentBase64);

    public async Task RecoverAsync()
    {
        if (!File.Exists(journalPath)) return;
        var pending = await ReadAsync<List<PendingWrite>>(journalPath);
        if (pending.Count != 6 || pending.Select(write => write.Path).ToHashSet().SetEquals(
            [pointPath, routePath, installationPath, splicePath, equipmentPath, distributionPath]) == false)
            throw new InvalidDataException("Route split journal contains unexpected paths.");
        foreach (var write in pending)
            await WriteAtomicAsync(write.Path, Convert.FromBase64String(write.ContentBase64));
        File.Delete(journalPath);
    }

    public async Task<SplitRouteResult> SplitAsync(Guid routeId, SplitRouteRequest request)
    {
        if (request.ExpectedRoute is null || request.ChamberName is null
            || string.IsNullOrWhiteSpace(request.ChamberName) || request.ChamberName.Trim().Length > 80
            || !double.IsFinite(request.Fraction) || request.Fraction is < 0.02 or > 0.98)
            return SplitRouteResult.Fail(400, "Vyberte místo na úseku a název nové šachty.");

        var points = await ReadAsync<List<NetworkPoint>>(pointPath);
        var routes = await ReadAsync<List<UndergroundRoute>>(routePath);
        var documents = await ReadAsync<List<RouteInstallationDocument>>(installationPath);
        var splices = await ReadAsync<List<OpticalSpliceDocument>>(splicePath);
        var equipment = await ReadAsync<List<BuildingEquipmentDocument>>(equipmentPath);
        var distribution = await ReadAsync<List<BuildingDistributionDocument>>(distributionPath);
        var original = routes.Find(route => route.Id == routeId);
        if (original is null) return SplitRouteResult.Fail(404, "Trasa neexistuje.");
        var expected = request.ExpectedRoute;
        if (expected.Id != original.Id || expected.Name != original.Name
            || expected.StartPointId != original.StartPointId || expected.EndPointId != original.EndPointId
            || expected.Waypoints is null || !expected.Waypoints.SequenceEqual(original.Waypoints))
            return SplitRouteResult.Fail(409, "Trasa se mezitím změnila. Načtěte ji znovu.");
        var installation = documents.Find(document => document.RouteId == routeId)
            ?? new RouteInstallationDocument(routeId, 0, []);
        if (installation.Version != request.InstallationVersion)
            return SplitRouteResult.Fail(409, "Osazení se mezitím změnilo. Načtěte je znovu.");
        if (request.SegmentIndex < 0 || request.SegmentIndex > original.Waypoints.Count)
            return SplitRouteResult.Fail(400, "Vybrané místo neleží na trase.");
        var start = points.Find(point => point.Id == original.StartPointId);
        var end = points.Find(point => point.Id == original.EndPointId);
        if (start is null || end is null)
            return SplitRouteResult.Fail(409, "Koncový objekt trasy chybí.");
        List<RouteVertex> vertices = [new(start.Latitude, start.Longitude),
            .. original.Waypoints, new(end.Latitude, end.Longitude)];
        var firstVertex = vertices[request.SegmentIndex];
        var secondVertex = vertices[request.SegmentIndex + 1];
        var splitVertex = new RouteVertex(
            firstVertex.Latitude + (secondVertex.Latitude - firstVertex.Latitude) * request.Fraction,
            firstVertex.Longitude + (secondVertex.Longitude - firstVertex.Longitude) * request.Fraction);
        if (DistanceMeters(firstVertex, splitVertex) < 1 || DistanceMeters(splitVertex, secondVertex) < 1)
            return SplitRouteResult.Fail(400, "Nová šachta je příliš blízko konce úseku. Vyberte místo dál od objektu nebo lomu.");

        var chamber = new NetworkPoint(Guid.NewGuid(), "chamber", request.ChamberName.Trim(),
            splitVertex.Latitude, splitVertex.Longitude);
        var secondId = Guid.NewGuid();
        var firstRoute = original with { EndPointId = chamber.Id,
            Waypoints = original.Waypoints.Take(request.SegmentIndex).ToList() };
        var secondRoute = new UndergroundRoute(secondId,
            (original.Name.Length <= 65 ? original.Name : original.Name[..65]) + " · pokračování",
            chamber.Id, original.EndPointId, original.Waypoints.Skip(request.SegmentIndex).ToList());
        var idMap = installation.Items.ToDictionary(item => item.Id, _ => Guid.NewGuid());
        var firstItems = installation.Items.Select(item => item.Cable is not null
            && item.ActualLengthMeters is double length
                ? item with { ActualLengthMeters = null, LengthBeforeSplitMeters = length } : item).ToList();
        var secondItems = installation.Items.Select(item => item with
        {
            Id = idMap[item.Id], RouteId = secondId,
            ParentId = item.ParentId is Guid parent ? idMap[parent] : null,
            ActualLengthMeters = null, LengthBeforeSplitMeters = null
        }).ToList();
        if (installation.Items.Count > 0)
        {
            documents.RemoveAll(document => document.RouteId == routeId);
            documents.Add(installation with { Version = installation.Version + 1, Items = firstItems });
            documents.Add(new RouteInstallationDocument(secondId, 1, secondItems));
        }
        points.Add(chamber);
        routes[routes.IndexOf(original)] = firstRoute;
        routes.Add(secondRoute);
        RemapAtOldEnd(original.EndPointId, idMap, splices, equipment, distribution);

        var writes = new List<PendingWrite>
        {
            Snapshot(pointPath, points), Snapshot(routePath, routes), Snapshot(installationPath, documents),
            Snapshot(splicePath, splices), Snapshot(equipmentPath, equipment), Snapshot(distributionPath, distribution)
        };
        await WriteAtomicAsync(journalPath, JsonSerializer.SerializeToUtf8Bytes(writes, JsonOptions));
        await RecoverAsync();
        return new SplitRouteResult(200, new SplitRouteOutcome(chamber, firstRoute, secondRoute,
            documents.Where(document => document.RouteId == routeId || document.RouteId == secondId).ToList()), null);
    }

    private static void RemapAtOldEnd(Guid endPointId, Dictionary<Guid, Guid> ids,
        List<OpticalSpliceDocument> splices, List<BuildingEquipmentDocument> equipment,
        List<BuildingDistributionDocument> distribution)
    {
        Guid Map(Guid id) => ids.GetValueOrDefault(id, id);
        FiberEnd MapFiber(FiberEnd fiber) => fiber with { ItemId = Map(fiber.ItemId) };
        for (var index = 0; index < splices.Count; index++)
        {
            var document = splices[index];
            if (document.PointId != endPointId) continue;
            var changed = document.Connections.Any(connection => ids.ContainsKey(connection.Left.ItemId)
                || ids.ContainsKey(connection.Right.ItemId))
                || document.Reserves.Any(reserve => ids.ContainsKey(reserve.ItemId))
                || document.Splitters.Any(splitter => splitter.Input is not null && ids.ContainsKey(splitter.Input.ItemId)
                    || splitter.Outputs.Any(output => ids.ContainsKey(output.Fiber.ItemId)));
            if (!changed) continue;
            splices[index] = document with
            {
                Version = document.Version + 1,
                Connections = document.Connections.Select(connection => connection with
                    { Left = MapFiber(connection.Left), Right = MapFiber(connection.Right) }).ToList(),
                Reserves = document.Reserves.Select(reserve => reserve with { ItemId = Map(reserve.ItemId) }).ToList(),
                Splitters = document.Splitters.Select(splitter => splitter with
                {
                    Input = splitter.Input is null ? null : MapFiber(splitter.Input),
                    Outputs = splitter.Outputs.Select(output => output with { Fiber = MapFiber(output.Fiber) }).ToList()
                }).ToList()
            };
        }
        for (var index = 0; index < equipment.Count; index++)
        {
            var document = equipment[index];
            if (document.PointId != endPointId || !document.Ports.Any(port => port.Fiber is not null
                && ids.ContainsKey(port.Fiber.ItemId))) continue;
            equipment[index] = document with { Version = document.Version + 1,
                Ports = document.Ports.Select(port => port with
                    { Fiber = port.Fiber is null ? null : MapFiber(port.Fiber) }).ToList() };
        }
        for (var index = 0; index < distribution.Count; index++)
        {
            var document = distribution[index];
            if (document.PointId != endPointId || !document.Risers.Any(riser => riser.CableItemId is Guid id
                    && ids.ContainsKey(id)) && !document.Premises.Any(premise => premise.Fiber is not null
                    && ids.ContainsKey(premise.Fiber.ItemId))) continue;
            distribution[index] = document with
            {
                Version = document.Version + 1,
                Risers = document.Risers.Select(riser => riser with
                    { CableItemId = riser.CableItemId is Guid id ? Map(id) : null }).ToList(),
                Premises = document.Premises.Select(premise => premise with
                    { Fiber = premise.Fiber is null ? null : MapFiber(premise.Fiber) }).ToList()
            };
        }
    }

    private static double DistanceMeters(RouteVertex a, RouteVertex b)
    {
        var latitude = (b.Latitude - a.Latitude) * Math.PI / 180;
        var longitude = (b.Longitude - a.Longitude) * Math.PI / 180;
        var sine = Math.Sin(latitude / 2) * Math.Sin(latitude / 2)
            + Math.Cos(a.Latitude * Math.PI / 180) * Math.Cos(b.Latitude * Math.PI / 180)
            * Math.Sin(longitude / 2) * Math.Sin(longitude / 2);
        return 12742017.6 * Math.Asin(Math.Min(1, Math.Sqrt(sine)));
    }

    private static PendingWrite Snapshot<T>(string path, T data) =>
        new(path, Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(data, JsonOptions)));

    private static async Task<T> ReadAsync<T>(string path) where T : new()
    {
        if (!File.Exists(path)) return new T();
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions)
            ?? throw new InvalidDataException($"Invalid network data: {path}");
    }

    private static async Task WriteAtomicAsync(string path, byte[] content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllBytesAsync(temporary, content);
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
