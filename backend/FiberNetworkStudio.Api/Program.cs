using FiberNetworkStudio.Api;
using FiberNetworkStudio.Api.CableCatalog;
using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.Customers;
using FiberNetworkStudio.Api.DuctCatalog;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCableCatalog(builder.Configuration, builder.Environment.ContentRootPath);
builder.Services.AddDuctCatalog(builder.Configuration, builder.Environment.ContentRootPath);
var dataPath = builder.Configuration["NetworkPoints:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "network-points.json");
builder.Services.AddSingleton(new NetworkPointStore(dataPath));
var routeDataPath = builder.Configuration["UndergroundRoutes:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "underground-routes.json");
builder.Services.AddSingleton(new UndergroundRouteStore(routeDataPath));
var installationDataPath = builder.Configuration["RouteInstallations:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "route-installations.json");
builder.Services.AddSingleton(new RouteInstallationStore(installationDataPath));
var spliceDataPath = builder.Configuration["OpticalSplices:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "optical-splices.json");
builder.Services.AddSingleton(new OpticalSpliceStore(spliceDataPath));
var equipmentDataPath = builder.Configuration["BuildingEquipment:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "building-equipment.json");
builder.Services.AddSingleton(new BuildingEquipmentStore(equipmentDataPath));
var distributionDataPath = builder.Configuration["BuildingDistribution:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "building-distribution.json");
builder.Services.AddSingleton(new BuildingDistributionStore(distributionDataPath));
var customerDataPath = builder.Configuration["Customers:Path"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "customers.json");
builder.Services.AddSingleton(new CustomerStore(customerDataPath));
builder.Services.AddHttpClient<ParcelLookup>(client => client.Timeout = TimeSpan.FromSeconds(12));
builder.Services.AddHttpClient<BuildingFootprintLookup>(client => client.Timeout = TimeSpan.FromSeconds(12));
var app = builder.Build();
app.MapCableCatalog();
app.MapDuctCatalog();
app.MapUndergroundRoutes();
app.MapRouteInstallations();
app.MapOpticalSplices();
app.MapBuildingEquipment();
app.MapBuildingDistribution();
app.MapCustomers();

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
app.MapPost("/api/building-footprints/intersecting-route", async (BuildingFootprintRequest request,
    BuildingFootprintLookup lookup, ILogger<BuildingFootprintLookup> logger,
    CancellationToken cancellationToken) =>
{
    var coordinates = request.Coordinates;
    if (coordinates is null || coordinates.Count is < 2 or > 202
        || request.DistanceMeters is double distance && (!double.IsFinite(distance) || distance is < 0 or > 40)
        || coordinates.Any(point => !double.IsFinite(point.Latitude) || !double.IsFinite(point.Longitude)
            || point.Latitude is < -90 or > 90 || point.Longitude is < -180 or > 180))
        return Results.BadRequest(new { error = "Trasa musí obsahovat 2 až 202 platných bodů." });

    try
    {
        return Results.Ok(await lookup.FindAlongRouteAsync(coordinates, cancellationToken,
            request.DistanceMeters ?? 0));
    }
    catch (Exception exception) when (!cancellationToken.IsCancellationRequested
        && exception is HttpRequestException or JsonException or TaskCanceledException)
    {
        logger.LogWarning(exception, "Building footprint lookup failed");
        return Results.Problem("Půdorysy budov se nepodařilo načíst.", statusCode: 503);
    }
});
app.MapGet("/api/network-points", async (NetworkPointStore store) =>
    Results.Ok(await store.ListAsync()));

app.MapPost("/api/network-points", async (CreateNetworkPointRequest request, NetworkPointStore store) =>
{
    var errors = Validate(request.Name, request.Latitude, request.Longitude);
    if (request.Kind is not ("building" or "chamber"))
        errors["kind"] = ["Typ musí být building nebo chamber."];
    if (request.Kind == "building" && request.BuildingType is not (null or "standard" or "apartment"))
        errors["buildingType"] = ["Typ budovy musí být standard nebo apartment."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);

    var point = new NetworkPoint(Guid.NewGuid(), request.Kind!, request.Name!.Trim(),
        request.Latitude!.Value, request.Longitude!.Value,
        request.Kind == "building" ? request.BuildingType ?? "standard" : null);
    await store.AddAsync(point);
    return Results.Created($"/api/network-points/{point.Id}", point);
});

app.MapPut("/api/network-points/{id:guid}", async (Guid id, UpdateNetworkPointRequest request, NetworkPointStore store) =>
{
    var errors = Validate(request.Name, request.Latitude, request.Longitude);
    if (request.BuildingType is not (null or "standard" or "apartment"))
        errors["buildingType"] = ["Typ budovy musí být standard nebo apartment."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);

    var point = await store.UpdateAsync(id, request.Name!.Trim(), request.Latitude!.Value,
        request.Longitude!.Value, request.BuildingType);
    return point is null ? Results.NotFound() : Results.Ok(point);
});

app.MapDelete("/api/network-points/{id:guid}", async (Guid id, NetworkPointStore store,
    UndergroundRouteStore routes, OpticalSpliceStore splices, BuildingEquipmentStore equipment,
    BuildingDistributionStore distribution, CustomerStore customers) =>
    await routes.ContainsPointAsync(id)
        ? Results.Conflict(new { error = "Bod je koncem podzemní trasy. Nejprve upravte nebo smažte trasu." })
        : await splices.HasSpliceAsync(id)
            ? Results.Conflict(new { error = "V šachtě je optická spojka. Nejprve ji odeberte." })
        : await equipment.HasEquipmentAsync(id)
            ? Results.Conflict(new { error = "V budově je optické vybavení. Nejprve ho odeberte." })
        : await distribution.HasDistributionAsync(id)
            ? Results.Conflict(new { error = "V budově jsou domovní rozvody. Nejprve je odeberte." })
        : await customers.HasBuildingAsync(id)
            ? Results.Conflict(new { error = "K budově jsou přiřazení zákazníci. Nejprve je přesuňte nebo odeberte." })
        : await store.DeleteAsync(id) ? Results.NoContent() : Results.NotFound());

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

public sealed record CreateNetworkPointRequest(string? Kind, string? Name, double? Latitude, double? Longitude,
    string? BuildingType);
public sealed record UpdateNetworkPointRequest(string? Name, double? Latitude, double? Longitude,
    string? BuildingType);
