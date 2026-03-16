using System.Data;
using System.Globalization;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MaffContaby.Api.Data;
using MaffContaby.Api.Data.Models;
using MaffContaby.Api.Import;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options => 
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("Default");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException("ConnectionStrings:Default não configurada.");
    }
    if (IsSqliteConnectionString(connectionString))
    {
        options.UseSqlite(connectionString);
    }
    else
    {
        options.UseNpgsql(connectionString);
    }
});

builder.Services.AddScoped<ContabilidadeImporter>();

var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        if (db.Database.IsSqlite())
        {
            await db.Database.EnsureCreatedAsync();
        }
        else
        {
            try
            {
                await db.Database.MigrateAsync();
            }
            catch (InvalidOperationException ex) when (
                ex.Message.Contains("No migrations", StringComparison.OrdinalIgnoreCase)
                || ex.Message.Contains("Nenhuma migração", StringComparison.OrdinalIgnoreCase)
            )
            {
                await db.Database.EnsureCreatedAsync();
            }
        }

        await EnsureAssetDisponivelImediatamenteColumnAsync(db);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Falha ao aplicar migrations no banco.");
    }

    var defaultPeople = new[] { "mãe", "Ede", "Tarci" };
    foreach (var name in defaultPeople)
    {
        var exists = false;
        try
        {
            exists = await db.People.AnyAsync(p => p.Name == name);
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Falha ao consultar pessoas no banco.");
        }

        if (!exists)
        {
            db.People.Add(new Person { Id = Guid.NewGuid(), Name = name, CreatedAtUtc = DateTime.UtcNow });
        }
    }

    try
    {
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Falha ao salvar seed no banco.");
    }
}

var api = app.MapGroup("/api");

api.MapGet("/people", async (AppDbContext db) =>
{
    var items = await db.People
        .OrderBy(x => x.Name)
        .Select(x => new PersonDto(x.Id, x.Name))
        .ToListAsync();
    return Results.Ok(items);
});

api.MapPost("/people", async (AppDbContext db, CreatePersonRequest request) =>
{
    var person = new Person
    {
        Id = Guid.NewGuid(),
        Name = request.Name.Trim(),
        CreatedAtUtc = DateTime.UtcNow,
    };

    db.People.Add(person);
    await db.SaveChangesAsync();
    return Results.Created($"/api/people/{person.Id}", new PersonDto(person.Id, person.Name));
});

api.MapGet("/entries", async (AppDbContext db, Guid personId, string? competencia) =>
{
    DateOnly? competenciaDate = null;
    if (!string.IsNullOrWhiteSpace(competencia))
    {
        if (!DateOnly.TryParse($"{competencia}-01", out var parsed))
        {
            return Results.BadRequest("competencia deve ser YYYY-MM");
        }

        competenciaDate = parsed;
    }

    var query = db.Entries.AsNoTracking().Where(e => e.PersonId == personId);
    if (competenciaDate.HasValue)
    {
        query = query.Where(e => e.Competencia == competenciaDate.Value);
    }

    var items = await query
        .OrderByDescending(x => x.Competencia)
        .ThenBy(x => x.Grupo)
        .ThenBy(x => x.CreatedAtUtc)
        .Select(x => new EntryDto(x.Id, x.PersonId, x.Competencia, x.Grupo, x.Valor, x.Observacao, x.Data))
        .ToListAsync();

    return Results.Ok(items);
});

api.MapPost("/entries", async (AppDbContext db, CreateEntryRequest request) =>
{
    var entry = new Entry
    {
        Id = Guid.NewGuid(),
        PersonId = request.PersonId,
        Competencia = request.Competencia,
        Grupo = request.Grupo.Trim(),
        Valor = request.Valor,
        Observacao = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim(),
        Data = request.Data,
        CreatedAtUtc = DateTime.UtcNow,
    };

    db.Entries.Add(entry);
    await db.SaveChangesAsync();
    return Results.Created($"/api/entries/{entry.Id}", new EntryDto(entry.Id, entry.PersonId, entry.Competencia, entry.Grupo, entry.Valor, entry.Observacao, entry.Data));
});

