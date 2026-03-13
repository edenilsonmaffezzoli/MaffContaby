using System.Globalization;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MaffContaby.Api.Data;
using MaffContaby.Api.Data.Models;

namespace MaffContaby.Api.Import;

public sealed class ContabilidadeImporter
{
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    private static readonly Dictionary<string, int> MonthMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["jan"] = 1,
        ["fev"] = 2,
        ["mar"] = 3,
        ["abr"] = 4,
        ["mai"] = 5,
        ["jun"] = 6,
        ["jul"] = 7,
        ["ago"] = 8,
        ["set"] = 9,
        ["out"] = 10,
        ["nov"] = 11,
        ["dez"] = 12,
    };

    public async Task<ImportResult> ImportAsync(AppDbContext db, Stream xlsxStream, bool replaceAll, CancellationToken cancellationToken)
    {
        if (replaceAll)
        {
            db.Entries.RemoveRange(db.Entries);
            db.Assets.RemoveRange(db.Assets);
            await db.SaveChangesAsync(cancellationToken);
        }

        using var workbook = new XLWorkbook(xlsxStream);
        var entriesInserted = 0;
        var assetsInserted = 0;

        foreach (var worksheet in workbook.Worksheets)
        {
            var name = worksheet.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;

            if (string.Equals(name, "Finanças", StringComparison.OrdinalIgnoreCase))
            {
                assetsInserted += await ImportAssetsAsync(db, worksheet, cancellationToken);
                continue;
            }

            var person = await db.People.FirstOrDefaultAsync(p => p.Name == name, cancellationToken);
            if (person is null)
            {
                person = new Person { Id = Guid.NewGuid(), Name = name, CreatedAtUtc = DateTime.UtcNow };
                db.People.Add(person);
                await db.SaveChangesAsync(cancellationToken);
            }

            entriesInserted += await ImportPersonSheetAsync(db, person, worksheet, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return new ImportResult(entriesInserted, assetsInserted);
    }

    private async Task<int> ImportPersonSheetAsync(AppDbContext db, Person person, IXLWorksheet worksheet, CancellationToken cancellationToken)
    {
        var lastRow = worksheet.LastRowUsed(XLCellsUsedOptions.AllContents)?.RowNumber() ?? 0;
        if (lastRow == 0) return 0;

        var inserted = 0;

        var hasRowCompetencia = false;
        for (var rowNumber = 1; rowNumber <= lastRow; rowNumber++)
        {
            var cell = worksheet.Row(rowNumber).Cell(1);
            if (TryReadCompetencia(cell, out _))
            {
                hasRowCompetencia = true;
                break;
            }
        }

        if (hasRowCompetencia)
        {
            DateOnly? competencia = null;

            for (var rowNumber = 1; rowNumber <= lastRow; rowNumber++)
            {
                var row = worksheet.Row(rowNumber);
                var labelCell = row.Cell(1);
                var label = labelCell.GetFormattedString().Trim();

                if (TryReadCompetencia(labelCell, out var parsedCompetencia))
                {
                    competencia = parsedCompetencia;
                    continue;
                }

                if (!competencia.HasValue) continue;
                if (string.IsNullOrWhiteSpace(label)) continue;
                if (string.Equals(label, "Total", StringComparison.OrdinalIgnoreCase)) continue;

                var lastCol = row.LastCellUsed(XLCellsUsedOptions.AllContents)?.Address.ColumnNumber ?? 0;
                if (lastCol < 2) continue;

                for (var colNumber = 2; colNumber <= lastCol; colNumber++)
                {
                    var cell = row.Cell(colNumber);
                    if (!TryGetDecimal(cell, out var value)) continue;
                    if (value == 0m) continue;

                    db.Entries.Add(new Entry
                    {
                        Id = Guid.NewGuid(),
                        PersonId = person.Id,
                        Competencia = competencia.Value,
                        Grupo = label,
                        Valor = value,
                        CreatedAtUtc = DateTime.UtcNow,
                    });
                    inserted++;
                }
            }
        }
        else
        {
            var headerRow = worksheet.Row(1);
            var lastCol = headerRow.LastCellUsed(XLCellsUsedOptions.AllContents)?.Address.ColumnNumber ?? 0;
            if (lastCol < 2) return 0;

            var colCompetencias = new Dictionary<int, DateOnly>();
            for (var colNumber = 2; colNumber <= lastCol; colNumber++)
            {
                var header = headerRow.Cell(colNumber).GetFormattedString().Trim();
                if (!TryParseCompetencia(header, out var comp)) continue;
                colCompetencias[colNumber] = comp;
            }

            if (colCompetencias.Count == 0) return 0;

            for (var rowNumber = 2; rowNumber <= lastRow; rowNumber++)
            {
                var row = worksheet.Row(rowNumber);
                var label = row.Cell(1).GetFormattedString().Trim();

                if (string.IsNullOrWhiteSpace(label)) continue;
                if (string.Equals(label, "Total", StringComparison.OrdinalIgnoreCase)) continue;

                foreach (var kvp in colCompetencias)
                {
                    var cell = row.Cell(kvp.Key);
                    if (!TryGetDecimal(cell, out var value)) continue;
                    if (value == 0m) continue;

                    db.Entries.Add(new Entry
                    {
                        Id = Guid.NewGuid(),
                        PersonId = person.Id,
                        Competencia = kvp.Value,
                        Grupo = label,
                        Valor = value,
                        CreatedAtUtc = DateTime.UtcNow,
                    });
                    inserted++;
                }
            }
        }

        await Task.CompletedTask;
        return inserted;
    }

    private static bool TryReadCompetencia(IXLCell cell, out DateOnly competencia)
    {
        competencia = default;

        if (cell.IsEmpty()) return false;

        if (cell.DataType == XLDataType.DateTime)
        {
            var dt = cell.GetDateTime();
            competencia = new DateOnly(dt.Year, dt.Month, 1);
            return true;
        }

        var text = cell.GetFormattedString().Trim();
        return TryParseCompetencia(text, out competencia);
    }

    private async Task<int> ImportAssetsAsync(AppDbContext db, IXLWorksheet worksheet, CancellationToken cancellationToken)
    {
        var lastRow = worksheet.LastRowUsed()?.RowNumber() ?? 0;
        if (lastRow == 0) return 0;

        var inserted = 0;

        for (var rowNumber = 1; rowNumber <= lastRow; rowNumber++)
        {
            var row = worksheet.Row(rowNumber);
            var name = row.Cell(1).GetString().Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;

            if (string.Equals(name, "SOMAS:", StringComparison.OrdinalIgnoreCase)) break;
            if (string.Equals(name, "Total", StringComparison.OrdinalIgnoreCase)) continue;

            if (!TryGetDecimal(row.Cell(2), out var saldo)) continue;

            var existing = await db.Assets.FirstOrDefaultAsync(x => x.Name == name, cancellationToken);
            if (existing is null)
            {
                db.Assets.Add(new Asset
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    Saldo = saldo,
                    DisponivelImediatamente = true,
                    CreatedAtUtc = DateTime.UtcNow,
                });
                inserted++;
            }
            else
            {
                existing.Saldo = saldo;
            }
        }

        return inserted;
    }

    private static bool TryParseCompetencia(string text, out DateOnly competencia)
    {
        competencia = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var value = text.Trim();
        var parts = value.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;

        var monthText = parts[0].Trim().TrimEnd('.');
        if (!MonthMap.TryGetValue(monthText, out var month)) return false;

        if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var year)) return false;
        if (year < 100) year += 2000;

        competencia = new DateOnly(year, month, 1);
        return true;
    }

    private static bool TryGetDecimal(IXLCell cell, out decimal value)
    {
        value = 0m;

        if (cell.IsEmpty()) return false;

        if (cell.DataType == XLDataType.Number)
        {
            var d = cell.GetDouble();
            value = Convert.ToDecimal(d);
            return true;
        }

        var raw = cell.GetString();
        if (string.IsNullOrWhiteSpace(raw)) return false;

        raw = raw.Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (decimal.TryParse(raw, NumberStyles.Number | NumberStyles.AllowCurrencySymbol, PtBr, out value)) return true;

        raw = raw.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out value);
    }
}

public sealed record ImportResult(int EntriesInserted, int AssetsInserted);
