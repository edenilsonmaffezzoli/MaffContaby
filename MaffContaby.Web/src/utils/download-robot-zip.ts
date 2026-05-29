import type { RobotFile } from '@/types/casos-teste';
import JSZip from 'jszip';

export const ROBOT_PROJECT_DEFAULT_NAME = 'projeto-testes-robot';

export type RobotZipStats = {
  filesIncluded: number;
  outputFilename: string;
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveProjectName(systemPath?: string): string {
  if (!systemPath?.trim()) return ROBOT_PROJECT_DEFAULT_NAME;
  try {
    const host = new URL(systemPath.trim()).hostname.replace(/^www\./, '');
    const slug = slugify(host);
    return slug ? `${ROBOT_PROJECT_DEFAULT_NAME}-${slug}` : ROBOT_PROJECT_DEFAULT_NAME;
  } catch {
    return ROBOT_PROJECT_DEFAULT_NAME;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadRobotProjectZip(
  files: RobotFile[],
  systemPath?: string,
): Promise<RobotZipStats> {
  const valid = files.filter(f => f.path?.trim() && typeof f.content === 'string');
  if (valid.length === 0) {
    throw new Error('Nenhum arquivo válido para gerar o .zip.');
  }

  const projectName = deriveProjectName(systemPath);
  const zip = new JSZip();
  const root = zip.folder(projectName) ?? zip;

  for (const file of valid) {
    root.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const outputFilename = `${projectName}.zip`;
  triggerBlobDownload(blob, outputFilename);

  return { filesIncluded: valid.length, outputFilename };
}
