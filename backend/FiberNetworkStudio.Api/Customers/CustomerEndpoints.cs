using FiberNetworkStudio.Api.BuildingDistribution;

namespace FiberNetworkStudio.Api.Customers;

public static class CustomerEndpoints
{
    public static void MapCustomers(this WebApplication app)
    {
        app.MapGet("/api/customers", async (CustomerStore store) => Results.Ok(await store.ListAsync()));
        app.MapPost("/api/customers", async (CustomerWrite request, CustomerStore store,
            NetworkPointStore points, BuildingDistributionStore distribution) =>
        {
            var relationError = await ValidateRelation(request, points, distribution);
            if (relationError is not null) return Results.BadRequest(new { error = relationError });
            var result = await store.CreateAsync(request);
            return result.Status == 201
                ? Results.Created($"/api/customers/{result.Customer!.Id}", result.Customer)
                : Results.BadRequest(new { error = result.Error });
        });
        app.MapPut("/api/customers/{id:guid}", async (Guid id, CustomerWrite request,
            CustomerStore store, NetworkPointStore points, BuildingDistributionStore distribution) =>
        {
            var relationError = await ValidateRelation(request, points, distribution);
            if (relationError is not null) return Results.BadRequest(new { error = relationError });
            var result = await store.UpdateAsync(id, request);
            return result.Status switch
            {
                200 => Results.Ok(result.Customer),
                404 => Results.NotFound(new { error = result.Error }),
                409 => Results.Conflict(new { error = result.Error }),
                _ => Results.BadRequest(new { error = result.Error }),
            };
        });
        app.MapDelete("/api/customers/{id:guid}", async (Guid id, int version, CustomerStore store) =>
        {
            var result = await store.DeleteAsync(id, version);
            return result.Status switch
            {
                204 => Results.NoContent(),
                404 => Results.NotFound(new { error = result.Error }),
                _ => Results.Conflict(new { error = result.Error }),
            };
        });
    }

    private static async Task<string?> ValidateRelation(CustomerWrite request, NetworkPointStore points,
        BuildingDistributionStore distribution)
    {
        if (!(await points.ListAsync()).Any(point => point.Id == request.BuildingPointId && point.Kind == "building"))
            return "Zákazníka lze přiřadit jen k existující budově.";
        if (request.PremiseId is Guid premiseId
            && !(await distribution.GetAsync(request.BuildingPointId)).Premises.Any(item => item.Id == premiseId))
            return "Vybrané přípojné místo do této budovy nepatří.";
        return null;
    }
}
