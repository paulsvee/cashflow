// categoryStore.ts — 메인/드림 분리 카테고리 스토어

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};

// Main category fallback for localStorage-only environments.
const STORAGE_KEY_MAIN  = "cashflow_categories_main_v1";

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function canUse() {
  return typeof window !== "undefined";
}

function parse(raw: string | null): Category[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((c: any) => ({
      id:        typeof c.id        === "string" ? c.id        : uid(),
      name:      typeof c.name      === "string" ? c.name      : "카테고리",
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    }));
  } catch { return []; }
}

export function loadCategories(scope: "main"): Category[] {
  if (!canUse()) return [];
  const key = STORAGE_KEY_MAIN;
  return parse(localStorage.getItem(key));
}

export function saveCategories(cats: Category[], scope: "main") {
  if (!canUse()) return;
  const key = STORAGE_KEY_MAIN;
  try { localStorage.setItem(key, JSON.stringify(cats)); } catch {}
}

export function createCategory(name: string): Category {
  return { id: uid(), name, createdAt: Date.now() };
}
