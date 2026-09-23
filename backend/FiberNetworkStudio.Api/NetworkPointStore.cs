using System.Text.Json;

namespace FiberNetworkStudio.Api;

public sealed record NetworkPoint(Guid Id, string Kind, string Name, double Latitude, double Longitude);

public sealed class NetworkPointStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<IReadOnlyList<NetworkPoint>> ListAsync()
    {
        await gate.WaitAsync();
        try
        {
            return (await ReadAsync()).ToArray();
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<NetworkPoint> AddAsync(NetworkPoint point)
    {
        await gate.WaitAsync();
        try
        {
            var points = await ReadAsync();
            points.Add(point);
            await WriteAsync(points);
            return point;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<NetworkPoint?> UpdateAsync(Guid id, string name, double latitude, double longitude)
    {
        await gate.WaitAsync();
        try
        {
            var points = await ReadAsync();
            var index = points.FindIndex(point => point.Id == id);
            if (index < 0) return null;

            var updated = points[index] with { Name = name, Latitude = latitude, Longitude = longitude };
            points[index] = updated;
            await WriteAsync(points);
            return updated;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        await gate.WaitAsync();
        try
        {
            var points = await ReadAsync();
            if (points.RemoveAll(point => point.Id == id) == 0) return false;
            await WriteAsync(points);
            return true;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<List<NetworkPoint>> ReadAsync()
    {
        if (!File.Exists(path)) return [];

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<NetworkPoint>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Network point data must be a JSON array.");
    }

    private async Task WriteAsync(List<NetworkPoint> points)
    {
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);
        var tempPath = Path.Combine(directory, $"network-points-{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, points, JsonOptions);
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
