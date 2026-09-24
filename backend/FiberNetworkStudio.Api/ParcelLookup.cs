using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace FiberNetworkStudio.Api;

public sealed record Parcel(
    long Id,
    string Number,
    int CadastralAreaCode,
    string? CadastralAreaName,
    double? AreaSquareMeters,
    JsonElement Geometry);

public sealed class ParcelLookup(HttpClient client)
{
    private const string ServiceUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer";
    private static readonly ConcurrentDictionary<int, string> CadastralAreaNames = new();

    public async Task<Parcel?> FindAtAsync(double latitude, double longitude, CancellationToken cancellationToken)
    {
        var url = QueryHelpers.AddQueryString($"{ServiceUrl}/5/query", new Dictionary<string, string?>
        {
            ["f"] = "geojson",
            ["geometry"] = string.Create(CultureInfo.InvariantCulture, $"{longitude},{latitude}"),
            ["geometryType"] = "esriGeometryPoint",
            ["inSR"] = "4326",
            ["spatialRel"] = "esriSpatialRelIntersects",
            ["outFields"] = "id,cisloparcely,katastralniuzemi,vymeraparcely",
            ["returnGeometry"] = "true",
            ["outSR"] = "4326",
            ["geometryPrecision"] = "7"
        });

        using var response = await client.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("features", out var features)
            || features.ValueKind != JsonValueKind.Array)
            throw new JsonException("Expected parcel features.");
        if (features.GetArrayLength() == 0) return null;

        var feature = features[0];
        var properties = feature.GetProperty("properties");
        var geometry = feature.GetProperty("geometry");
        var geometryType = geometry.GetProperty("type").GetString();
        if (geometryType is not ("Polygon" or "MultiPolygon"))
            throw new JsonException("Expected parcel polygon.");

        var areaCode = properties.GetProperty("katastralniuzemi").GetInt32();
        var area = properties.GetProperty("vymeraparcely");
        var areaName = await GetCadastralAreaNameAsync(areaCode, cancellationToken);
        return new Parcel(
            properties.GetProperty("id").GetInt64(),
            properties.GetProperty("cisloparcely").GetString() ?? "?",
            areaCode,
            areaName,
            area.ValueKind == JsonValueKind.Number ? area.GetDouble() : null,
            geometry.Clone());
    }

    private async Task<string?> GetCadastralAreaNameAsync(int code, CancellationToken cancellationToken)
    {
        if (CadastralAreaNames.TryGetValue(code, out var cached)) return cached;

        var url = QueryHelpers.AddQueryString($"{ServiceUrl}/7/query", new Dictionary<string, string?>
        {
            ["f"] = "json",
            ["where"] = $"kod={code}",
            ["outFields"] = "nazev",
            ["returnGeometry"] = "false"
        });

        try
        {
            using var response = await client.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("features", out var features)
                || features.ValueKind != JsonValueKind.Array || features.GetArrayLength() == 0)
                return null;
            var name = features[0].GetProperty("attributes").GetProperty("nazev").GetString();
            if (name is not null) CadastralAreaNames.TryAdd(code, name);
            return name;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
    }
}
