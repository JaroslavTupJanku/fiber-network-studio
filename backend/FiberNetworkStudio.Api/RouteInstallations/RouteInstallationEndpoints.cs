using FiberNetworkStudio.Api.CableCatalog;
using FiberNetworkStudio.Api.BuildingEquipment;
using FiberNetworkStudio.Api.DuctCatalog;
using FiberNetworkStudio.Api.OpticalSplices;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.RouteInstallations;

public static class RouteInstallationEndpoints
{
    public static void MapRouteInstallations(this WebApplication app)
    {
        var group = app.MapGroup("/api/route-installations");
        group.MapGet("/", async (RouteInstallationStore store) => Results.Ok(await store.ListAsync()));

        group.MapPost("/{routeId:guid}/items", async (Guid routeId, AddInstalledItemRequest request,
            RouteInstallationStore store, UndergroundRouteStore routeStore,
            DuctCatalogStore ductStore, CableCatalogStore cableStore, OpticalSpliceStore splices,
            BuildingEquipmentStore equipment) =>
        {
            var routes = await routeStore.ListAsync();
            var route = routes.FirstOrDefault(item => item.Id == routeId);
            if (route is null) return Results.NotFound(new { error = "Trasa neexistuje." });
            if (request.ContinueFromItemId is Guid sourceId)
            {
                var source = (await store.ListAsync()).SelectMany(document => document.Items)
                    .FirstOrDefault(item => item.Id == sourceId);
                var sourceRoute = routes.FirstOrDefault(item => item.Id == source?.RouteId);
                if (sourceRoute is not null)
                {
                    var shared = new[] { route.StartPointId, route.EndPointId }
                        .Where(pointId => pointId == sourceRoute.StartPointId || pointId == sourceRoute.EndPointId);
                    if (await splices.ConnectsItemAtAnyAsync(sourceId, shared))
                        return Results.Conflict(new { error = "Kabel je v tomto bodě ukončený ve spojce. Nejdřív odeberte jeho spoje." });
                    if (await equipment.TerminatesItemAtAnyAsync(sourceId, shared))
                        return Results.Conflict(new { error = "Kabel končí na ODF portu. Nejdřív odeberte terminaci." });
                }
            }
            if (request.ContinueFromItemId is null && request.CatalogId is null)
                return Results.BadRequest(new { error = "Vyberte typ z katalogu nebo navazující prvek." });
            var duct = request.ContinueFromItemId is null
                ? (await ductStore.ListAsync()).FirstOrDefault(item => item.Id == request.CatalogId) : null;
            var cable = request.ContinueFromItemId is null && duct is null
                ? (await cableStore.ListAsync()).FirstOrDefault(item => item.Id == request.CatalogId) : null;
            return ToResult(await store.AddAsync(route, routes, request, duct, cable));
        });

        group.MapPut("/{routeId:guid}/items/{itemId:guid}", async (Guid routeId, Guid itemId,
            RenameInstalledItemRequest request, RouteInstallationStore store) =>
            ToResult(await store.RenameAsync(routeId, itemId, request)));

        group.MapPost("/{routeId:guid}/items/{itemId:guid}/generate-microducts", async (Guid routeId,
            Guid itemId, GenerateMicroductsRequest request, RouteInstallationStore store,
            DuctCatalogStore ductStore) =>
        {
            var microduct = (await ductStore.ListAsync()).FirstOrDefault(item => item.Id == request.CatalogId);
            return ToResult(await store.GenerateMicroductsAsync(routeId, itemId, request, microduct));
        });

        group.MapPost("/chambers/{pointId:guid}/split-conduit", async (Guid pointId,
            SplitInstalledRunRequest request, NetworkPointStore points, UndergroundRouteStore routes,
            RouteInstallationStore store) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "chamber"))
                return Results.NotFound(new { error = "Chráničku lze rozdělit jen v existující šachtě." });
            var result = await store.SplitConduitRunAsync(pointId, request, await routes.ListAsync());
            return result.Status switch
            {
                200 => Results.Ok(await store.ListAsync()),
                404 => Results.NotFound(new { error = result.Error }),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });

        group.MapPut("/{routeId:guid}/items/{itemId:guid}/placement", async (Guid routeId, Guid itemId,
            MoveInstalledItemRequest request, RouteInstallationStore store) =>
            ToResult(await store.MoveAsync(routeId, itemId, request)));

        group.MapDelete("/{routeId:guid}/items/{itemId:guid}", async (Guid routeId, Guid itemId,
            int version, RouteInstallationStore store, UndergroundRouteStore routeStore,
            OpticalSpliceStore splices, BuildingEquipmentStore equipment) =>
        {
            var items = (await store.ListAsync()).FirstOrDefault(document => document.RouteId == routeId)?.Items;
            if (items is not null)
            {
                var removed = new HashSet<Guid> { itemId };
                while (true)
                {
                    var count = removed.Count;
                    foreach (var item in items.Where(item => item.ParentId is Guid parent && removed.Contains(parent)))
                        removed.Add(item.Id);
                    if (removed.Count == count) break;
                }
                if (await splices.ReferencesAnyAsync(removed))
                    return Results.Conflict(new { error = "Kabel je připojený ve spojce. Nejprve odeberte propojení a rezervu ve spojce." });
                if (await equipment.ReferencesAnyAsync(removed))
                    return Results.Conflict(new { error = "Vlákno kabelu je ukončené na ODF portu. Nejprve odeberte terminaci." });
            }
            return ToResult(await store.RemoveAsync(routeId, itemId, version, await routeStore.ListAsync()));
        });
    }

    private static IResult ToResult(InstallationResult result) => result.Status switch
    {
        200 => Results.Ok(result.Document),
        404 => Results.NotFound(new { error = result.Error }),
        409 => Results.Conflict(new { error = result.Error }),
        _ => Results.BadRequest(new { error = result.Error })
    };
}
