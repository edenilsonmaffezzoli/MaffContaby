namespace MaffContaby.Api.Data.Models;

public sealed class Person
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

