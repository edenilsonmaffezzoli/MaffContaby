import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { downloadRelatorioDetalhado, downloadRelatorioExecutivo } from '@/services/entries-service';
import { getPeople } from '@/services/people-service';
import { formatCompetencia } from '@/utils/format';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useMemo, useState } from 'react';

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function RelatoriosPage() {
  const httpClient = useHttpClient();

  const [personId, setPersonId] = useState<string>('');
  const [competenciaFrom, setCompetenciaFrom] = useState(() => formatCompetencia(addMonths(new Date(), -5)));
  const [competenciaTo, setCompetenciaTo] = useState(() => formatCompetencia(new Date()));

  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: () => getPeople(httpClient) });

  const isPeriodValid = useMemo(() => {
    if (!competenciaFrom || !competenciaTo) return true;
    return competenciaFrom <= competenciaTo;
  }, [competenciaFrom, competenciaTo]);

  const reportMutation = useMutation({
    mutationFn: async (kind: 'executivo' | 'detalhado') => {
      if (!isPeriodValid) throw new Error('Período inválido.');
      const params = {
        personId: personId || undefined,
        competenciaFrom: competenciaFrom || undefined,
        competenciaTo: competenciaTo || undefined,
        competencia: competenciaTo || undefined,
      };
      const blob =
        kind === 'executivo'
          ? await downloadRelatorioExecutivo(httpClient, params)
          : await downloadRelatorioDetalhado(httpClient, params);
      const date = new Date().toISOString().slice(0, 10);
      return { blob, fileName: `Relatorio-${kind}-${date}.pdf` };
    },
    onSuccess: ({ blob, fileName }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const people = peopleQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Relatórios" subtitle="Geração de PDFs com filtros por competência e pessoa" />

      <Card>
        <CardHeader title="Filtros" />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <Select
              label="Pessoa"
              value={personId}
              onChange={e => setPersonId(e.target.value)}
              disabled={peopleQuery.isLoading}
            >
              <option value="">Todas as pessoas</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Input
              label="Competência inicial"
              type="month"
              value={competenciaFrom}
              onChange={e => setCompetenciaFrom(e.target.value)}
              error={!isPeriodValid ? 'Deve ser ≤ competência final' : undefined}
            />
          </div>
          <div className="min-w-[160px]">
            <Input
              label="Competência final"
              type="month"
              value={competenciaTo}
              onChange={e => setCompetenciaTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Gerar PDF"
          description="Escolha o tipo de relatório para download"
        />
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            loading={reportMutation.isPending && reportMutation.variables === 'executivo'}
            disabled={reportMutation.isPending || !isPeriodValid}
            onClick={() => reportMutation.mutate('executivo')}
          >
            <FileText size={16} />
            Relatório Executivo
          </Button>
          <Button
            variant="default"
            loading={reportMutation.isPending && reportMutation.variables === 'detalhado'}
            disabled={reportMutation.isPending || !isPeriodValid}
            onClick={() => reportMutation.mutate('detalhado')}
          >
            <FileText size={16} />
            Relatório Detalhado
          </Button>
        </div>

        {reportMutation.isError ? (
          <StatusMessage type="error">
            Falha ao gerar o relatório. Tente novamente.
          </StatusMessage>
        ) : null}
      </Card>
    </div>
  );
}
