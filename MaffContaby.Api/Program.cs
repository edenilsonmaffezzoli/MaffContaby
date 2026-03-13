using System.Data;
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

    var people = await db.People.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
    var entries = await db.Entries.AsNoTracking().OrderBy(x => x.Competencia).ThenBy(x => x.Grupo).ToListAsync();
    var assets = await db.Assets.AsNoTracking().OrderBy(x => x.Name).ToListAsync();

    using var workbook = new XLWorkbook();

    foreach (var person in people)
    {
        var ws = workbook.Worksheets.Add(SanitizeSheetName(person.Name));

        ws.Cell(1, 1).Value = "Competência";
        ws.Cell(1, 2).Value = "Grupo";
        ws.Cell(1, 3).Value = "Valor";
        ws.Cell(1, 4).Value = "Observação";
        ws.Cell(1, 5).Value = "Data";

        var row = 2;
        foreach (var e in entries.Where(x => x.PersonId == person.Id))
        {
            ws.Cell(row, 1).Value = e.Competencia.ToDateTime(new TimeOnly(0, 0));
            ws.Cell(row, 2).Value = e.Grupo;
            ws.Cell(row, 3).Value = e.Valor;
            ws.Cell(row, 4).Value = e.Observacao;
            ws.Cell(row, 5).Value = e.Data?.ToDateTime(new TimeOnly(0, 0));
            row++;
        }

        var lastRow = Math.Max(2, row - 1);
        var range = ws.Range(1, 1, lastRow, 5);
        range.CreateTable();
        ws.SheetView.FreezeRows(1);

        ws.Column(1).Style.DateFormat.Format = "mm/yyyy";
        ws.Column(3).Style.NumberFormat.Format = "\"R$\" #,##0.00";
        ws.Column(5).Style.DateFormat.Format = "dd/mm/yyyy";

        ws.Columns().AdjustToContents();
    }

    var finWs = workbook.Worksheets.Add("Finanças");
    finWs.Cell(1, 1).Value = "Item";
    finWs.Cell(1, 2).Value = "Saldo";
    finWs.Cell(1, 3).Value = "Disponível imediatamente";
    finWs.Cell(1, 4).Value = "Data base";
    finWs.Cell(1, 5).Value = "Observação";

    var finRow = 2;
    foreach (var a in assets)
    {
        finWs.Cell(finRow, 1).Value = a.Name;
        finWs.Cell(finRow, 2).Value = a.Saldo;
        finWs.Cell(finRow, 3).Value = a.DisponivelImediatamente;
        finWs.Cell(finRow, 4).Value = a.AsOfDate?.ToDateTime(new TimeOnly(0, 0));
        finWs.Cell(finRow, 5).Value = a.Observacao;
        finRow++;
    }

    var finLast = Math.Max(2, finRow - 1);
    finWs.Range(1, 1, finLast, 5).CreateTable();
    finWs.SheetView.FreezeRows(1);
    finWs.Column(2).Style.NumberFormat.Format = "\"R$\" #,##0.00";
    finWs.Column(4).Style.DateFormat.Format = "dd/mm/yyyy";

    var totalsRow = finLast + 2;
    finWs.Cell(totalsRow, 1).Value = "Totais";
    finWs.Cell(totalsRow, 2).FormulaA1 = $"SUM(B2:B{finLast})";
    finWs.Cell(totalsRow, 3).Value = "Total disponível imediatamente";
    finWs.Cell(totalsRow, 4).FormulaA1 = $"SUMIF(C2:C{finLast},TRUE,B2:B{finLast})";
    finWs.Range(totalsRow, 1, totalsRow, 4).Style.Font.SetBold();
    finWs.Cell(totalsRow, 2).Style.NumberFormat.Format = "\"R$\" #,##0.00";
    finWs.Cell(totalsRow, 4).Style.NumberFormat.Format = "\"R$\" #,##0.00";
    finWs.Columns().AdjustToContents();

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
