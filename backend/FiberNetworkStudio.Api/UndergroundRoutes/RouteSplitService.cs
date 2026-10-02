using System.Text.Json;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.UndergroundRoutes;

public sealed record SplitRouteRequest(UndergroundRoute? ExpectedRoute, int InstallationVersion,
    int SegmentIndex, double Fraction, string? ChamberName, int? PoleCount = null, double? MaxSpanMeters = null);
public sealed record SplitRouteOutcome(NetworkPoint Chamber, UndergroundRoute FirstRoute,
    UndergroundRoute SecondRoute, List<RouteInstallationDocument> Installations,
    List<NetworkPoint> AddedPoints, List<UndergroundRoute> Routes);
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
        var uniform = request.PoleCount is not null || request.MaxSpanMeters is not null;
        if (request.ExpectedRoute is null || request.ChamberName is null
            || string.IsNullOrWhiteSpace(request.ChamberName) || request.ChamberName.Trim().Length > 80
            || !uniform && (!double.IsFinite(request.Fraction) || request.Fraction is < 0.02 or > 0.98)
            || request.PoleCount is < 1 or > 100
            || request.PoleCount is not null && request.MaxSpanMeters is not null
            || request.MaxSpanMeters is double span && (!double.IsFinite(span) || span < 2))
            return SplitRouteResult.Fail(400, "Vyberte platné dělení trasy a název nového objektu.");

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
            || expected.Kind != original.Kind
            || expected.Waypoints is null || !expected.Waypoints.SequenceEqual(original.Waypoints))
            return SplitRouteResult.Fail(409, "Trasa se mezitím změnila. Načtěte ji znovu.");
        var installation = documents.Find(document => document.RouteId == routeId)
            ?? new RouteInstallationDocument(routeId, 0, []);
        if (installation.Version != request.InstallationVersion)
            return SplitRouteResult.Fail(409, "Osazení se mezitím změnilo. Načtěte je znovu.");
        if (uniform && original.Kind != "aerial")
            return SplitRouteResult.Fail(400, "Rovnoměrné dělení je určeno pro nadzemní trasu.");
        if (!uniform && (request.SegmentIndex < 0 || request.SegmentIndex > original.Waypoints.Count))
            return SplitRouteResult.Fail(400, "Vybrané místo neleží na trase.");
        var start = points.Find(point => point.Id == original.StartPointId);
        var end = points.Find(point => point.Id == original.EndPointId);
        if (start is null || end is null)
            return SplitRouteResult.Fail(409, "Koncový objekt trasy chybí.");
        List<RouteVertex> vertices = [new(start.Latitude, start.Longitude),
            .. original.Waypoints, new(end.Latitude, end.Longitude)];
        var lengths = vertices.Zip(vertices.Skip(1), DistanceMeters).ToArray();
        var totalLength = lengths.Sum();
        List<double> cuts;
        if (uniform)
        {
            var poleCount = request.PoleCount ?? (int)Math.Min(101, Math.Ceiling(totalLength / request.MaxSpanMeters!.Value) - 1);
            if (poleCount is < 1 or > 100 || totalLength / (poleCount + 1) < 2)
                return SplitRouteResult.Fail(400, "Zvolte 1 až 100 sloupů s rozestupem alespoň 2 m. Pro kratší trasu není dělení potřeba.");
            cuts = Enumerable.Range(1, poleCount).Select(index => totalLength * index / (poleCount + 1)).ToList();
        }
        else
        {
            var localLength = lengths[request.SegmentIndex];
            if (localLength * request.Fraction < 1 || localLength * (1 - request.Fraction) < 1)
                return SplitRouteResult.Fail(400, "Nový objekt je příliš blízko konce úseku nebo lomu.");
            cuts = [lengths.Take(request.SegmentIndex).Sum() + localLength * request.Fraction];
        }
        var cumulative = new List<double> { 0 };
        foreach (var length in lengths) cumulative.Add(cumulative[^1] + length);
        RouteVertex At(double distance)
        {
            var index = 0;
            while (index < lengths.Length - 1 && cumulative[index + 1] < distance) index++;
            var fraction = lengths[index] > 0 ? (distance - cumulative[index]) / lengths[index] : 0;
            return new RouteVertex(vertices[index].Latitude + (vertices[index + 1].Latitude - vertices[index].Latitude) * fraction,
                vertices[index].Longitude + (vertices[index + 1].Longitude - vertices[index].Longitude) * fraction);
        }
        var addedPoints = cuts.Select((distance, index) =>
        {
            var vertex = At(distance);
            var name = request.ChamberName.Trim();
            if (uniform) name = (name.Length > 74 ? name[..74] : name) + $" {index + 1}";
            return new NetworkPoint(Guid.NewGuid(), original.Kind == "aerial" ? "pole" : "chamber", name,
                vertex.Latitude, vertex.Longitude);
        }).ToList();
        List<Guid> endpointIds = [original.StartPointId, .. addedPoints.Select(point => point.Id), original.EndPointId];
        List<double> boundaries = [0, .. cuts, totalLength];
        var splitRoutes = new List<UndergroundRoute>();
        var installed = new List<RouteInstallationDocument>();
        Dictionary<Guid, Guid> farEndIds = [];
        for (var index = 0; index < boundaries.Count - 1; index++)
        {
            var id = index == 0 ? original.Id : Guid.NewGuid();
            var name = index == 0 ? original.Name : (original.Name.Length > 65 ? original.Name[..65] : original.Name) + $" · úsek {index + 1}";
            var waypoints = original.Waypoints.Where((_, waypointIndex) =>
                cumulative[waypointIndex + 1] > boundaries[index] + 0.001
                && cumulative[waypointIndex + 1] < boundaries[index + 1] - 0.001).ToList();
            splitRoutes.Add(original with { Id = id, Name = name, StartPointId = endpointIds[index],
                EndPointId = endpointIds[index + 1], Waypoints = waypoints });
            var ids = installation.Items.ToDictionary(item => item.Id, item => index == 0 ? item.Id : Guid.NewGuid());
            var items = installation.Items.Select(item => item with
            {
                Id = ids[item.Id], RouteId = id,
                ParentId = item.ParentId is Guid parent ? ids[parent] : null,
                ActualLengthMeters = item.Cable is not null ? null : item.ActualLengthMeters,
                LengthBeforeSplitMeters = index == 0 ? item.ActualLengthMeters ?? item.LengthBeforeSplitMeters : null
            }).ToList();
            if (items.Count > 0 || index == 0 && documents.Any(document => document.RouteId == routeId))
                installed.Add(new RouteInstallationDocument(id,
                index == 0 ? installation.Version + 1 : 1, items));
            farEndIds = ids;
        }
        documents.RemoveAll(document => document.RouteId == routeId);
        documents.AddRange(installed);
        points.AddRange(addedPoints);
        routes.Remove(original);
        routes.AddRange(splitRoutes);
        RemapAtOldEnd(original.EndPointId, farEndIds, splices, equipment, distribution);

        var writes = new List<PendingWrite>
        {
            Snapshot(pointPath, points), Snapshot(routePath, routes), Snapshot(installationPath, documents),
            Snapshot(splicePath, splices), Snapshot(equipmentPath, equipment), Snapshot(distributionPath, distribution)
        };
        await WriteAtomicAsync(journalPath, JsonSerializer.SerializeToUtf8Bytes(writes, JsonOptions));
        await RecoverAsync();
        return new SplitRouteResult(200, new SplitRouteOutcome(addedPoints[0], splitRoutes[0], splitRoutes[1],
            installed, addedPoints, splitRoutes), null);
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
