using System.Text.RegularExpressions;

namespace FiberNetworkStudio.Api.CableCatalog;

public sealed record CableFiber(string Name, string Color);
public sealed record CableTube(string Name, string Color, CableFiber[] Fibers);
public sealed record CableInput(string? Name, string? Manufacturer, string? Notes, CableTube[]? Tubes, int Version = 0);
public sealed record CableSpecification(Guid Id, string Name, string Manufacturer, string Notes,
    CableTube[] Tubes, bool IsPreset, int Version);

public static partial class CableRules
{
    public static Dictionary<string, string[]> Validate(CableInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
            errors["name"] = ["Název musí mít 1 až 100 znaků."];
        if (input.Manufacturer?.Length > 100) errors["manufacturer"] = ["Výrobce může mít nejvýše 100 znaků."];
        if (input.Notes?.Length > 2000) errors["notes"] = ["Poznámka může mít nejvýše 2000 znaků."];
        if (input.Tubes is null || input.Tubes.Length is < 1 or > 24)
            errors["tubes"] = ["Kabel musí obsahovat 1 až 24 tub."];
        else if (input.Tubes.Any(tube => tube is null || !ValidName(tube.Name) || !ValidColor(tube.Color)
            || tube.Fibers is null || tube.Fibers.Length is < 1 or > 24
            || tube.Fibers.Any(fiber => fiber is null || !ValidName(fiber.Name) || !ValidColor(fiber.Color))))
            errors["tubes"] = ["Každá tuba musí mít 1 až 24 vláken. Tuby i vlákna musí mít název (nejvýše 40 znaků) a barvu ve formátu #RRGGBB."];
        return errors;
    }

    private static bool ValidName(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 40;
    private static bool ValidColor(string? value) => value is not null && HexColor().IsMatch(value);
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();

    public static CableSpecification Create(Guid id, CableInput input, int version) => new(id,
        input.Name!.Trim(), input.Manufacturer?.Trim() ?? "", input.Notes?.Trim() ?? "",
        input.Tubes!.Select(t => new CableTube(t.Name.Trim(), t.Color,
            t.Fibers.Select(f => new CableFiber(f.Name.Trim(), f.Color)).ToArray())).ToArray(), false, version);
}

public static class CablePresets
{
    // Illustrative palette, not a manufacturer specification or a claim of standards compliance.
    private static readonly string[] Colors = ["#2563eb", "#f97316", "#16a34a", "#92400e", "#64748b", "#ffffff",
        "#dc2626", "#171717", "#eab308", "#9333ea", "#ec4899", "#06b6d4"];

    public static IReadOnlyList<CableSpecification> All { get; } = new[] { 1, 2, 4, 8 }.Select((count, index) =>
        new CableSpecification(Guid.Parse($"10000000-0000-4000-8000-{index + 1:000000000000}"),
            $"Optický kabel {count * 12} vláken", "", "Obecná šablona. Barvy a strukturu ověřte podle dokumentace konkrétního kabelu.",
            Enumerable.Range(0, count).Select(t => new CableTube($"Tuba {t + 1}", Colors[t],
                Enumerable.Range(0, 12).Select(f => new CableFiber($"Vlákno {f + 1}", Colors[f])).ToArray())).ToArray(),
            true, 1)).ToArray();
}
