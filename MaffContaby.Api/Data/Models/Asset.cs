namespace MaffContaby.Api.Data.Models;

public sealed class Asset
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public decimal Saldo { get; set; }
    public bool DisponivelImediatamente { get; set; }
    public DateOnly? AsOfDate { get; set; }
    public string? Observacao { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
