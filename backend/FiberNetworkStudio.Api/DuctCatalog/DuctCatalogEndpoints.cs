namespace FiberNetworkStudio.Api.DuctCatalog;

public static class DuctCatalogEndpoints
{
    public static IServiceCollection AddDuctCatalog(this IServiceCollection services, IConfiguration configuration, string root)
    {
        services.AddSingleton(new DuctCatalogStore(configuration["DuctCatalog:Path"]
            ?? Path.Combine(root, "App_Data", "duct-catalog.json")));
        return services;
    }

    public static void MapDuctCatalog(this WebApplication app)
    {
        var group = app.MapGroup("/api/duct-catalog");
        group.MapGet("/", async (DuctCatalogStore store) => Results.Ok(await store.ListAsync()));
        group.MapPost("/", async (DuctTypeInput input, DuctCatalogStore store) =>
        {
            var errors = DuctRules.Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var item = await store.AddAsync(input);
            return Results.Created($"/api/duct-catalog/{item.Id}", item);
        });
        group.MapPut("/{id:guid}", async (Guid id, DuctTypeInput input, DuctCatalogStore store) =>
        {
            if (DuctPresets.All.Any(item => item.Id == id)) return PresetConflict();
            var errors = DuctRules.Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await store.UpdateAsync(id, input);
            if (result.Conflict) return VersionConflict();
            return result.Item is null ? Results.NotFound() : Results.Ok(result.Item);
        });
        group.MapDelete("/{id:guid}", async (Guid id, int version, DuctCatalogStore store) =>
        {
            if (DuctPresets.All.Any(item => item.Id == id)) return PresetConflict();
            return await store.DeleteAsync(id, version) switch
            {
                204 => Results.NoContent(),
                409 => VersionConflict(),
                _ => Results.NotFound()
            };
        });
    }

    private static IResult PresetConflict() => Results.Conflict(new { detail = "Výchozí šablonu nelze upravit ani smazat. Vytvořte kopii." });
    private static IResult VersionConflict() => Results.Conflict(new { detail = "Typ mezitím změnil jiný uživatel. Načtěte katalog znovu." });
}
