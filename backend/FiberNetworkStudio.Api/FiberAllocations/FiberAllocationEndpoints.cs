using FiberNetworkStudio.Api.BuildingDistribution;
using FiberNetworkStudio.Api.RouteInstallations;

namespace FiberNetworkStudio.Api.FiberAllocations;

public static class FiberAllocationEndpoints
{
    public static void MapFiberAllocations(this WebApplication app)
    {
        app.MapGet("/api/fiber-allocations", async (FiberAllocationStore store) =>
            Results.Ok(await store.GetAsync()));
        app.MapPut("/api/fiber-allocations", async (FiberAllocationDocument request,
            FiberAllocationStore store, RouteInstallationStore installations,
            BuildingDistributionStore distributions) =>
        {
            var result = await store.SaveAsync(request, await installations.ListAsync(),
                await distributions.ListAsync());
            return result.Status switch
            {
                200 => Results.Ok(result.Document),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error })
            };
        });
    }
}
