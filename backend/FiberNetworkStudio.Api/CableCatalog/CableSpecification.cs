using System.Text.RegularExpressions;

namespace FiberNetworkStudio.Api.CableCatalog;

public sealed record CableFiber(string Name, string Color, string Marking = "none", string? MarkerColor = null,
    int? MarkingSpacingMm = null, bool Transparent = false) : ICableColor;
public sealed record CableTube(string Name, string Color, CableFiber[] Fibers, string Marking = "none", string? MarkerColor = null,
    int? MarkingSpacingMm = null, bool Transparent = false) : ICableColor;
public sealed record CableInput(string? Name, string? Manufacturer, string? Notes, CableTube[]? Tubes, int Version = 0,
    string? FiberColorCode = "custom", string? TubeColorCode = "custom", string? SourceUrl = "",
    double? Attenuation1310DbPerKm = null, double? Attenuation1550DbPerKm = null,
    double? OuterDiameterMm = null, double? MinimumDuctInnerDiameterMm = null);
public sealed record CableSpecification(Guid Id, string Name, string Manufacturer, string Notes,
    CableTube[] Tubes, bool IsPreset, int Version, string FiberColorCode = "custom", string TubeColorCode = "custom", string SourceUrl = "",
    double? Attenuation1310DbPerKm = null, double? Attenuation1550DbPerKm = null,
    double? OuterDiameterMm = null, double? MinimumDuctInnerDiameterMm = null);

public static partial class CableRules
{
    public static Dictionary<string, string[]> Validate(CableInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (!ValidAttenuation(input.Attenuation1310DbPerKm)) errors["attenuation1310DbPerKm"] = ["Útlum pro 1310 nm musí být nezáporné konečné číslo nebo nevyplněný."];
        if (!ValidAttenuation(input.Attenuation1550DbPerKm)) errors["attenuation1550DbPerKm"] = ["Útlum pro 1550 nm musí být nezáporné konečné číslo nebo nevyplněný."];
        if (!ValidDiameter(input.OuterDiameterMm)) errors["outerDiameterMm"] = ["Vnější průměr kabelu musí být kladné konečné číslo v mm nebo nevyplněný."];
        if (!ValidDiameter(input.MinimumDuctInnerDiameterMm)
            || input.MinimumDuctInnerDiameterMm is not null && input.OuterDiameterMm is not null
            && input.MinimumDuctInnerDiameterMm < input.OuterDiameterMm)
            errors["minimumDuctInnerDiameterMm"] = ["Minimální vnitřní průměr trubičky musí být kladný a nejméně tak velký jako průměr kabelu."];
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
            errors["name"] = ["Název musí mít 1 až 100 znaků."];
        if (input.Manufacturer?.Length > 100) errors["manufacturer"] = ["Výrobce může mít nejvýše 100 znaků."];
        if (input.Notes?.Length > 2000) errors["notes"] = ["Poznámka může mít nejvýše 2000 znaků."];
        if (!string.IsNullOrWhiteSpace(input.SourceUrl) && (input.SourceUrl.Length > 2000
            || !Uri.TryCreate(input.SourceUrl, UriKind.Absolute, out var source) || source.Scheme is not ("http" or "https")))
            errors["sourceUrl"] = ["Zdroj specifikace musí být odkaz HTTP nebo HTTPS."];
        if (input.Tubes is null || input.Tubes.Length is < 1 or > 24)
            errors["tubes"] = ["Kabel musí obsahovat 1 až 24 tub."];
        else if (input.Tubes.Any(tube => tube is null || !ValidName(tube.Name) || !ValidMark(tube)
            || tube.Fibers is null || tube.Fibers.Length is < 1 or > 24
            || tube.Fibers.Any(fiber => fiber is null || !ValidName(fiber.Name) || !ValidMark(fiber))))
            errors["tubes"] = ["Každá tuba musí mít 1 až 24 vláken. Zkontrolujte názvy (nejvýše 40 znaků), barvy #RRGGBB a značení (rozestup 1 až 10000 mm nebo neurčený)."];
        else
        {
            if (!ColorCodes.Matches(input.TubeColorCode, input.Tubes, false))
                errors["tubeColorCode"] = ["Značení tub neodpovídá vybranému profilu. Zvolte vlastní značení nebo profil použijte znovu."];
            if (input.Tubes.Any(tube => !ColorCodes.Matches(input.FiberColorCode, tube.Fibers, true)))
                errors["fiberColorCode"] = ["Značení vláken neodpovídá vybranému profilu. Zvolte vlastní značení nebo profil použijte znovu."];
        }
        return errors;
    }

    private static bool ValidAttenuation(double? value) => value is null || (double.IsFinite(value.Value) && value.Value >= 0);
    private static bool ValidDiameter(double? value) => value is null || (double.IsFinite(value.Value) && value.Value > 0 && value.Value <= 1000);
    private static bool ValidName(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 40;
    private static bool ValidMark(ICableColor part) => ValidColor(part.Color) && part.Marking is "none" or "mark"
        && (part.MarkerColor is null || ValidColor(part.MarkerColor))
        && (part.MarkingSpacingMm is null || part.MarkingSpacingMm is > 0 and <= 10000);
    private static bool ValidColor(string? value) => value is not null && HexColor().IsMatch(value);
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();

    public static CableSpecification Create(Guid id, CableInput input, int version) => new(id,
        input.Name!.Trim(), input.Manufacturer?.Trim() ?? "", input.Notes?.Trim() ?? "",
        input.Tubes!.Select(t => t with { Name = t.Name.Trim(),
            Fibers = t.Fibers.Select(f => f with { Name = f.Name.Trim() }).ToArray() }).ToArray(), false, version,
        input.FiberColorCode ?? "custom", input.TubeColorCode ?? "custom", input.SourceUrl?.Trim() ?? "",
        input.Attenuation1310DbPerKm, input.Attenuation1550DbPerKm,
        input.OuterDiameterMm, input.MinimumDuctInnerDiameterMm);
}

public static class CablePresets
{
    private static readonly ColorProfile Profile = ColorCodes.Data.Profiles.Single(p => p.Id == "tia-598-12");

    public static IReadOnlyList<CableSpecification> All { get; } = new[] { 1, 2, 4, 8 }.Select((count, index) =>
        new CableSpecification(Guid.Parse($"10000000-0000-4000-8000-{index + 1:000000000000}"),
            $"Optický kabel {count * 12} vláken", "", "Obecná šablona, nikoliv konkrétní výrobek. Značení určují profily níže; provedení ověřte podle technického listu kabelu.",
            Enumerable.Range(0, count).Select(t => new CableTube($"Tuba {t + 1}", Profile.Tubes[t].Color,
                Enumerable.Range(0, 12).Select(f => new CableFiber($"Vlákno {f + 1}", Profile.Fibers[f].Color)).ToArray())).ToArray(),
            true, 1, Profile.Id, Profile.Id)).ToArray();
}
