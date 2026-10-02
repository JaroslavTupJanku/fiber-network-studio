using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.Customers;
using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;
using FiberNetworkStudio.Api.FiberAllocations;

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
            UndergroundRouteStore routes, RouteInstallationStore installations, BuildingEquipmentStore equipment,
            CustomerStore customers, FiberAllocationStore allocations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building"))
                return Results.NotFound(new { error = "Rozvod lze umístit jen do budovy." });
            if (request.Premises is not null && await customers.ReferencesRemovedPremiseAsync(pointId,
                request.Premises.Where(item => item is not null).Select(item => item.Id)))
                return Results.Conflict(new { error = "Na přípojné místo je navázaný zákazník. Nejdříve upravte jeho vazbu." });
            if (request.Premises is not null)
            {
                var current = await store.GetAsync(pointId);
                var changed = current.Premises.Where(previous =>
                {
                    var next = request.Premises.FirstOrDefault(item => item?.Id == previous.Id);
                    return next is null || next.Status != "connected" || next.Fiber != previous.Fiber
                        || next.BoxId != previous.BoxId;
                }).Select(item => item.Id);
                if (await allocations.ReferencesPremiseAsync(changed))
                    return Results.Conflict(new { error = "Přípojné místo má rezervovanou nebo využitou optickou cestu. Nejprve uvolněte přiřazení vlákna." });
            }
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
