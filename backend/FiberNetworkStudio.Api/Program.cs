using FiberNetworkStudio.Api;
using FiberNetworkStudio.Api.CableCatalog;
using FiberNetworkStudio.Api.DuctCatalog;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCableCatalog(builder.Configuration, builder.Environment.ContentRootPath);
builder.Services.AddDuctCatalog(builder.Configuration, builder.Environment.ContentRootPath);
var dataPath = builder.Configuration["NetworkPoints:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "network-points.json");
builder.Services.AddSingleton(new NetworkPointStore(dataPath));
builder.Services.AddHttpClient<ParcelLookup>(client => client.Timeout = TimeSpan.FromSeconds(12));
var app = builder.Build();
app.MapCableCatalog();
app.MapDuctCatalog();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/parcels/at", async (double latitude, double longitude, ParcelLookup lookup,
    ILogger<ParcelLookup> logger, CancellationToken cancellationToken) =>
{
    if (!double.IsFinite(latitude) || !double.IsFinite(longitude)
        || latitude is < -90 or > 90 || longitude is < -180 or > 180)
        return Results.BadRequest(new { error = "Neplatné souřadnice." });

    try
    {
        var parcel = await lookup.FindAtAsync(latitude, longitude, cancellationToken);
        return parcel is null ? Results.NoContent() : Results.Ok(parcel);
    }
    catch (Exception exception) when (!cancellationToken.IsCancellationRequested
        && exception is HttpRequestException or JsonException or TaskCanceledException)
    {
        logger.LogWarning(exception, "Parcel lookup failed");
        return Results.Problem("Katastrální údaje se nepodařilo načíst.", statusCode: 503);
    }
});
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
