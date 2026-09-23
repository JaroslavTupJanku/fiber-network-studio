using FiberNetworkStudio.Api;

var builder = WebApplication.CreateBuilder(args);
var dataPath = builder.Configuration["NetworkPoints:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "network-points.json");
builder.Services.AddSingleton(new NetworkPointStore(dataPath));
var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/network-points", async (NetworkPointStore store) =>
    Results.Ok(await store.ListAsync()));

app.MapPost("/api/network-points", async (CreateNetworkPointRequest request, NetworkPointStore store) =>
{
    var errors = Validate(request.Name, request.Latitude, request.Longitude);
    if (request.Kind is not ("building" or "chamber"))
        errors["kind"] = ["Typ musí být building nebo chamber."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);

    var point = new NetworkPoint(Guid.NewGuid(), request.Kind!, request.Name!.Trim(),
        request.Latitude!.Value, request.Longitude!.Value);
    await store.AddAsync(point);
    return Results.Created($"/api/network-points/{point.Id}", point);
});

app.MapPut("/api/network-points/{id:guid}", async (Guid id, UpdateNetworkPointRequest request, NetworkPointStore store) =>
{
    var errors = Validate(request.Name, request.Latitude, request.Longitude);
    if (errors.Count > 0) return Results.ValidationProblem(errors);

    var point = await store.UpdateAsync(id, request.Name!.Trim(), request.Latitude!.Value,
        request.Longitude!.Value);
    return point is null ? Results.NotFound() : Results.Ok(point);
});

app.MapDelete("/api/network-points/{id:guid}", async (Guid id, NetworkPointStore store) =>
    await store.DeleteAsync(id) ? Results.NoContent() : Results.NotFound());

app.Run();

static Dictionary<string, string[]> Validate(string? name, double? latitude, double? longitude)
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 80)
        errors["name"] = ["Název musí mít 1 až 80 znaků."];
    if (latitude is null || !double.IsFinite(latitude.Value) || latitude is < -90 or > 90)
        errors["latitude"] = ["Neplatná zeměpisná šířka."];
    if (longitude is null || !double.IsFinite(longitude.Value) || longitude is < -180 or > 180)
        errors["longitude"] = ["Neplatná zeměpisná délka."];
    return errors;
}

public sealed record CreateNetworkPointRequest(string? Kind, string? Name, double? Latitude, double? Longitude);
public sealed record UpdateNetworkPointRequest(string? Name, double? Latitude, double? Longitude);
