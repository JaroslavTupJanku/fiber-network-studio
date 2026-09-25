using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.UndergroundRoutes;

public sealed record SaveUndergroundRouteRequest(string? Name, Guid? StartPointId, Guid? EndPointId,
    List<RouteVertex>? Waypoints);

public static class UndergroundRouteEndpoints
{
    public static void MapUndergroundRoutes(this WebApplication app)
    {
        app.MapGet("/api/underground-routes", async (UndergroundRouteStore store) =>
            Results.Ok(await store.ListAsync()));

        app.MapPost("/api/underground-routes", async (SaveUndergroundRouteRequest request,
            UndergroundRouteStore store, NetworkPointStore points) =>
        {
            var errors = await ValidateAsync(request, points);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var route = ToRoute(Guid.NewGuid(), request);
            await store.AddAsync(route);
            return Results.Created($"/api/underground-routes/{route.Id}", route);
        });

        app.MapPut("/api/underground-routes/{id:guid}", async (Guid id, SaveUndergroundRouteRequest request,
            UndergroundRouteStore store, NetworkPointStore points, RouteInstallationStore installations) =>
        {
            var errors = await ValidateAsync(request, points);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var existing = (await store.ListAsync()).FirstOrDefault(route => route.Id == id);
            if (existing is not null && await installations.HasItemsAsync(id)
                && (existing.StartPointId != request.StartPointId || existing.EndPointId != request.EndPointId))
                return Results.Conflict(new { error = "Trasa obsahuje instalované kusy. Koncové body nelze změnit, dokud osazení neodeberete." });
            var route = await store.UpdateAsync(id, ToRoute(id, request));
            return route is null ? Results.NotFound() : Results.Ok(route);
        });

        app.MapDelete("/api/underground-routes/{id:guid}", async (Guid id, UndergroundRouteStore store,
            RouteInstallationStore installations) =>
            await installations.HasItemsAsync(id)
                ? Results.Conflict(new { error = "Nejdřív odeberte instalované kusy v trase." })
                : await store.DeleteAsync(id) ? Results.NoContent() : Results.NotFound());
    }

    private static UndergroundRoute ToRoute(Guid id, SaveUndergroundRouteRequest request) =>
        new(id, request.Name!.Trim(), request.StartPointId!.Value, request.EndPointId!.Value,
            request.Waypoints!.ToList());

    private static async Task<Dictionary<string, string[]>> ValidateAsync(SaveUndergroundRouteRequest request,
        NetworkPointStore points)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80)
            errors["name"] = ["Název musí mít 1 až 80 znaků."];
        if (request.StartPointId is null || request.EndPointId is null
            || request.StartPointId == request.EndPointId)
            errors["endpoints"] = ["Trasa musí spojovat dva různé body sítě."];
        else
        {
            var ids = (await points.ListAsync()).Select(point => point.Id).ToHashSet();
            if (!ids.Contains(request.StartPointId.Value) || !ids.Contains(request.EndPointId.Value))
                errors["endpoints"] = ["Koncový bod sítě neexistuje."];
        }
        if (request.Waypoints is null || request.Waypoints.Count > 200
            || request.Waypoints.Any(vertex => vertex is null || !double.IsFinite(vertex.Latitude)
                || !double.IsFinite(vertex.Longitude) || vertex.Latitude is < -90 or > 90
                || vertex.Longitude is < -180 or > 180))
            errors["waypoints"] = ["Trasa může mít nejvýše 200 platných lomových bodů."];
        return errors;
    }
}
