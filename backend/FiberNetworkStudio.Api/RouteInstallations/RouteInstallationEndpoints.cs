using FiberNetworkStudio.Api.CableCatalog;
using FiberNetworkStudio.Api.DuctCatalog;
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
            DuctCatalogStore ductStore, CableCatalogStore cableStore) =>
        {
            var routes = await routeStore.ListAsync();
            var route = routes.FirstOrDefault(item => item.Id == routeId);
            if (route is null) return Results.NotFound(new { error = "Trasa neexistuje." });
            if (request.ContinueFromItemId is null && request.CatalogId is null)
                return Results.BadRequest(new { error = "Vyberte typ z katalogu nebo návazný kus." });
            var duct = request.ContinueFromItemId is null
                ? (await ductStore.ListAsync()).FirstOrDefault(item => item.Id == request.CatalogId) : null;
            var cable = request.ContinueFromItemId is null && duct is null
                ? (await cableStore.ListAsync()).FirstOrDefault(item => item.Id == request.CatalogId) : null;
            return ToResult(await store.AddAsync(route, routes, request, duct, cable));
        });

        group.MapPut("/{routeId:guid}/items/{itemId:guid}", async (Guid routeId, Guid itemId,
            RenameInstalledItemRequest request, RouteInstallationStore store) =>
            ToResult(await store.RenameAsync(routeId, itemId, request)));

        group.MapDelete("/{routeId:guid}/items/{itemId:guid}", async (Guid routeId, Guid itemId,
            int version, RouteInstallationStore store, UndergroundRouteStore routeStore) =>
            ToResult(await store.RemoveAsync(routeId, itemId, version, await routeStore.ListAsync())));
    }

    private static IResult ToResult(InstallationResult result) => result.Status switch
    {
        200 => Results.Ok(result.Document),
        404 => Results.NotFound(new { error = result.Error }),
        409 => Results.Conflict(new { error = result.Error }),
        _ => Results.BadRequest(new { error = result.Error })
    };
}
