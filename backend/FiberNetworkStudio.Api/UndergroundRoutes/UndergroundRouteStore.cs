using System.Text.Json;

namespace FiberNetworkStudio.Api.UndergroundRoutes;

public sealed record RouteVertex(double Latitude, double Longitude);
public sealed record UndergroundRoute(Guid Id, string Name, Guid StartPointId, Guid EndPointId,
    List<RouteVertex> Waypoints);

public sealed class UndergroundRouteStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<IReadOnlyList<UndergroundRoute>> ListAsync()
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).ToArray(); }
        finally { gate.Release(); }
    }

    public async Task<bool> ContainsPointAsync(Guid pointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(route => route.StartPointId == pointId || route.EndPointId == pointId); }
        finally { gate.Release(); }
    }

    public async Task AddAsync(UndergroundRoute route)
    {
        await gate.WaitAsync();
        try
        {
            var routes = await ReadAsync();
            routes.Add(route);
            await WriteAsync(routes);
        }
        finally { gate.Release(); }
    }

    public async Task<UndergroundRoute?> UpdateAsync(Guid id, UndergroundRoute changed)
    {
        await gate.WaitAsync();
        try
        {
            var routes = await ReadAsync();
            var index = routes.FindIndex(route => route.Id == id);
            if (index < 0) return null;
            routes[index] = changed;
            await WriteAsync(routes);
            return changed;
        }
        finally { gate.Release(); }
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        await gate.WaitAsync();
        try
        {
            var routes = await ReadAsync();
            if (routes.RemoveAll(route => route.Id == id) == 0) return false;
            await WriteAsync(routes);
            return true;
        }
        finally { gate.Release(); }
    }

    private async Task<List<UndergroundRoute>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<UndergroundRoute>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Underground route data must be a JSON array.");
    }

    private async Task WriteAsync(List<UndergroundRoute> routes)
    {
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);
        var tempPath = Path.Combine(directory, $"underground-routes-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, routes, JsonOptions);
                await stream.FlushAsync();
            }
            File.Move(tempPath, path, true);
        }
        finally
        {
            if (File.Exists(tempPath)) File.Delete(tempPath);
        }
    }
}
