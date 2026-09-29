using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.BuildingEquipment;

public static class BuildingEquipmentEndpoints
{
    public static void MapBuildingEquipment(this WebApplication app)
    {
        app.MapGet("/api/building-equipment", async (BuildingEquipmentStore store) =>
            Results.Ok(await store.ListAsync()));
        app.MapGet("/api/building-equipment/{pointId:guid}", async (Guid pointId,
            NetworkPointStore points, BuildingEquipmentStore store) =>
            (await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building")
                ? Results.Ok(await store.GetAsync(pointId))
                : Results.NotFound(new { error = "Budova neexistuje." }));
        app.MapPut("/api/building-equipment/{pointId:guid}", async (Guid pointId,
            SaveBuildingEquipmentRequest request, NetworkPointStore points, BuildingEquipmentStore store,
            UndergroundRouteStore routes, RouteInstallationStore installations,
            BuildingDistributionStore distribution) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building"))
                return Results.NotFound(new { error = "Vybavení lze umístit jen do budovy." });
            var result = await store.SaveAsync(pointId, request, await routes.ListAsync(),
                await installations.ListAsync(), await distribution.GetAsync(pointId));
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });
    }
}
