const DB_KEY = 'db';

export type StoredPrompt = {
  id: string;
  description: string;
  text: string;
};

export async function getPromptById(kv: KVNamespace, id: string): Promise<StoredPrompt | null> {
  const stored = (await kv.get(DB_KEY, { type: 'json' })) as { prompts?: StoredPrompt[] } | null;
  if (!stored || !Array.isArray(stored.prompts)) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  return stored.prompts.find(p => p.id === trimmed) ?? null;
}
