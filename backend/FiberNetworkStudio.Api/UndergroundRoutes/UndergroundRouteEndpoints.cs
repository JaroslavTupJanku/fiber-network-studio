using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.UndergroundRoutes;

public sealed record SaveUndergroundRouteRequest(string? Name, Guid? StartPointId, Guid? EndPointId,
    List<RouteVertex>? Waypoints, string? Kind = null);

public static class UndergroundRouteEndpoints
{
    public static void MapUndergroundRoutes(this WebApplication app)
    {
        app.MapGet("/api/underground-routes", async (UndergroundRouteStore store) =>
            Results.Ok(await store.ListAsync()));

        app.MapPost("/api/underground-routes/{id:guid}/split", async (Guid id, SplitRouteRequest request,
            RouteSplitService split) =>
        {
            var result = await split.SplitAsync(id, request);
            return result.Status switch
            {
                200 => Results.Ok(result.Outcome),
                404 => Results.NotFound(new { error = result.Error }),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });

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
                && (existing.StartPointId != request.StartPointId || existing.EndPointId != request.EndPointId
                    || existing.Kind != (request.Kind ?? "underground")))
                return Results.Conflict(new { error = "Trasa obsahuje instalované prvky. Koncové body ani druh trasy nelze změnit, dokud osazení neodeberete." });
            var route = await store.UpdateAsync(id, ToRoute(id, request));
            return route is null ? Results.NotFound() : Results.Ok(route);
        });

        app.MapDelete("/api/underground-routes/{id:guid}", async (Guid id, UndergroundRouteStore store,
            RouteInstallationStore installations) =>
            await installations.HasItemsAsync(id)
                ? Results.Conflict(new { error = "Nejdřív odeberte instalované prvky v trase." })
                : await store.DeleteAsync(id) ? Results.NoContent() : Results.NotFound());
    }

    private static UndergroundRoute ToRoute(Guid id, SaveUndergroundRouteRequest request) =>
        new(id, request.Name!.Trim(), request.StartPointId!.Value, request.EndPointId!.Value,
            request.Waypoints!.ToList(), request.Kind ?? "underground");

    private static async Task<Dictionary<string, string[]>> ValidateAsync(SaveUndergroundRouteRequest request,
        NetworkPointStore points)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Kind is not (null or "underground" or "aerial"))
            errors["kind"] = ["Druh trasy musí být underground nebo aerial."];
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80)
            errors["name"] = ["Název musí mít 1 až 80 znaků."];
        if (request.StartPointId is null || request.EndPointId is null
            || request.StartPointId == request.EndPointId)
            errors["endpoints"] = ["Trasa musí spojovat dva různé body sítě."];
        else
        {
            var allPoints = await points.ListAsync();
            var ids = allPoints.Select(point => point.Id).ToHashSet();
            if (!ids.Contains(request.StartPointId.Value) || !ids.Contains(request.EndPointId.Value))
                errors["endpoints"] = ["Koncový bod sítě neexistuje."];
            else if (request.Kind == "aerial" && allPoints.Any(point =>
                (point.Id == request.StartPointId || point.Id == request.EndPointId)
                && point.Kind is not ("building" or "pole")))
                errors["endpoints"] = ["Nadzemní trasa musí spojovat budovy nebo sloupy."];
        }
        if (request.Waypoints is null || request.Waypoints.Count > 200
            || request.Waypoints.Any(vertex => vertex is null || !double.IsFinite(vertex.Latitude)
                || !double.IsFinite(vertex.Longitude) || vertex.Latitude is < -90 or > 90
                || vertex.Longitude is < -180 or > 180))
            errors["waypoints"] = ["Trasa může mít nejvýše 200 platných lomových bodů."];
        return errors;
    }
}
