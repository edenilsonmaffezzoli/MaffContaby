import type { SourceFileInput } from '@/types/casos-teste';

const MAX_CHARS = 150_000;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '.git', 'bin', 'obj', '.wrangler', 'coverage', 'build']);
const ALLOWED_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cs', '.py', '.java', '.go', '.json', '.md', '.vue', '.html', '.css', '.scss', '.sql',
]);

function hasAllowedExt(path: string) {
  const lower = path.toLowerCase();
  for (const ext of ALLOWED_EXT) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function shouldSkipPath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts.some(p => SKIP_DIRS.has(p));
}

async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

/** Lê arquivos de um input webkitdirectory ou FileSystemFileHandle[]. */
export async function readSourceFromFileList(
  fileList: FileList | File[],
  rootLabel: string,
): Promise<{ files: SourceFileInput[]; truncated: boolean; sourcePathLabel: string }> {
  const files = Array.from(fileList).filter(f => !shouldSkipPath(f.webkitRelativePath || f.name) && hasAllowedExt(f.name));

  files.sort((a, b) => {
    const pa = a.webkitRelativePath || a.name;
    const pb = b.webkitRelativePath || b.name;
    return pa.localeCompare(pb);
  });

  const out: SourceFileInput[] = [];
  let total = 0;
  let truncated = false;

  for (const file of files) {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const remaining = MAX_CHARS - total;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    try {
      let content = await readFileAsText(file);
      if (content.length > remaining) {
        content = content.slice(0, remaining) + '\n/* … truncado … */';
        truncated = true;
      }
      out.push({ path, content });
      total += content.length;
      if (truncated) break;
    } catch {
      // ignora arquivos ilegíveis
    }
  }

  return { files: out, truncated, sourcePathLabel: rootLabel };
}

/** showDirectoryPicker (Chromium) — percorre recursivamente. */
export async function readSourceFromDirectoryPicker(): Promise<{
  files: SourceFileInput[];
  truncated: boolean;
  sourcePathLabel: string;
} | null> {
  if (!('showDirectoryPicker' in window)) return null;

  // @ts-expect-error — API File System Access
  const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'read' });
  const rootLabel = dirHandle.name;
  const out: SourceFileInput[] = [];
  let total = 0;
  let truncated = false;

  async function walk(handle: FileSystemDirectoryHandle, prefix: string) {
    if (truncated) return;
    // @ts-expect-error — values() em DirectoryHandle
    for await (const entry of handle.values()) {
      if (truncated) return;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(entry as FileSystemDirectoryHandle, rel);
      } else if (entry.kind === 'file') {
        if (shouldSkipPath(rel) || !hasAllowedExt(entry.name)) continue;
        const remaining = MAX_CHARS - total;
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        try {
          let content = await file.text();
          if (content.length > remaining) {
            content = content.slice(0, remaining) + '\n/* … truncado … */';
            truncated = true;
          }
          out.push({ path: rel.replace(/\\/g, '/'), content });
          total += content.length;
        } catch {
          // skip
        }
      }
    }
  }

  await walk(dirHandle, '');
  return { files: out, truncated, sourcePathLabel: rootLabel };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Falha ao ler imagem'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler imagem'));
    reader.readAsDataURL(file);
  });
}
