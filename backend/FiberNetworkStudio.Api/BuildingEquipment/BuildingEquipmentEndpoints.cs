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
            var guardedPorts = current.Ports.Where(port => protectedIds.Contains(port.Id)).ToArray();
            var guardedShelfIds = guardedPorts.Select(port =>
                current.Cards.FirstOrDefault(card => card.Id == port.ParentId)?.ShelfId ?? port.ParentId)
                .ToHashSet();
            var guardedCards = current.Cards.Where(card => guardedPorts.Any(port => port.ParentId == card.Id));
            if (request.Version == current.Version && protectedIds.Count > 0
                && (guardedPorts.Any(port =>
                    {
                        var next = request.Ports?.FirstOrDefault(item => item?.Id == port.Id);
                        return next is null || next.ParentId != port.ParentId || next.Fiber != port.Fiber
                            || next.PatchPortId != port.PatchPortId;
                    })
                    || request.Shelves is null || request.Cards is null
                    || current.Shelves.Where(shelf => guardedShelfIds.Contains(shelf.Id)).Any(shelf =>
                    {
                        var next = request.Shelves.FirstOrDefault(item => item?.Id == shelf.Id);
                        return next is null || next.RackId != shelf.RackId || next.Kind != shelf.Kind;
                    })
                    || guardedCards.Any(card =>
                    {
                        var next = request.Cards.FirstOrDefault(item => item?.Id == card.Id);
                        return next is null || next.ShelfId != card.ShelfId;
                    })))
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
