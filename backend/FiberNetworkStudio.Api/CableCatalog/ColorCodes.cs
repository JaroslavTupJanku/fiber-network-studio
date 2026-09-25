using System.Text.Json;

namespace FiberNetworkStudio.Api.CableCatalog;

public interface ICableColor
{
    string Color { get; }
    string Marking { get; }
    string? MarkerColor { get; }
    int? MarkingSpacingMm { get; }
    bool Transparent { get; }
}
public sealed record ColorMark(string Color, string Marking, string? MarkerColor, int? MarkingSpacingMm, bool Transparent) : ICableColor;
public sealed record NamedColor(string Name, string Hex);
public sealed record ColorProfile(string Id, string Label, string SourceUrl, string SourceLabel, string Note,
    ColorMark[] Fibers, ColorMark[] Tubes);
public sealed record ColorCodeData(int SchemaVersion, string ReviewedOn, string DisplayNote, NamedColor[] Colors, ColorProfile[] Profiles);

public static class ColorCodes
{
    public static ColorCodeData Data { get; } = Load();
    private static ColorCodeData Load()
    {
        using var stream = typeof(ColorCodes).Assembly.GetManifestResourceStream("FiberNetworkStudio.Api.CableCatalog.color-codes.json")
            ?? throw new InvalidOperationException("Missing color code data.");
        return JsonSerializer.Deserialize<ColorCodeData>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }

    public static bool Matches(string? id, IEnumerable<ICableColor> parts, bool fibers)
    {
        if (id is null or "custom") return true;
        var profile = Data.Profiles.FirstOrDefault(profile => profile.Id == id);
        if (profile is null) return false;
        var sequence = fibers ? profile.Fibers : profile.Tubes;
        return parts.Select((part, i) => i < sequence.Length && MatchesMark(part, sequence[i])).All(match => match);
    }

    private static bool MatchesMark(ICableColor part, ColorMark reference) =>
        string.Equals(part.Color, reference.Color, StringComparison.OrdinalIgnoreCase)
        && part.Transparent == reference.Transparent && part.Marking == reference.Marking
        && (reference.Marking == "none" || (part.MarkingSpacingMm == reference.MarkingSpacingMm
            && (reference.MarkerColor is null || string.Equals(part.MarkerColor, reference.MarkerColor, StringComparison.OrdinalIgnoreCase))));
}
