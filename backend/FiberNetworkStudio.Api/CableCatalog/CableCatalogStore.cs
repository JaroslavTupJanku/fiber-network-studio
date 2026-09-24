using System.Text.Json;

namespace FiberNetworkStudio.Api.CableCatalog;

public sealed class CableCatalogStore(string path)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public async Task<IReadOnlyList<CableSpecification>> ListAsync()
    {
        await gate.WaitAsync();
        try { return [.. CablePresets.All, .. await ReadAsync()]; }
        finally { gate.Release(); }
    }

    public async Task<CableSpecification> AddAsync(CableInput input)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var item = CableRules.Create(Guid.NewGuid(), input, 1);
            items.Add(item);
            await WriteAsync(items);
            return item;
        }
        finally { gate.Release(); }
    }

    // A stale editor must not silently overwrite another user's update.
    public async Task<(CableSpecification? Item, bool Conflict)> UpdateAsync(Guid id, CableInput input)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var index = items.FindIndex(item => item.Id == id);
            if (index < 0) return (null, false);
            if (items[index].Version != input.Version) return (null, true);
            var updated = CableRules.Create(id, input, items[index].Version + 1);
            items[index] = updated;
            await WriteAsync(items);
            return (updated, false);
        }
        finally { gate.Release(); }
    }

    public async Task<int> DeleteAsync(Guid id, int version)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var item = items.Find(item => item.Id == id);
            if (item is null) return 404;
            if (item.Version != version) return 409;
            items.Remove(item);
            await WriteAsync(items);
            return 204;
        }
        finally { gate.Release(); }
    }

    private async Task<List<CableSpecification>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<CableSpecification>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Cable catalog must be a JSON array.");
    }

    private async Task WriteAsync(List<CableSpecification> items)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Directory.CreateDirectory(directory);
        var temporary = Path.Combine(directory, $"cable-catalog-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = File.Create(temporary))
            {
                await JsonSerializer.SerializeAsync(stream, items, JsonOptions);
                await stream.FlushAsync();
            }
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
