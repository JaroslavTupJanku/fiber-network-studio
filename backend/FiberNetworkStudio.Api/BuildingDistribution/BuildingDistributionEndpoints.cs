using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.BuildingDistribution;

public static class BuildingDistributionEndpoints
{
    public static void MapBuildingDistribution(this WebApplication app)
    {
        app.MapGet("/api/building-distribution", async (BuildingDistributionStore store) =>
            Results.Ok(await store.ListAsync()));
        app.MapGet("/api/building-distribution/{pointId:guid}", async (Guid pointId,
            NetworkPointStore points, BuildingDistributionStore store) =>
            (await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building")
                ? Results.Ok(await store.GetAsync(pointId))
                : Results.NotFound(new { error = "Budova neexistuje." }));
        app.MapPut("/api/building-distribution/{pointId:guid}", async (Guid pointId,
            SaveBuildingDistributionRequest request, NetworkPointStore points, BuildingDistributionStore store,
            UndergroundRouteStore routes, RouteInstallationStore installations, BuildingEquipmentStore equipment) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building"))
                return Results.NotFound(new { error = "Rozvod lze umístit jen do budovy." });
            var result = await store.SaveAsync(pointId, request, await routes.ListAsync(),
                await installations.ListAsync(), await equipment.GetAsync(pointId));
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });
    }
}