api.MapPut("/entries/{id:guid}", async (AppDbContext db, Guid id, UpdateEntryRequest request) =>
{
    var entry = await db.Entries.FirstOrDefaultAsync(x => x.Id == id);
    if (entry is null) return Results.NotFound();

    entry.Competencia = request.Competencia;
    entry.Grupo = request.Grupo.Trim();
    entry.Valor = request.Valor;
    entry.Observacao = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim();
    entry.Data = request.Data;

    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/entries/{id:guid}", async (AppDbContext db, Guid id) =>
{
    var entry = await db.Entries.FirstOrDefaultAsync(x => x.Id == id);
    if (entry is null) return Results.NotFound();

    db.Entries.Remove(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapGet("/assets", async (AppDbContext db) =>
{
    var items = await db.Assets
        .OrderBy(x => x.Name)
        .Select(x => new AssetDto(x.Id, x.Name, x.Saldo, x.DisponivelImediatamente, x.AsOfDate, x.Observacao))
        .ToListAsync();
    return Results.Ok(items);
});

api.MapPost("/assets", async (AppDbContext db, CreateAssetRequest request) =>
{
    var asset = new Asset
    {
        Id = Guid.NewGuid(),
        Name = request.Name.Trim(),
        Saldo = request.Saldo,
        DisponivelImediatamente = request.DisponivelImediatamente ?? true,
        AsOfDate = request.AsOfDate,
        Observacao = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim(),
        CreatedAtUtc = DateTime.UtcNow,
    };

    db.Assets.Add(asset);
    await db.SaveChangesAsync();
    return Results.Created($"/api/assets/{asset.Id}", new AssetDto(asset.Id, asset.Name, asset.Saldo, asset.DisponivelImediatamente, asset.AsOfDate, asset.Observacao));
});

api.MapPut("/assets/{id:guid}", async (AppDbContext db, Guid id, UpdateAssetRequest request) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
    if (asset is null) return Results.NotFound();

    asset.Name = request.Name.Trim();
    asset.Saldo = request.Saldo;
    if (request.DisponivelImediatamente.HasValue)
    {
        asset.DisponivelImediatamente = request.DisponivelImediatamente.Value;
    }
    asset.AsOfDate = request.AsOfDate;
    asset.Observacao = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim();

    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/assets/{id:guid}", async (AppDbContext db, Guid id) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
    if (asset is null) return Results.NotFound();

    db.Assets.Remove(asset);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapPost("/import/contabilidade", async (
    HttpRequest request,
    AppDbContext db,
    ContabilidadeImporter importer,
    IWebHostEnvironment env,
    bool replaceAll = true,
    CancellationToken cancellationToken = default
) =>
{
    Stream? stream = null;

    if (request.HasFormContentType)
    {
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is not null)
        {
            stream = file.OpenReadStream();
        }
    }

    if (stream is null)
    {
        var defaultPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "Contabilidade.xlsx"));
        if (!File.Exists(defaultPath))
        {
            return Results.BadRequest($"Arquivo não encontrado: {defaultPath}");
        }

        stream = File.OpenRead(defaultPath);
    }

    await using (stream)
    {
        var result = await importer.ImportAsync(db, stream, replaceAll, cancellationToken);
        return Results.Ok(result);
    }
});

api.MapGet("/export/contabilidade", async (AppDbContext db) =>
{
    static string SanitizeSheetName(string name)
    {
        var sanitized = new string(name.Where(c => !"[]:*?/\\'".Contains(c)).ToArray()).Trim();
        if (string.IsNullOrWhiteSpace(sanitized)) sanitized = "Planilha";
        if (sanitized.Length > 31) sanitized = sanitized[..31];
        return sanitized;
    }

    static bool TryParseCompetencia(string text, out DateOnly competencia)
    {
        competencia = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var monthMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
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

        var value = text.Trim();
        var parts = value.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;

        var monthText = parts[0].Trim().TrimEnd('.');
        if (!monthMap.TryGetValue(monthText, out var month)) return false;

        if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var year)) return false;
        if (year < 100) year += 2000;

        competencia = new DateOnly(year, month, 1);
        return true;
    }

    static bool TryReadCompetencia(IXLCell cell, out DateOnly competencia)
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

    static string BuildEntryKey(DateOnly competencia, string grupo)
    {
        return $"{competencia:yyyy-MM}|{grupo.Trim().ToLowerInvariant()}";
    }

    var people = await db.People.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
    var entries = await db.Entries.AsNoTracking().OrderBy(x => x.Competencia).ThenBy(x => x.Grupo).ToListAsync();
    var assets = await db.Assets.AsNoTracking().OrderBy(x => x.Name).ToListAsync();

    var templatePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Contabilidade.xlsx"));
    using var workbook = File.Exists(templatePath) ? new XLWorkbook(templatePath) : new XLWorkbook();

    IXLWorksheet? templatePersonSheet = null;
    foreach (var ws in workbook.Worksheets)
    {
        if (string.Equals(ws.Name, "Finanças", StringComparison.OrdinalIgnoreCase)) continue;
        templatePersonSheet = ws;
        break;
    }

    foreach (var person in people)
    {
        var sheetName = SanitizeSheetName(person.Name);
        var ws = workbook.Worksheets.FirstOrDefault(x => string.Equals(x.Name, sheetName, StringComparison.OrdinalIgnoreCase));
        if (ws is null)
        {
            if (templatePersonSheet is not null)
            {
                ws = templatePersonSheet.CopyTo(sheetName);
            }
            else
            {
                ws = workbook.Worksheets.Add(sheetName);
            }
        }

        var lastRow = ws.LastRowUsed(XLCellsUsedOptions.AllContents)?.RowNumber() ?? 0;
        if (lastRow == 0) lastRow = 1;

        var hasRowCompetencia = false;
        for (var rowNumber = 1; rowNumber <= lastRow; rowNumber++)
        {
            var cell = ws.Row(rowNumber).Cell(1);
            if (!TryReadCompetencia(cell, out _)) continue;
            hasRowCompetencia = true;
            break;
        }

        var personEntries = entries.Where(x => x.PersonId == person.Id).ToList();
        var values = new Dictionary<string, decimal>(StringComparer.Ordinal);
        foreach (var e in personEntries)
        {
            var key = BuildEntryKey(e.Competencia, e.Grupo);
            if (values.TryGetValue(key, out var existing))
            {
                values[key] = existing + e.Valor;
            }
            else
            {
                values[key] = e.Valor;
            }
        }

        if (hasRowCompetencia)
        {
            DateOnly? current = null;
            for (var rowNumber = 1; rowNumber <= lastRow; rowNumber++)
            {
                var row = ws.Row(rowNumber);
                var labelCell = row.Cell(1);

                if (TryReadCompetencia(labelCell, out var parsedCompetencia))
                {
                    current = parsedCompetencia;
                    continue;
                }

                if (!current.HasValue) continue;
                var label = labelCell.GetFormattedString().Trim();
                if (string.IsNullOrWhiteSpace(label)) continue;
                if (string.Equals(label, "Total", StringComparison.OrdinalIgnoreCase)) continue;

                var sum = 0m;
                if (values.TryGetValue(BuildEntryKey(current.Value, label), out var v))
                {
                    sum = v;
                }

                var lastCol = row.LastCellUsed(XLCellsUsedOptions.AllContents)?.Address.ColumnNumber ?? 0;
                if (lastCol < 2) lastCol = 2;
                for (var colNumber = 2; colNumber <= lastCol; colNumber++)
                {
                    row.Cell(colNumber).Clear(XLClearOptions.Contents);
                }

                if (sum != 0m)
                {
                    row.Cell(2).Value = sum;
                }
            }
        }
        else
        {
            var headerRow = ws.Row(1);
            var lastCol = headerRow.LastCellUsed(XLCellsUsedOptions.AllContents)?.Address.ColumnNumber ?? 0;
            if (lastCol < 2) lastCol = 2;

            var colCompetencias = new Dictionary<int, DateOnly>();
            for (var colNumber = 2; colNumber <= lastCol; colNumber++)
            {
                var header = headerRow.Cell(colNumber).GetFormattedString().Trim();
                if (!TryParseCompetencia(header, out var comp)) continue;
                colCompetencias[colNumber] = comp;
            }

            var neededCompetencias = personEntries.Select(e => e.Competencia).Distinct().OrderBy(x => x).ToList();
            foreach (var comp in neededCompetencias)
            {
                if (colCompetencias.Values.Contains(comp)) continue;
                ws.Column(lastCol).InsertColumnsAfter(1);
                var newCol = lastCol + 1;
                ws.Column(newCol).Width = ws.Column(lastCol).Width;
                ws.Range(1, lastCol, lastRow, lastCol).CopyTo(ws.Range(1, newCol, lastRow, newCol));

                var ptBr = CultureInfo.GetCultureInfo("pt-BR");
                var month = ptBr.DateTimeFormat.GetAbbreviatedMonthName(comp.Month).ToLowerInvariant().TrimEnd('.');
                ws.Cell(1, newCol).Value = $"{month}/{comp:yy}";
                colCompetencias[newCol] = comp;
                lastCol = newCol;
            }

            var lastDataRow = ws.LastRowUsed(XLCellsUsedOptions.AllContents)?.RowNumber() ?? 1;
            for (var rowNumber = 2; rowNumber <= lastDataRow; rowNumber++)
            {
                var row = ws.Row(rowNumber);
                var label = row.Cell(1).GetFormattedString().Trim();
                if (string.IsNullOrWhiteSpace(label)) continue;
                if (string.Equals(label, "Total", StringComparison.OrdinalIgnoreCase)) continue;

                foreach (var kvp in colCompetencias)
                {
                    row.Cell(kvp.Key).Clear(XLClearOptions.Contents);
                    if (values.TryGetValue(BuildEntryKey(kvp.Value, label), out var v) && v != 0m)
                    {
                        row.Cell(kvp.Key).Value = v;
                    }
                }
            }
        }
    }

    var finSheet = workbook.Worksheets.FirstOrDefault(x => string.Equals(x.Name, "Finanças", StringComparison.OrdinalIgnoreCase))
                   ?? workbook.Worksheets.Add("Finanças");
    var finLastRow = finSheet.LastRowUsed(XLCellsUsedOptions.AllContents)?.RowNumber() ?? 0;
    if (finLastRow == 0) finLastRow = 1;

    var finRowsByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    var somasRow = 0;
    for (var rowNumber = 1; rowNumber <= finLastRow; rowNumber++)
    {
        var name = finSheet.Row(rowNumber).Cell(1).GetString().Trim();
        if (string.IsNullOrWhiteSpace(name)) continue;
        if (string.Equals(name, "SOMAS:", StringComparison.OrdinalIgnoreCase))
        {
            somasRow = rowNumber;
            break;
        }
        if (string.Equals(name, "Total", StringComparison.OrdinalIgnoreCase)) continue;
        finRowsByName[name] = rowNumber;
    }

    var insertRowBefore = somasRow > 0 ? somasRow : finLastRow + 1;
    foreach (var asset in assets)
    {
        if (!finRowsByName.TryGetValue(asset.Name, out var rowNumber))
        {
            finSheet.Row(insertRowBefore).InsertRowsAbove(1);
            var newRow = insertRowBefore;
            if (newRow > 1) finSheet.Row(newRow - 1).CopyTo(finSheet.Row(newRow));
            finSheet.Row(newRow).Cell(1).Value = asset.Name;
            finRowsByName[asset.Name] = newRow;
            insertRowBefore++;
        }
    }

    foreach (var kvp in finRowsByName)
    {
        var row = finSheet.Row(kvp.Value);
        row.Cell(2).Clear(XLClearOptions.Contents);
    }

    foreach (var asset in assets)
    {
        var row = finSheet.Row(finRowsByName[asset.Name]);
        row.Cell(2).Value = asset.Saldo;
        if (!row.Cell(3).IsEmpty()) row.Cell(3).Value = asset.DisponivelImediatamente;
        if (!row.Cell(4).IsEmpty()) row.Cell(4).Value = asset.AsOfDate?.ToDateTime(new TimeOnly(0, 0));
        if (!row.Cell(5).IsEmpty()) row.Cell(5).Value = asset.Observacao;
    }

    await using var ms = new MemoryStream();
    workbook.SaveAs(ms);
    var bytes = ms.ToArray();

    var fileName = $"Contabilidade-export-{DateTime.Now:yyyyMMdd-HHmm}.xlsx";
    return Results.File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
});

