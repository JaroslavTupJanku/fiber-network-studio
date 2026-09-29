using FiberNetworkStudio.Api.RouteInstallations;
using FiberNetworkStudio.Api.UndergroundRoutes;

namespace FiberNetworkStudio.Api.OpticalSplices;

public static class OpticalSpliceEndpoints
{
    public static void MapOpticalSplices(this WebApplication app)
    {
        app.MapGet("/api/optical-splices", async (OpticalSpliceStore store) =>
            Results.Ok(await store.ListAsync()));

        app.MapGet("/api/optical-splices/{pointId:guid}", async (Guid pointId,
            NetworkPointStore points, OpticalSpliceStore store) =>
            (await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "chamber")
                ? Results.Ok(await store.GetAsync(pointId))
                : Results.NotFound(new { error = "Šachta neexistuje." }));

        app.MapPut("/api/optical-splices/{pointId:guid}", async (Guid pointId,
            SaveOpticalSpliceRequest request, NetworkPointStore points, OpticalSpliceStore store,
            UndergroundRouteStore routes, RouteInstallationStore installations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "chamber"))
                return Results.NotFound(new { error = "Spojku lze umístit jen do existující šachty." });
            var result = await store.SaveAsync(pointId, request, await routes.ListAsync(),
                await installations.ListAsync());
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });

        app.MapPost("/api/optical-splices/{pointId:guid}/split-cable", async (Guid pointId,
            SplitInstalledRunRequest request, NetworkPointStore points, UndergroundRouteStore routes,
            RouteInstallationStore installations) =>
        {
            if (!(await points.ListAsync()).Any(point => point.Id == pointId && point.Kind == "chamber"))
                return Results.NotFound(new { error = "Kabel lze rozdělit jen v existující šachtě." });
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
            OpticalSpliceStore store) => await store.DeleteAsync(pointId)
                ? Results.NoContent() : Results.NotFound());
    }
}
