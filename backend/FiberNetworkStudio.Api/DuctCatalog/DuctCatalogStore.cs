using System.Text.Json;

namespace FiberNetworkStudio.Api.DuctCatalog;

public sealed class DuctCatalogStore(string path)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public async Task<IReadOnlyList<DuctType>> ListAsync()
    {
        await gate.WaitAsync();
        try { return [.. DuctPresets.All, .. await ReadAsync()]; }
        finally { gate.Release(); }
    }

    public async Task<DuctType> AddAsync(DuctTypeInput input)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var item = DuctRules.Create(Guid.NewGuid(), input, 1);
            items.Add(item);
            await WriteAsync(items);
            return item;
        }
        finally { gate.Release(); }
    }

    public async Task<(DuctType? Item, bool Conflict)> UpdateAsync(Guid id, DuctTypeInput input)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var index = items.FindIndex(item => item.Id == id);
            if (index < 0) return (null, false);
            if (items[index].Version != input.Version) return (null, true);
            var updated = DuctRules.Create(id, input, input.Version + 1);
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
            var item = items.Find(value => value.Id == id);
            if (item is null) return 404;
            if (item.Version != version) return 409;
            items.Remove(item);
            await WriteAsync(items);
            return 204;
        }
        finally { gate.Release(); }
    }

    private async Task<List<DuctType>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<DuctType>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Duct catalog must be a JSON array.");
    }

    private async Task WriteAsync(List<DuctType> items)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Directory.CreateDirectory(directory);
        var temporary = Path.Combine(directory, $"duct-catalog-{Guid.NewGuid():N}.tmp");
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
