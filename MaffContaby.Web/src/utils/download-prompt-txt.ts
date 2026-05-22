function promptFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `casos-teste-prompt-${stamp}.txt`;
}

export function downloadPromptTxt(prompt: string, filename?: string) {
  const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? promptFilename();
  a.click();
  URL.revokeObjectURL(url);
}
