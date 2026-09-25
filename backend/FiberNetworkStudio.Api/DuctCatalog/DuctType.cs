using System.Text.RegularExpressions;

namespace FiberNetworkStudio.Api.DuctCatalog;

public sealed record DuctSlot(string? Name, string? Kind, string? Color,
    double? OuterDiameterMm, double? InnerDiameterMm);

public sealed record DuctTypeInput(string? Name, string? Kind, string? Manufacturer,
    string? Model, string? Color, double? OuterDiameterMm, double? InnerDiameterMm,
    int Rows, int Columns, DuctSlot[]? Slots, string? Notes, string? SourceUrl, int Version = 0);

public sealed record DuctType(Guid Id, string Name, string Kind, string Manufacturer,
    string Model, string Color, double? OuterDiameterMm, double? InnerDiameterMm,
    int Rows, int Columns, DuctSlot[] Slots, string Notes, string SourceUrl, bool IsPreset, int Version);

public static partial class DuctRules
{
    public static Dictionary<string, string[]> Validate(DuctTypeInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
            errors["name"] = ["Název musí mít 1 až 100 znaků."];
        if (input.Kind is not ("conduit" or "microduct" or "assembly"))
            errors["kind"] = ["Vyberte chráničku, mikrotrubičku nebo sestavu."];
        if (input.Manufacturer?.Length > 100 || input.Model?.Length > 100)
            errors["manufacturer"] = ["Výrobce a model mohou mít nejvýše 100 znaků."];
        if (input.Notes?.Length > 2000) errors["notes"] = ["Poznámka může mít nejvýše 2000 znaků."];
        if (!ValidSource(input.SourceUrl)) errors["sourceUrl"] = ["Zdroj musí být odkaz HTTP nebo HTTPS."];
        if (!ValidColor(input.Color)) errors["color"] = ["Vyberte platnou barvu."];
        if (!ValidDimensions(input.OuterDiameterMm, input.InnerDiameterMm))
            errors["outerDiameterMm"] = ["Průměry musí být kladná čísla v mm; vnitřní musí být menší než vnější."];

        if (input.Kind == "assembly")
        {
            if (input.Rows is < 1 or > 12 || input.Columns is < 1 or > 12 || input.Rows * input.Columns > 100)
                errors["rows"] = ["Sestava může mít nejvýše 100 pozic v 1 až 12 řadách a sloupcích."];
            else if (input.Slots is null || input.Slots.Length != input.Rows * input.Columns
                || input.Slots.Any(slot => slot is null || string.IsNullOrWhiteSpace(slot.Name)
                    || slot.Name.Trim().Length > 40 || slot.Kind is not ("conduit" or "microduct")
                    || !ValidColor(slot.Color) || !ValidDimensions(slot.OuterDiameterMm, slot.InnerDiameterMm)))
                errors["slots"] = ["Každá pozice potřebuje název, druh, barvu a platné rozměry nebo prázdné hodnoty."];
            if (input.OuterDiameterMm is not null || input.InnerDiameterMm is not null)
                errors["innerDiameterMm"] = ["Sestava nemá společné kruhové průměry; zadejte rozměry jednotlivých pozic."];
        }
        else if (input.Rows != 1 || input.Columns != 1 || input.Slots is not { Length: 0 })
            errors["slots"] = ["Samostatná chránička či mikrotrubička nemá další pozice."];
        return errors;
    }

    public static DuctType Create(Guid id, DuctTypeInput input, int version) => new(id,
        input.Name!.Trim(), input.Kind!, input.Manufacturer?.Trim() ?? "", input.Model?.Trim() ?? "",
        input.Color!, input.OuterDiameterMm, input.InnerDiameterMm, input.Rows, input.Columns,
        input.Slots!.Select(slot => slot with { Name = slot.Name!.Trim() }).ToArray(),
        input.Notes?.Trim() ?? "", input.SourceUrl?.Trim() ?? "", false, version);

    private static bool ValidDimensions(double? outer, double? inner) =>
        (outer is null || ValidDiameter(outer.Value)) && (inner is null || ValidDiameter(inner.Value))
        && (outer is null || inner is null || inner < outer);
    private static bool ValidDiameter(double value) => double.IsFinite(value) && value > 0 && value <= 1000;
    private static bool ValidColor(string? value) => value is not null && HexColor().IsMatch(value);
    private static bool ValidSource(string? value) => string.IsNullOrWhiteSpace(value)
        || value.Length <= 2000 && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}

public static class DuctPresets
{
    private static DuctSlot Slot(int number) => new($"Pozice {number}", "conduit", "#94a3b8", null, null);
    public static IReadOnlyList<DuctType> All { get; } = [
        new(Guid.Parse("20000000-0000-4000-8000-000000000001"), "Samostatná chránička", "conduit",
            "", "", "#64748b", null, null, 1, 1, [],
            "Obecná šablona. Rozměry a provedení doplňte podle konkrétního výrobku.", "", true, 1),
        new(Guid.Parse("20000000-0000-4000-8000-000000000002"), "Samostatná mikrotrubička", "microduct",
            "", "", "#256f9e", null, null, 1, 1, [],
            "Obecná šablona. Rozměry a provedení doplňte podle konkrétního výrobku.", "", true, 1),
        new(Guid.Parse("20000000-0000-4000-8000-000000000003"), "Rozložení 2 × 5 chrániček", "assembly",
            "", "", "#64748b", null, null, 2, 5, Enumerable.Range(1, 10).Select(Slot).ToArray(),
            "Schematické rozložení pozic podle příkladu ve školení NetStork, nikoli specifikace výrobku.", "", true, 1),
        new(Guid.Parse("20000000-0000-4000-8000-000000000004"), "Hexatronic Microduct 7/3.5 BK1", "microduct",
            "Hexatronic", "MPB30284/BK1AX", "#171717", 7, 3.5, 1, 1, [],
            "Údaje o průměru a černé barvě podle technického listu výrobce; před použitím ověřte aktuální provedení a podmínky instalace.",
            "https://www.hexatronic.com/hubfs/datasheets/28701-MPB30284BK1AX_en-uk_Hexatronic.pdf", true, 1),
    ];
}
