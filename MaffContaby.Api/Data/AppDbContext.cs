using Microsoft.EntityFrameworkCore;
using MaffContaby.Api.Data.Models;

namespace MaffContaby.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Person> People => Set<Person>();
    public DbSet<Entry> Entries => Set<Entry>();
    public DbSet<Asset> Assets => Set<Asset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Person>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(80).IsRequired();
            b.Property(x => x.CreatedAtUtc).IsRequired();
            b.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<Entry>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Competencia).IsRequired();
            b.Property(x => x.Grupo).HasMaxLength(80).IsRequired();
            b.Property(x => x.Observacao).HasMaxLength(250);
            b.Property(x => x.Valor).HasPrecision(14, 2).IsRequired();
            b.Property(x => x.CreatedAtUtc).IsRequired();

            b.HasOne(x => x.Person)
                .WithMany()
                .HasForeignKey(x => x.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasIndex(x => new { x.PersonId, x.Competencia });
        });

        modelBuilder.Entity<Asset>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(120).IsRequired();
            b.Property(x => x.Saldo).HasPrecision(18, 2).IsRequired();
            b.Property(x => x.DisponivelImediatamente).HasDefaultValue(true).IsRequired();
            b.Property(x => x.Observacao).HasMaxLength(250);
            b.Property(x => x.AsOfDate);
            b.Property(x => x.CreatedAtUtc).IsRequired();
            b.HasIndex(x => x.Name).IsUnique();
        });
    }
}

