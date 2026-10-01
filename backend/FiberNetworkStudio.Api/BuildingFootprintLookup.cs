using System.Text.Json;

namespace FiberNetworkStudio.Api;

public sealed record BuildingFootprintRequest(List<RouteCoordinate>? Coordinates, double? DistanceMeters = null);
public sealed record RouteCoordinate(double Latitude, double Longitude);

public sealed class BuildingFootprintLookup(HttpClient client)
{
    private const string ServiceUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/3/query";

    public async Task<JsonElement> FindAlongRouteAsync(IReadOnlyList<RouteCoordinate> coordinates,
        CancellationToken cancellationToken, double distanceMeters = 0)
    {
        var geometry = JsonSerializer.Serialize(new
        {
            paths = new[] { coordinates.Select(point => new[] { point.Longitude, point.Latitude }).ToArray() },
            spatialReference = new { wkid = 4326 }
        });
        var parameters = new Dictionary<string, string>
        {
            ["f"] = "geojson",
            ["geometry"] = geometry,
            ["geometryType"] = "esriGeometryPolyline",
            ["inSR"] = "4326",
            ["spatialRel"] = "esriSpatialRelIntersects",
            ["outFields"] = "kod",
            ["returnGeometry"] = "true",
            ["outSR"] = "4326",
            ["geometryPrecision"] = "7"
        };
        if (distanceMeters > 0)
        {
            parameters["distance"] = distanceMeters.ToString(System.Globalization.CultureInfo.InvariantCulture);
            parameters["units"] = "esriSRUnit_Meter";
        }
        using var content = new FormUrlEncodedContent(parameters);
        using var response = await client.PostAsync(ServiceUrl, content, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("features", out var features)
            || features.ValueKind != JsonValueKind.Array)
            throw new JsonException("Expected building footprint features.");
        return document.RootElement.Clone();
    }
}
