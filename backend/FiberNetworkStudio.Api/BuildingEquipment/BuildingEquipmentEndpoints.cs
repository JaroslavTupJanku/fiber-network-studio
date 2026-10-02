using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.UndergroundRoutes;
using FiberNetworkStudio.Api.FiberAllocations;

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
            BuildingDistributionStore distribution, FiberAllocationStore allocations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "building"))
                return Results.NotFound(new { error = "Vybavení lze umístit jen do budovy." });
            var allInstallations = await installations.ListAsync();
            var current = await store.GetAsync(pointId);
            var runByItem = allInstallations.SelectMany(document => document.Items)
                .Where(item => item.Cable is not null).ToDictionary(item => item.Id, item => item.RunId);
            var allocated = (await allocations.GetAsync()).Allocations.SelectMany(item => item.Fibers).ToHashSet();
            var protectedPorts = current.Ports.Where(port => port.Fiber is not null
                && runByItem.TryGetValue(port.Fiber.ItemId, out var runId)
                && allocated.Contains(new AllocatedFiber(runId, port.Fiber.TubeIndex, port.Fiber.FiberIndex)))
                .ToArray();
            var protectedIds = protectedPorts.Select(item => item.Id)
                .Concat(protectedPorts.Where(item => item.PatchPortId is not null)
                    .Select(item => item.PatchPortId!.Value)).ToHashSet();
            if (request.Version == current.Version && protectedIds.Count > 0
                && (current.Ports.Where(port => protectedIds.Contains(port.Id))
                        .Any(port => request.Ports?.FirstOrDefault(next => next?.Id == port.Id) != port)
                    || request.Shelves is null || request.Cards is null
                    || current.Shelves.Except(request.Shelves).Any() || current.Cards.Except(request.Cards).Any()))
                return Results.Conflict(new { error = "Vybavení je součástí rezervované nebo využité optické cesty. Nejprve uvolněte přiřazení vláken." });
            var result = await store.SaveAsync(pointId, request, await routes.ListAsync(),
                allInstallations, await distribution.GetAsync(pointId));
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });
    }
}