app.Run();

static bool IsSqliteConnectionString(string connectionString)
{
    return connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase)
           || connectionString.Contains(".db", StringComparison.OrdinalIgnoreCase)
           || connectionString.Contains(":memory:", StringComparison.OrdinalIgnoreCase);
}

static async Task EnsureAssetDisponivelImediatamenteColumnAsync(AppDbContext db)
{
    if (db.Database.IsSqlite())
    {
        await using var conn = db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open)
        {
            await conn.OpenAsync();
        }

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "PRAGMA table_info('Assets');";

        var hasColumn = false;
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            var nameIndex = reader.GetOrdinal("name");
            while (await reader.ReadAsync())
            {
                var name = reader.GetString(nameIndex);
                if (string.Equals(name, "DisponivelImediatamente", StringComparison.OrdinalIgnoreCase))
                {
                    hasColumn = true;
                    break;
                }
            }
        }

        if (!hasColumn)
        {
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Assets ADD COLUMN DisponivelImediatamente INTEGER NOT NULL DEFAULT 1;");
        }
    }
    else
    {
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Assets\" ADD COLUMN IF NOT EXISTS \"DisponivelImediatamente\" boolean NOT NULL DEFAULT true;");
    }
}

record PersonDto(Guid Id, string Name);

record CreatePersonRequest(string Name);

record EntryDto(
    Guid Id,
    Guid PersonId,
    DateOnly Competencia,
    string Grupo,
    decimal Valor,
    string? Observacao,
    DateOnly? Data
);

record CreateEntryRequest(Guid PersonId, DateOnly Competencia, string Grupo, decimal Valor, string? Observacao, DateOnly? Data);

record UpdateEntryRequest(DateOnly Competencia, string Grupo, decimal Valor, string? Observacao, DateOnly? Data);

record AssetDto(Guid Id, string Name, decimal Saldo, bool DisponivelImediatamente, DateOnly? AsOfDate, string? Observacao);

record CreateAssetRequest(string Name, decimal Saldo, bool? DisponivelImediatamente, DateOnly? AsOfDate, string? Observacao);

record UpdateAssetRequest(string Name, decimal Saldo, bool? DisponivelImediatamente, DateOnly? AsOfDate, string? Observacao);
