namespace MaffContaby.Api.Data.Models;

public sealed class Entry
{
    public Guid Id { get; set; }

    public Guid PersonId { get; set; }
    public Person? Person { get; set; }

    public DateOnly Competencia { get; set; }
    public required string Grupo { get; set; }
    public decimal Valor { get; set; }
    public string? Observacao { get; set; }
    public DateOnly? Data { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}

