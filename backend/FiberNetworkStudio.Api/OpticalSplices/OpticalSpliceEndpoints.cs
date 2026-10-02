using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;
using FiberNetworkStudio.Api.FiberAllocations;
using System.Text.Json;

namespace FiberNetworkStudio.Api.OpticalSplices;

public static class OpticalSpliceEndpoints
{
    public static void MapOpticalSplices(this WebApplication app)
    {
        app.MapGet("/api/optical-splices", async (OpticalSpliceStore store) =>
            Results.Ok(await store.ListAsync()));

        app.MapGet("/api/optical-splices/{pointId:guid}", async (Guid pointId,
            NetworkPointStore points, OpticalSpliceStore store) =>
            (await points.ListAsync()).Any(point => point.Id == pointId && point.Kind is "chamber" or "pole")
                ? Results.Ok(await store.GetAsync(pointId))
                : Results.NotFound(new { error = "Šachta nebo sloup neexistuje." }));

        app.MapPut("/api/optical-splices/{pointId:guid}", async (Guid pointId,
            SaveOpticalSpliceRequest request, NetworkPointStore points, OpticalSpliceStore store,
            UndergroundRouteStore routes, RouteInstallationStore installations,
            FiberAllocationStore allocations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind is "chamber" or "pole"))
                return Results.NotFound(new { error = "Spojku lze umístit do existující šachty nebo na sloup." });
            var allRoutes = await routes.ListAsync();
            var allInstallations = await installations.ListAsync();
            var current = await store.GetAsync(pointId);
            if (request.Version == current.Version
                && (JsonSerializer.Serialize(current.Connections) != JsonSerializer.Serialize(request.Connections)
                    || JsonSerializer.Serialize(current.Splitters) != JsonSerializer.Serialize(request.Splitters ?? current.Splitters))
                && await HasAllocatedRunAtPoint(pointId, allRoutes, allInstallations, allocations))
                return Results.Conflict(new { error = "Spojka obsahuje cestu s rezervovanými nebo využitými vlákny. Nejdřív uvolněte přiřazení vláken." });
            var result = await store.SaveAsync(pointId, request, allRoutes, allInstallations);
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });

        app.MapPost("/api/optical-splices/{pointId:guid}/split-cable", async (Guid pointId,
            SplitInstalledRunRequest request, NetworkPointStore points, UndergroundRouteStore routes,
            RouteInstallationStore installations, FiberAllocationStore allocations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind is "chamber" or "pole"))
                return Results.NotFound(new { error = "Kabel lze rozdělit v existující šachtě nebo na sloupu." });
            var item = (await installations.ListAsync()).SelectMany(document => document.Items)
                .FirstOrDefault(item => item.Id == request.ItemId);
            if (item is not null && await allocations.ReferencesRunAsync([item.RunId]))
                return Results.Conflict(new { error = "Kabel má rezervovaná nebo využitá vlákna. Před rozdělením běhu uvolněte přiřazení." });
            var result = await installations.SplitCableRunAsync(pointId, request, await routes.ListAsync());
            return result.Status switch
            {
                200 => Results.Ok(await installations.ListAsync()),
                404 => Results.NotFound(new { error = result.Error }),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });

        app.MapDelete("/api/optical-splices/{pointId:guid}", async (Guid pointId,
            OpticalSpliceStore store, UndergroundRouteStore routes, RouteInstallationStore installations,
            FiberAllocationStore allocations) =>
        {
            if (await HasAllocatedRunAtPoint(pointId, await routes.ListAsync(),
                    await installations.ListAsync(), allocations))
                return Results.Conflict(new { error = "Spojka je součástí rezervované nebo využité optické cesty. Nejdřív uvolněte přiřazení vláken." });
            return await store.DeleteAsync(pointId) ? Results.NoContent() : Results.NotFound();
        });
    }

    private static async Task<bool> HasAllocatedRunAtPoint(Guid pointId,
        IReadOnlyList<UndergroundRoute> routes, IReadOnlyList<RouteInstallationDocument> installations,
        FiberAllocationStore allocations)
    {
        var routeIds = routes.Where(route => route.StartPointId == pointId || route.EndPointId == pointId)
            .Select(route => route.Id).ToHashSet();
        return await allocations.ReferencesRunAsync(installations.Where(item => routeIds.Contains(item.RouteId))
            .SelectMany(item => item.Items).Where(item => item.Cable is not null).Select(item => item.RunId));
    }
}
