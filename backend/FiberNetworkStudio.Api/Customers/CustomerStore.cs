using System.Text.Json;

namespace FiberNetworkStudio.Api.Customers;

public sealed record CustomerContact(Guid Id, string Name, string Role, string Email, string Phone);
public sealed record CustomerMessage(Guid Id, string Subject, string Sender, string Date,
    string Category, string Status, string Summary);
public sealed record CustomerRecord(Guid Id, int Version, Guid BuildingPointId, Guid? PremiseId,
    string Name, string Status, string Note, List<CustomerContact> Contacts, List<CustomerMessage> Messages);
public sealed record CustomerWrite(int Version, Guid BuildingPointId, Guid? PremiseId,
    string? Name, string? Status, string? Note, List<CustomerContact>? Contacts,
    List<CustomerMessage>? Messages);
public sealed record CustomerResult(int Status, CustomerRecord? Customer, string? Error);

public sealed class CustomerStore(string path)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<List<CustomerRecord>> ListAsync()
    {
        await gate.WaitAsync();
        try { return await ReadAsync(); }
        finally { gate.Release(); }
    }

    public async Task<bool> HasBuildingAsync(Guid buildingPointId)
    {
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(item => item.BuildingPointId == buildingPointId); }
        finally { gate.Release(); }
    }

    public async Task<bool> ReferencesRemovedPremiseAsync(Guid buildingPointId, IEnumerable<Guid> retainedPremiseIds)
    {
        var retained = retainedPremiseIds.ToHashSet();
        await gate.WaitAsync();
        try { return (await ReadAsync()).Any(item => item.BuildingPointId == buildingPointId
            && item.PremiseId is Guid premiseId && !retained.Contains(premiseId)); }
        finally { gate.Release(); }
    }

    public async Task<CustomerResult> CreateAsync(CustomerWrite request)
    {
        var error = Validate(request);
        if (error is not null) return new(400, null, error);
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var customer = new CustomerRecord(Guid.NewGuid(), 1, request.BuildingPointId,
                request.PremiseId, request.Name!.Trim(), request.Status!, request.Note!.Trim(),
                request.Contacts!, request.Messages!);
            items.Add(customer);
            await WriteAsync(items);
            return new(201, customer, null);
        }
        finally { gate.Release(); }
    }

    public async Task<CustomerResult> UpdateAsync(Guid id, CustomerWrite request)
    {
        var error = Validate(request);
        if (error is not null) return new(400, null, error);
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var index = items.FindIndex(item => item.Id == id);
            if (index < 0) return new(404, null, "Zákazník neexistuje.");
            if (items[index].Version != request.Version) return new(409, null, "Záznam se mezitím změnil. Načtěte jej znovu.");
            var customer = new CustomerRecord(id, request.Version + 1, request.BuildingPointId,
                request.PremiseId, request.Name!.Trim(), request.Status!, request.Note!.Trim(),
                request.Contacts!, request.Messages!);
            items[index] = customer;
            await WriteAsync(items);
            return new(200, customer, null);
        }
        finally { gate.Release(); }
    }

    public async Task<CustomerResult> DeleteAsync(Guid id, int version)
    {
        await gate.WaitAsync();
        try
        {
            var items = await ReadAsync();
            var index = items.FindIndex(item => item.Id == id);
            if (index < 0) return new(404, null, "Zákazník neexistuje.");
            if (items[index].Version != version) return new(409, null, "Záznam se mezitím změnil. Načtěte jej znovu.");
            items.RemoveAt(index);
            await WriteAsync(items);
            return new(204, null, null);
        }
        finally { gate.Release(); }
    }

    private static string? Validate(CustomerWrite request)
    {
        if (request.BuildingPointId == Guid.Empty || request.Version < 0
            || string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120
            || request.Status is not ("lead" or "active") || request.Note is null or { Length: > 2000 }
            || request.Contacts is null or { Count: > 30 } || request.Messages is null or { Count: > 100 })
            return "Doplňte platný název, stav a údaje zákazníka.";
        var contacts = request.Contacts;
        var messages = request.Messages;
        if (contacts.Any(item => item is null || item.Id == Guid.Empty
            || string.IsNullOrWhiteSpace(item.Name) || item.Name.Length > 120
            || item.Role is null or { Length: > 80 } || item.Email is null or { Length: > 200 }
            || item.Phone is null or { Length: > 80 })
            || contacts.Select(item => item.Id).Distinct().Count() != contacts.Count)
            return "Zkontrolujte kontaktní osoby.";
        if (messages.Any(item => item is null || item.Id == Guid.Empty
            || string.IsNullOrWhiteSpace(item.Subject) || item.Subject.Length > 180
            || item.Sender is null or { Length: > 200 }
            || !DateOnly.TryParseExact(item.Date, "yyyy-MM-dd", out _)
            || item.Category is not ("request" or "installation" or "service")
            || item.Status is not ("todo" or "done") || item.Summary is null or { Length: > 1000 })
            || messages.Select(item => item.Id).Distinct().Count() != messages.Count)
            return "Zkontrolujte záznamy zpráv.";
        return null;
    }

    private async Task<List<CustomerRecord>> ReadAsync()
    {
        if (!File.Exists(path)) return [];
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<CustomerRecord>>(stream, JsonOptions)
            ?? throw new InvalidDataException("Customer data must be a JSON array.");
    }

    private async Task WriteAsync(List<CustomerRecord> items)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = Path.Combine(Path.GetDirectoryName(path)!, $"customers-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = File.Create(temp))
            {
                await JsonSerializer.SerializeAsync(stream, items, JsonOptions);
                await stream.FlushAsync();
            }
            File.Move(temp, path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}
