using System.Text.Json;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.FiberAllocations;

public sealed record AllocatedFiber(Guid RunId, int TubeIndex, int FiberIndex);
public sealed record FiberAllocation(Guid Id, string Label, string Status, Guid? PremiseId,
    List<AllocatedFiber> Fibers);
public sealed record FiberAllocationDocument(int Version, List<FiberAllocation> Allocations);
public sealed record AllocationResult(int Status, FiberAllocationDocument? Document, string? Error);

public sealed class FiberAllocationStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<FiberAllocationDocument> GetAsync()
    {
        await gate.WaitAsync();
        try { return await ReadAsync(); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesRunAsync(IEnumerable<Guid> runIds)
    {
        var ids = runIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Allocations.Any(item => item.Fibers.Any(fiber => ids.Contains(fiber.RunId))); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesPremiseAsync(IEnumerable<Guid> premiseIds)
    {
        var ids = premiseIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Allocations.Any(item => item.PremiseId is Guid id && ids.Contains(id)); }
        finally { gate.Release(); }
    }

    public async Task<AllocationResult> SaveAsync(FiberAllocationDocument request,
        IReadOnlyList<RouteInstallationDocument> installations,
        IReadOnlyList<BuildingDistributionDocument> distributions)
    {
        await gate.WaitAsync();
        try
        {
            var current = await ReadAsync();
            if (current.Version != request.Version)
                return new(409, null, "Využití vláken mezitím změnil jiný uživatel. Načtěte údaje znovu.");
            if (request.Allocations is null || request.Allocations.Count > 1000
                || request.Allocations.Any(item => item is null)
                || request.Allocations.Select(item => item.Id).Distinct().Count() != request.Allocations.Count)
                return new(400, null, "Neplatný seznam rezervací vláken.");
            var cables = installations.SelectMany(document => document.Items)
                .Where(item => item.Cable is not null).GroupBy(item => item.RunId)
                .ToDictionary(group => group.Key, group => group.ToArray());
            var premises = distributions.SelectMany(document => document.Premises)
                .Where(premise => premise.Status == "connected").Select(premise => premise.Id).ToHashSet();
            var occupied = new HashSet<AllocatedFiber>();
            foreach (var allocation in request.Allocations)
            {
                if (allocation.Id == Guid.Empty || string.IsNullOrWhiteSpace(allocation.Label)
                    || allocation.Label.Trim().Length > 120 || allocation.Status is not ("reserved" or "used")
                    || allocation.Fibers is null || allocation.Fibers.Count is < 1 or > 500
                    || allocation.Fibers.Any(fiber => fiber is null)
                    || allocation.PremiseId is Guid premiseId && !premises.Contains(premiseId))
                    return new(400, null, "Zadejte název, stav a platnou cestu rezervace. Přípojné místo musí být připojené.");
                foreach (var fiber in allocation.Fibers)
                {
                    if (!cables.TryGetValue(fiber.RunId, out var segments)
                        || segments.Any(item => fiber.TubeIndex < 0 || fiber.TubeIndex >= item.Cable!.Tubes.Length
                            || fiber.FiberIndex < 0 || fiber.FiberIndex >= item.Cable.Tubes[fiber.TubeIndex].Fibers.Length))
                        return new(400, null, "Rezervace odkazuje na neexistující kabelové vlákno.");
                    if (!occupied.Add(fiber))
                        return new(409, null, $"Vlákno {fiber.TubeIndex + 1}/{fiber.FiberIndex + 1} kabelového běhu {fiber.RunId} je už rezervované nebo obsazené jinou službou.");
                }
            }
            var updated = new FiberAllocationDocument(request.Version + 1,
                request.Allocations.Select(item => item with { Label = item.Label.Trim() }).ToList());
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = Path.Combine(Path.GetDirectoryName(path)!, $"fiber-allocations-{Guid.NewGuid():N}.tmp");
            try
            {
                await File.WriteAllTextAsync(temp, JsonSerializer.Serialize(updated, JsonOptions));
                File.Move(temp, path, true);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
            return new(200, updated, null);
        }
        finally { gate.Release(); }
    }

    private async Task<FiberAllocationDocument> ReadAsync()
    {
        if (!File.Exists(path)) return new(0, []);
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<FiberAllocationDocument>(stream, JsonOptions)
            ?? throw new InvalidDataException("Fiber allocation data must be a JSON document.");
    }
}
