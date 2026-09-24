namespace FiberNetworkStudio.Api.CableCatalog;

public static class CableCatalogEndpoints
{
    public static IServiceCollection AddCableCatalog(this IServiceCollection services, IConfiguration configuration, string root)
    {
        services.AddSingleton(new CableCatalogStore(configuration["CableCatalog:Path"]
            ?? Path.Combine(root, "App_Data", "cable-catalog.json")));
        return services;
    }

    public static void MapCableCatalog(this WebApplication app)
    {
        var group = app.MapGroup("/api/cable-catalog");
        group.MapGet("/color-codes", () => Results.Ok(ColorCodes.Data));
        group.MapGet("/color-codes/download", () => Results.File(
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(ColorCodes.Data,
                new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web) { WriteIndented = true }),
            "application/json", "cable-color-codes.json"));
        group.MapGet("/", async (CableCatalogStore store) => Results.Ok(await store.ListAsync()));
        group.MapPost("/", async (CableInput input, CableCatalogStore store) =>
        {
            var errors = CableRules.Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var item = await store.AddAsync(input);
            return Results.Created($"/api/cable-catalog/{item.Id}", item);
        });
        group.MapPut("/{id:guid}", async (Guid id, CableInput input, CableCatalogStore store) =>
        {
            if (CablePresets.All.Any(item => item.Id == id)) return PresetConflict();
            var errors = CableRules.Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await store.UpdateAsync(id, input);
            if (result.Conflict) return VersionConflict();
            return result.Item is null ? Results.NotFound() : Results.Ok(result.Item);
        });
        group.MapDelete("/{id:guid}", async (Guid id, int version, CableCatalogStore store) =>
        {
            if (CablePresets.All.Any(item => item.Id == id)) return PresetConflict();
            return await store.DeleteAsync(id, version) switch
            {
                204 => Results.NoContent(),
                409 => VersionConflict(),
                _ => Results.NotFound()
            };
        });
    }

    private static IResult PresetConflict() => Results.Conflict(new { detail = "Výchozí šablonu nelze změnit ani smazat. Vytvořte její kopii." });
    private static IResult VersionConflict() => Results.Conflict(new { detail = "Kabel mezitím změnil jiný uživatel. Zrušte úpravy a načtěte katalog znovu." });
}
