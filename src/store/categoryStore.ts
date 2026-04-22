// categoryStore.ts — 메인/드림 분리 카테고리 스토어

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};

// ✅ 메인/드림 각각 다른 키 사용
const STORAGE_KEY_MAIN  = "cashflow_categories_main_v1";
const STORAGE_KEY_DREAM = "cashflow_categories_dream_v1";

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

export function loadCategories(scope: "main" | "dream"): Category[] {
  if (!canUse()) return [];
  const key = scope === "main" ? STORAGE_KEY_MAIN : STORAGE_KEY_DREAM;
  return parse(localStorage.getItem(key));
}

export function saveCategories(cats: Category[], scope: "main" | "dream") {
  if (!canUse()) return;
  const key = scope === "main" ? STORAGE_KEY_MAIN : STORAGE_KEY_DREAM;
  try { localStorage.setItem(key, JSON.stringify(cats)); } catch {}
}

export function createCategory(name: string): Category {
  return { id: uid(), name, createdAt: Date.now() };
}
