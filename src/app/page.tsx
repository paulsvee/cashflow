"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/components/TopNav";
import { createCategory, loadCategories, type Category } from "@/store/categoryStore";

const AVATAR_COLORS = ["#4a90d9", "#5c6bc0", "#26a69a", "#66bb6a", "#ef5350", "#ab47bc", "#ff7043", "#42a5f5"];
const STORAGE_KEY = "cashflow_main_v1";
const UNDO_KEY = "cashflow_undo_v1";
const MAX_UNDO = 20;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

type Panel = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  items: TodoItem[];
  code: string;
  kind?: "standard" | "computed";
  formula?: string;
  categoryIds: string[];
  categoryAssignedAt?: number | null;
};

type AppState = {
  version: 4;
  appTitle: string;
  motto: string;
  activeCategoryId: string;
  layout: {
    expandedPanelIdsByCategory: Record<string, string[]>;
    collapsedPanelIds: string[];
    sidebarWidth: number;
  };
  panels: Panel[];
};

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;

const formatStamp = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const formatNumber = (n: number) => n.toLocaleString("ko-KR");
const clampText = (s: string) => s.replace(/\s+/g, " ").trim();
const normalizePanelCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
const formulaTokenPattern = "[A-Z][A-Z0-9]*|\\d[\\d,]*";
const inlineFormulaPattern = new RegExp(
  `^([-+]?\\s*(?:${formulaTokenPattern})(?:\\s*[-+]\\s*(?:${formulaTokenPattern}))*)(?:\\s*=\\s*.*|\\s[a-zA-Z0-9 ]*)?$`,
  "i"
);

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function useColumnCount(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 860) setCols(1);
      else if (w < 1900) setCols(2);
      else if (w < 2800) setCols(3);
      else setCols(4);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

const defaultLayout = () => ({
  expandedPanelIdsByCategory: {} as Record<string, string[]>,
  collapsedPanelIds: [] as string[],
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
});

const extractPanelSum = (items: TodoItem[]): number | null => {
  let total = 0;
  let found = false;
  for (const item of items) {
    const m = item.text.match(/:\s*([\d,]+)\s*$/);
    if (!m || item.done) continue;
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (!isNaN(n)) {
      total += n;
      found = true;
    }
  }
  return found ? total : null;
};

const panelCodeFromIndex = (n: number) => `A${n + 1}`;

const nextPanelCode = (panels: Panel[]) => {
  const used = new Set(panels.map((panel) => normalizePanelCode(panel.code)));
  let seq = 0;
  let code = panelCodeFromIndex(seq);
  while (used.has(code)) code = panelCodeFromIndex(++seq);
  return code;
};

const clonePanelForCategory = (panel: Panel, categoryId: string): Panel => ({
  ...panel,
  id: uid(),
  items: panel.items.map((item) => ({ ...item, id: uid() })),
  categoryIds: [categoryId],
  categoryAssignedAt: Date.now(),
});

function ensurePanelCodesWithinList(panels: Panel[]): Panel[] {
  const used = new Set<string>();
  let seq = 0;
  return panels.map((panel) => {
    let code = normalizePanelCode(panel.code);
    if (!code || used.has(code)) {
      do {
        code = panelCodeFromIndex(seq++);
      } while (used.has(code));
    }
    used.add(code);
    return { ...panel, code };
  });
}

function fixPanelCodesByList(panels: Panel[], categories: Category[]): Panel[] {
  const byCategory = new Map<string, Panel[]>();
  const multiFree: Panel[] = [];

  for (const panel of panels) {
    const catId = panel.categoryIds[0];
    if (!catId) {
      multiFree.push(panel);
      continue;
    }
    const arr = byCategory.get(catId) ?? [];
    arr.push(panel);
    byCategory.set(catId, arr);
  }

  const fixed = new Map<string, Panel>();
  for (const category of categories) {
    const arr = byCategory.get(category.id) ?? [];
    ensurePanelCodesWithinList(arr).forEach((panel) => fixed.set(panel.id, panel));
  }
  ensurePanelCodesWithinList(multiFree).forEach((panel) => fixed.set(panel.id, panel));
  return panels.map((panel) => fixed.get(panel.id) ?? panel);
}

function seedCategory(name = "2026.04"): Category {
  return createCategory(name);
}

function seedState(categoryId: string): AppState {
  const now = Date.now();
  const makeItem = (text: string): TodoItem => ({ id: uid(), text, done: false, createdAt: now });
  const makePanel = (title: string, color: string, code: string, items: string[]): Panel => ({
    id: uid(), title, color, createdAt: now, code, kind: "standard", formula: "",
    categoryIds: categoryId ? [categoryId] : [], categoryAssignedAt: now,
    items: items.map(makeItem),
  });

  return {
    version: 4,
    appTitle: "Cashflow",
    motto: "Track every won.",
    activeCategoryId: categoryId,
    layout: defaultLayout(),
    panels: [
      makePanel("💰 Income",    "#4CAF50", "A1", ["Salary: 3,200,000", "Freelance: 800,000", "Dividend: 120,000"]),
      makePanel("🏠 Housing",   "#2196F3", "A2", ["Rent: 900,000", "Utilities: 85,000", "Internet: 35,000"]),
      makePanel("🍽️ Food",      "#FF9800", "A3", ["Groceries: 320,000", "Dining out: 180,000", "Coffee: 45,000"]),
      makePanel("🚌 Transport", "#9C27B0", "A4", ["Subway pass: 55,000", "Taxi: 30,000", "Gas: 80,000"]),
      makePanel("📚 Growth",    "#00BCD4", "A5", ["Books: 42,000", "Online course: 89,000"]),
      makePanel("💾 Savings",   "#F44336", "A6", ["Emergency fund: 200,000", "Investment: 300,000"]),
    ],
  };
}

function migratePanel(p: any): Panel {
  const items: TodoItem[] = Array.isArray(p.items)
    ? p.items.map((item: any) => ({
        id: typeof item?.id === "string" ? item.id : uid(),
        text: typeof item?.text === "string" ? item.text : "",
        done: !!item?.done,
        createdAt: typeof item?.createdAt === "number" ? item.createdAt : Date.now(),
      }))
    : [];

  return {
    id: typeof p?.id === "string" ? p.id : uid(),
    title: typeof p?.title === "string" ? p.title : "패널",
    color: typeof p?.color === "string" ? p.color : "#7c98ff",
    createdAt: typeof p?.createdAt === "number" ? p.createdAt : Date.now(),
    items,
    code: normalizePanelCode(typeof p?.code === "string" ? p.code : ""),
    kind: p?.kind === "computed" ? "computed" : "standard",
    formula: typeof p?.formula === "string" ? p.formula : "",
    categoryIds: Array.isArray(p?.categoryIds) ? p.categoryIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 1) : [],
    categoryAssignedAt: typeof p?.categoryAssignedAt === "number" ? p.categoryAssignedAt : null,
  };
}

function safeParseState(raw: string | null, categories: Category[]): AppState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const fallbackCategoryId = categories[0]?.id ?? "";
    const parsedPanels = Array.isArray(data?.panels)
      ? data.panels.map((p: any) => migratePanel(p)).filter(Boolean)
          .map((panel: Panel) => ({
            ...panel,
            categoryIds: validCategoryIds.has(panel.categoryIds[0]) ? [panel.categoryIds[0]] : fallbackCategoryId ? [fallbackCategoryId] : [],
          }))
      : [];
    const fixedPanels = fixPanelCodesByList(parsedPanels, categories);
    return {
      version: 4,
      appTitle: typeof data?.appTitle === "string" ? data.appTitle : "Cashflow",
      motto: typeof data?.motto === "string" ? data.motto : "",
      activeCategoryId: typeof data?.activeCategoryId === "string" && categories.some((c) => c.id === data.activeCategoryId)
        ? data.activeCategoryId
        : fallbackCategoryId,
      layout: {
        expandedPanelIdsByCategory:
          data?.layout?.expandedPanelIdsByCategory && typeof data.layout.expandedPanelIdsByCategory === "object"
            ? data.layout.expandedPanelIdsByCategory
            : {},
        collapsedPanelIds: Array.isArray(data?.layout?.collapsedPanelIds)
          ? data.layout.collapsedPanelIds.filter((id: unknown): id is string => typeof id === "string")
          : [],
        sidebarWidth: typeof data?.layout?.sidebarWidth === "number" ? clampSidebarWidth(data.layout.sidebarWidth) : SIDEBAR_DEFAULT_WIDTH,
      },
      panels: fixedPanels,
    };
  } catch {
    return null;
  }
}

function CategoryModal({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel()} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#14151c", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "22px 22px 18px", minWidth: 280 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 14 }}>새 리스트</div>
        <input
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="리스트 이름"
          maxLength={40}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && val.trim()) onConfirm(val.trim());
            if (e.key === "Escape") onCancel();
          }}
          style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, color: "rgba(255,255,255,0.88)", fontSize: 13, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.14)", background: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 12 }}>취소</button>
          <button onClick={() => val.trim() && onConfirm(val.trim())} disabled={!val.trim()} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: val.trim() ? "rgba(124,152,255,0.85)" : "rgba(255,255,255,0.08)", color: val.trim() ? "#fff" : "rgba(255,255,255,0.30)", cursor: val.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700 }}>만들기</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#14151c", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "22px 22px 18px", minWidth: 280, boxShadow: "0 20px 60px rgba(0,0,0,0.65)" }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 8 }}>삭제 확인</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.14)", background: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 12 }}>취소</button>
          <button onClick={onConfirm} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#e45b70", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

function PanelDotsMenu({
  panel,
  categories,
  onMoveCategory,
  onDelete,
  onClose,
}: {
  panel: Panel;
  categories: Category[];
  onMoveCategory: (id: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="panelMenuDim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panelMenuBox" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="panelMenuTitle">패널 옵션</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.40)", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>
        {categories.length > 1 && (
          <>
            <div className="panelMenuTitle" style={{ marginTop: 4 }}>리스트 이동</div>
            <div className="panelMenuCategories">
              {categories.map((cat) => (
                <button key={cat.id} className={`panelMenuCatBtn${panel.categoryIds[0] === cat.id ? " selected" : ""}`} onClick={() => onMoveCategory(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="panelMenuDivider" />
          </>
        )}
        <button className="panelMenuDeleteBtn" onClick={onDelete}>패널 삭제</button>
      </div>
    </div>
  );
}

function Sidebar({
  categories,
  activeCategoryId,
  panelCount,
  latestText,
  sidebarOpen,
  onSelectCategory,
  onCreateCategory,
  onDeleteCategory,
  onCopyCategory,
  onRenameCategory,
  onClose,
  sidebarWidth,
  onResizeSidebar,
}: {
  categories: Category[];
  activeCategoryId: string;
  panelCount: (id: string) => number;
  latestText: (id: string) => string | undefined;
  sidebarOpen: boolean;
  onSelectCategory: (id: string) => void;
  onCreateCategory: (name: string) => void;
  onDeleteCategory: (id: string) => void;
  onCopyCategory: (id: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onClose: () => void;
  sidebarWidth: number;
  onResizeSidebar: (width: number) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".sidebarItemMenu, .sidebarMoreBtn")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [openMenuId]);

  const beginResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    document.body.classList.add("sidebarResizing");

    const onPointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      onResizeSidebar(clampSidebarWidth(start.width + event.clientX - start.x));
    };

    const endResize = () => {
      resizeStartRef.current = null;
      document.body.classList.remove("sidebarResizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
  }, [onResizeSidebar, sidebarWidth]);

  return (
    <>
      {sidebarOpen && <div className="sidebarDim" onClick={onClose} />}
      <div className={`sidebar${sidebarOpen ? " open" : ""}`} style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}>
        {categories.map((cat) => (
          editingId === cat.id ? (
            <input
              key={cat.id}
              value={editVal}
              autoFocus
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim() && editVal.trim() !== cat.name) onRenameCategory(cat.id, editVal.trim()); setEditingId(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  if (editVal.trim()) onRenameCategory(cat.id, editVal.trim());
                  setEditingId(null);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              style={{ width: "100%", padding: "7px 10px", margin: "1px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 8, color: "rgba(255,255,255,0.88)", fontSize: 13, outline: "none" }}
            />
          ) : (
            <div
              key={cat.id}
              className={`sidebarItem${activeCategoryId === cat.id ? " active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => { onSelectCategory(cat.id); setOpenMenuId(null); }}
              onDoubleClick={() => { setEditVal(cat.name); setEditingId(cat.id); }}
            >
              <span className="sidebarAvatar" style={{ background: avatarColor(cat.id) }}>{cat.name[0]?.toUpperCase() ?? "?"}</span>
              <span style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</div>
                {latestText(cat.id) && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{latestText(cat.id)}</div>}
              </span>
              <span className="sidebarActions">
                {panelCount(cat.id) > 0 && <span className="sidebarCount">{panelCount(cat.id)}</span>}
                <button
                  className="sidebarMoreBtn"
                  aria-label="List actions"
                  aria-expanded={openMenuId === cat.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((id) => (id === cat.id ? null : cat.id));
                  }}
                >
                  ⋯
                </button>
              </span>
              {openMenuId === cat.id && (
                <div className="sidebarItemMenu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { onCopyCategory(cat.id); setOpenMenuId(null); }}>복사</button>
                  <button className="danger" onClick={() => { onDeleteCategory(cat.id); setOpenMenuId(null); }}>삭제</button>
                </div>
              )}
            </div>
          )
        ))}
        <button className="sidebarAddBtn" onClick={() => setShowCreate(true)}>+ 리스트 추가</button>
        <div
          className="sidebarResizeHandle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          onPointerDown={beginResize}
        />
      </div>
      {showCreate && <CategoryModal onConfirm={(name) => { onCreateCategory(name); setShowCreate(false); }} onCancel={() => setShowCreate(false)} />}
    </>
  );
}

function TodoComposer({ onAdd }: { onAdd: (text: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="composer">
      <input
        className="todoInput"
        value={v}
        placeholder="할 일 입력 후 Enter"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            onAdd(v);
            setV("");
          }
        }}
      />
      <button className="secondaryBtn" onClick={() => { onAdd(v); setV(""); }}>추가</button>
    </div>
  );
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [state, setState] = useState<AppState>(() => seedState(""));
  const [undo, setUndo] = useState<AppState[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dotsMenuPanelId, setDotsMenuPanelId] = useState<string | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ panelId: string; itemId: string } | null>(null);
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const composingItemIdRef = useRef<string | null>(null);
  const composingPanelIdRef = useRef<string | null>(null);
  const colCount = useColumnCount();
  const sidebarWidth = clampSidebarWidth(state.layout.sidebarWidth ?? SIDEBAR_DEFAULT_WIDTH);

  const pushUndo = useCallback((next: AppState) => {
    setUndo((prev) => [state, ...prev].slice(0, MAX_UNDO));
    setState(next);
  }, [state]);

  useEffect(() => {
    try {
      const savedUndo = localStorage.getItem(UNDO_KEY);
      if (savedUndo) setUndo((JSON.parse(savedUndo) as AppState[]).slice(0, MAX_UNDO));
    } catch {}
  }, []);

  useEffect(() => {
    async function init() {
      let nextCategories: Category[] = [];
      let nextState: AppState | null = null;

      try {
        const res = await fetch("/api/todos");
        if (res.ok) {
          const data = await res.json();
          nextCategories = Array.isArray(data.categories_main) ? data.categories_main : [];
          if (!nextCategories.length) nextCategories = [seedCategory()];
          nextState = safeParseState(JSON.stringify(data.state), nextCategories);
        }
      } catch {}

      if (!nextState) {
        nextCategories = loadCategories("main");
        if (!nextCategories.length) nextCategories = [seedCategory()];
        nextState = safeParseState(localStorage.getItem(STORAGE_KEY), nextCategories) ?? seedState(nextCategories[0].id);
      }

      setCategories(nextCategories);
      setState({
        ...nextState,
        activeCategoryId: nextState.activeCategoryId || nextCategories[0].id,
        panels: fixPanelCodesByList(nextState.panels, nextCategories),
      });
      setHydrated(true);
    }
    init();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(UNDO_KEY, JSON.stringify(undo.slice(0, MAX_UNDO))); } catch {}
  }, [undo, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
      fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, categories_main: categories }),
      }).catch(() => {});
    }, 200);
    return () => window.clearTimeout(timer);
  }, [state, categories, hydrated]);

  useEffect(() => {
    if (!hydrated || !categories.length) return;
    if (!categories.some((cat) => cat.id === state.activeCategoryId)) {
      setState((prev) => ({ ...prev, activeCategoryId: categories[0].id }));
    }
  }, [categories, hydrated, state.activeCategoryId]);

  useEffect(() => {
    if (hydrated) document.title = state.appTitle || "Cashflow";
  }, [hydrated, state.appTitle]);

  const activePanels = useMemo(
    () => state.panels.filter((panel) => panel.categoryIds[0] === state.activeCategoryId),
    [state.panels, state.activeCategoryId]
  );

  const panelsByCode = useMemo(() => {
    const map = new Map<string, Panel[]>();
    for (const panel of activePanels) {
      const code = normalizePanelCode(panel.code);
      if (!code) continue;
      const existing = map.get(code) ?? [];
      existing.push(panel);
      map.set(code, existing);
    }
    return map;
  }, [activePanels]);

  const evaluateFormula = useCallback((formula: string, trail: string[] = []): { value: number | null; error: string | null } => {
    const normalized = formula.trim().toUpperCase();
    if (!normalized) return { value: null, error: null };
    const tokens = normalized.match(/[+-]|\d[\d,]*|[A-Z][A-Z0-9]*/g);
    if (!tokens?.length) return { value: null, error: "수식 형식 오류" };
    let total = 0;
    let sign = 1;
    for (const token of tokens) {
      if (token === "+") { sign = 1; continue; }
      if (token === "-") { sign = -1; continue; }
      if (/^\d[\d,]*$/.test(token)) {
        total += sign * parseInt(token.replace(/,/g, ""), 10);
        continue;
      }
      const matches = panelsByCode.get(token) ?? [];
      if (!matches.length) return { value: null, error: `${token} 없음` };
      const panel = matches[0];
      if (trail.includes(panel.id)) return { value: null, error: "순환 참조" };
      const resolved = panel.kind === "computed"
        ? evaluateFormula(panel.formula ?? "", [...trail, panel.id])
        : { value: extractPanelSum(panel.items), error: null };
      if (resolved.error) return resolved;
      total += sign * (resolved.value ?? 0);
    }
    return { value: total, error: null };
  }, [panelsByCode]);

  const panelCount = (categoryId: string) => state.panels.filter((panel) => panel.categoryIds[0] === categoryId).length;

  const latestText = (categoryId: string) => {
    const items = state.panels
      .filter((panel) => panel.categoryIds[0] === categoryId)
      .flatMap((panel) => panel.items)
      .sort((a, b) => b.createdAt - a.createdAt);
    return items[0]?.text;
  };

  const doUndo = () => {
    setUndo((prev) => {
      if (!prev.length) return prev;
      const [top, ...rest] = prev;
      setState(top);
      return rest;
    });
  };

  const addCategory = (name: string) => {
    const category = createCategory(name);
    setCategories((prev) => [...prev, category]);
    setState((prev) => ({ ...prev, activeCategoryId: category.id }));
  };

  const copyCategory = (categoryId: string) => {
    const base = categories.find((cat) => cat.id === categoryId);
    if (!base) return;
    const newCategory = createCategory(`${base.name} Copy`);
    const sourcePanels = state.panels.filter((panel) => panel.categoryIds[0] === categoryId);
    const copiedPanels = sourcePanels.map((panel) => clonePanelForCategory(panel, newCategory.id));
    setCategories((prev) => [...prev, newCategory]);
    pushUndo({
      ...state,
      activeCategoryId: newCategory.id,
      panels: [...state.panels, ...copiedPanels],
    });
  };

  const deleteCategory = (categoryId: string) => {
    const remainingCategories = categories.filter((cat) => cat.id !== categoryId);
    if (!remainingCategories.length) return;
    setCategories(remainingCategories);
    pushUndo({
      ...state,
      activeCategoryId: state.activeCategoryId === categoryId ? remainingCategories[0].id : state.activeCategoryId,
      panels: state.panels.filter((panel) => panel.categoryIds[0] !== categoryId),
    });
  };

  const renameCategory = (id: string, name: string) =>
    setCategories((prev) => prev.map((cat) => (cat.id === id ? { ...cat, name } : cat)));

  const getCurrentListPanels = (panels = state.panels, activeCategoryId = state.activeCategoryId) =>
    panels.filter((panel) => panel.categoryIds[0] === activeCategoryId);

  const addPanel = () => {
    if (!state.activeCategoryId) return;
    const currentListPanels = getCurrentListPanels();
    pushUndo({
      ...state,
      panels: [
        ...state.panels,
        {
          id: uid(),
          title: "P",
          color: "#7c98ff",
          createdAt: Date.now(),
          items: [],
          code: nextPanelCode(currentListPanels),
          kind: "standard",
          formula: "",
          categoryIds: [state.activeCategoryId],
          categoryAssignedAt: Date.now(),
        },
      ],
    });
  };

  const addComputedPanel = () => {
    if (!state.activeCategoryId) return;
    const currentListPanels = getCurrentListPanels();
    pushUndo({
      ...state,
      panels: [
        ...state.panels,
        {
          id: uid(),
          title: "Total",
          color: "#9ecb7a",
          createdAt: Date.now(),
          items: [],
          code: nextPanelCode(currentListPanels),
          kind: "computed",
          formula: "",
          categoryIds: [state.activeCategoryId],
          categoryAssignedAt: Date.now(),
        },
      ],
    });
  };

  const renamePanel = (id: string, title: string) =>
    setState((prev) => ({ ...prev, panels: prev.panels.map((panel) => (panel.id === id ? { ...panel, title } : panel)) }));

  const setPanelColor = (id: string, color: string) =>
    setState((prev) => ({ ...prev, panels: prev.panels.map((panel) => (panel.id === id ? { ...panel, color } : panel)) }));

  const setPanelCode = (id: string, code: string) => {
    const nextPanels = [...state.panels];
    const target = nextPanels.find((panel) => panel.id === id);
    if (!target) return;
    target.code = normalizePanelCode(code);
    const listId = target.categoryIds[0];
    const listPanels = nextPanels.filter((panel) => panel.categoryIds[0] === listId);
    const fixedListPanels = ensurePanelCodesWithinList(listPanels);
    const fixedMap = new Map(fixedListPanels.map((panel) => [panel.id, panel]));
    pushUndo({
      ...state,
      panels: nextPanels.map((panel) => fixedMap.get(panel.id) ?? panel),
    });
  };

  const setPanelFormula = (id: string, formula: string) =>
    pushUndo({ ...state, panels: state.panels.map((panel) => (panel.id === id ? { ...panel, formula, kind: "computed" } : panel)) });

  const deletePanel = (id: string) =>
    pushUndo({ ...state, panels: state.panels.filter((panel) => panel.id !== id) });

  const movePanelToCategory = (panelId: string, categoryId: string) => {
    const nextPanels = state.panels.map((panel) =>
      panel.id === panelId ? { ...panel, categoryIds: [categoryId], categoryAssignedAt: Date.now() } : panel
    );
    pushUndo({
      ...state,
      panels: fixPanelCodesByList(nextPanels, categories),
    });
  };

  const togglePanelCollapse = (id: string) =>
    setState((prev) => {
      const next = new Set(prev.layout.collapsedPanelIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, layout: { ...prev.layout, collapsedPanelIds: [...next] } };
    });

  const addItem = (panelId: string, text: string) => {
    const value = clampText(text);
    if (!value) return;
    pushUndo({
      ...state,
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, items: [{ id: uid(), text: value, done: false, createdAt: Date.now() }, ...panel.items] }
          : panel
      ),
    });
  };

  const updateItemText = (panelId: string, itemId: string, text: string) =>
    setState((prev) => ({
      ...prev,
      panels: prev.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, items: panel.items.map((item) => (item.id === itemId ? { ...item, text } : item)) }
          : panel
      ),
    }));

  const toggleItem = (panelId: string, itemId: string) =>
    pushUndo({
      ...state,
      panels: state.panels.map((panel) =>
        panel.id === panelId
          ? { ...panel, items: panel.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)) }
          : panel
      ),
    });

  const deleteItem = (panelId: string, itemId: string) =>
    pushUndo({
      ...state,
      panels: state.panels.map((panel) =>
        panel.id === panelId ? { ...panel, items: panel.items.filter((item) => item.id !== itemId) } : panel
      ),
    });

  const collapsedPanels = new Set(state.layout.collapsedPanelIds);
  const dotsPanel = dotsMenuPanelId ? state.panels.find((panel) => panel.id === dotsMenuPanelId) ?? null : null;

  if (!hydrated) {
    return (
      <main className="app">
        <div className="topbar">
          <div className="psv-brand">
            <div className="skeletonTitle" />
            <div className="skeletonSub" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <TopNav
        current="main"
        titleValue={state.appTitle}
        mottoValue={state.motto}
        onChangeTitle={(v) => setState((prev) => ({ ...prev, appTitle: v }))}
        onChangeMotto={(v) => setState((prev) => ({ ...prev, motto: v }))}
        sidebarToggle={
          <button className="hamburgerBtn" onClick={() => setSidebarOpen((open) => !open)} aria-label="메뉴">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        }
      >
        <button className="iconBtn" onClick={doUndo} disabled={undo.length === 0} title="되돌리기">↶</button>
        <button className="primaryBtn" onClick={addPanel} title="패널 추가">P</button>
        <button className="primaryBtn" onClick={addComputedPanel} title="계산 패널">C</button>
      </TopNav>

      <div className="appBody">
        <Sidebar
          categories={categories}
          activeCategoryId={state.activeCategoryId}
          panelCount={panelCount}
          latestText={latestText}
          sidebarOpen={sidebarOpen}
          onSelectCategory={(id) => { setState((prev) => ({ ...prev, activeCategoryId: id })); setSidebarOpen(false); }}
          onCreateCategory={addCategory}
          onDeleteCategory={(id) => setDeleteCategoryTarget(id)}
          onCopyCategory={copyCategory}
          onRenameCategory={renameCategory}
          onClose={() => setSidebarOpen(false)}
          sidebarWidth={sidebarWidth}
          onResizeSidebar={(width) => {
            setState((prev) => ({
              ...prev,
              layout: { ...prev.layout, sidebarWidth: clampSidebarWidth(width) },
            }));
          }}
        />

        <div className="mainContent">
          <section className="panelRow" aria-label="Panels">
            <div className="panelMasonry">
              {Array.from({ length: colCount }, (_, ci) => (
                <div key={ci} className="masonryCol">
                  {activePanels.filter((_, index) => index % colCount === ci).map((panel) => {
                    const isComputedPanel = panel.kind === "computed";
                    const computed = isComputedPanel ? evaluateFormula(panel.formula ?? "", [panel.id]) : null;
                    const sum = !isComputedPanel
                      ? (() => {
                          let total = 0;
                          let found = false;
                          for (const item of panel.items) {
                            if (item.done) continue;
                            const numeric = item.text.match(/:\s*([\d,]+)\s*$/);
                            if (numeric) {
                              const n = parseInt(numeric[1].replace(/,/g, ""), 10);
                              if (!isNaN(n)) {
                                total += n;
                                found = true;
                              }
                              continue;
                            }
                            const formulaMatch = item.text.match(inlineFormulaPattern);
                            if (formulaMatch) {
                              const result = evaluateFormula(formulaMatch[1].trim());
                              if (result.value !== null) {
                                total += result.value;
                                found = true;
                              }
                            }
                          }
                          return found ? total : null;
                        })()
                      : null;

                    return (
                      <article key={panel.id} className="panel" style={{ ["--panel" as any]: panel.color }}>
                        <header className="panelHeader">
                          <span className="grabBtn" title="패널">⋮</span>
                          <div className="panelTitleWrap">
                            <div className="dotColorWrap" title="색상 변경" onClick={() => colorInputRefs.current[panel.id]?.click()}>
                              <span className="dot" />
                              <input
                                type="color"
                                className="dotColorInput"
                                value={panel.color}
                                ref={(el) => { colorInputRefs.current[panel.id] = el; }}
                                onChange={(e) => setPanelColor(panel.id, e.target.value)}
                              />
                            </div>
                            <input
                              className="panelTitle"
                              value={panel.title}
                              onChange={(e) => {
                                if (composingPanelIdRef.current !== panel.id) renamePanel(panel.id, e.target.value);
                              }}
                              onCompositionStart={() => { composingPanelIdRef.current = panel.id; }}
                              onCompositionEnd={(e) => {
                                composingPanelIdRef.current = null;
                                renamePanel(panel.id, (e.target as HTMLInputElement).value);
                              }}
                            />
                            <input
                              value={panel.code}
                              onChange={(e) => setPanelCode(panel.id, e.target.value)}
                              style={{ width: `${Math.max(2, panel.code.length) + 1}ch`, height: 36, borderRadius: 12, border: "none", background: "transparent", color: "rgba(255,255,255,0.85)", padding: "0 4px 0 0", fontSize: 14, fontWeight: 700, outline: "none", textAlign: "right" }}
                            />
                          </div>
                          <div className="panelRight">
                            <button className="collapseBtn" onClick={() => togglePanelCollapse(panel.id)} title="접기/펼치기">
                              {collapsedPanels.has(panel.id) ? "▾" : "▴"}
                            </button>
                            <button className="expandBtn" title="패널 옵션">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button className="dotsBtn" onClick={() => setDotsMenuPanelId(panel.id)} title="패널 옵션">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <circle cx="5" cy="12" r="1.8" fill="currentColor" />
                                <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                                <circle cx="19" cy="12" r="1.8" fill="currentColor" />
                              </svg>
                            </button>
                          </div>
                        </header>

                        {!collapsedPanels.has(panel.id) && (
                          <>
                            {isComputedPanel ? (
                              <div className="panelTools">
                                <div className="composer">
                                  <input
                                    className="todoInput"
                                    value={panel.formula ?? ""}
                                    placeholder="A1 + B1 - 820"
                                    onChange={(e) => setPanelFormula(panel.id, e.target.value.toUpperCase())}
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="panelTools">
                                  <TodoComposer onAdd={(text) => addItem(panel.id, text)} />
                                </div>
                                <ul className="list">
                                  {panel.items.map((item) => {
                                    const formulaMatch = item.text.match(inlineFormulaPattern);
                                    const formulaResult = formulaMatch ? evaluateFormula(formulaMatch[1].trim()) : null;
                                    return (
                                      <li key={item.id} className={`item${item.done ? " done" : ""}`}>
                                        <button className={`itemGrab${item.done ? " specialDoneGrab" : ""}`} title="항목">
                                          {item.done
                                            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            : "⋮"}
                                        </button>
                                        <input className="chk" type="checkbox" checked={item.done} onChange={() => toggleItem(panel.id, item.id)} />
                                        <div className="itemMain">
                                          {formulaResult && (
                                            <span className="itemFormulaResult">
                                              {formulaResult.error ? formulaResult.error : formulaResult.value == null ? "-" : formulaResult.value < 0 ? `- ${formatNumber(-formulaResult.value)}` : formatNumber(formulaResult.value)}
                                            </span>
                                          )}
                                          <input
                                            className={`itemText${formulaMatch ? " formula" : ""}${item.done ? " done" : ""}`}
                                            value={item.text}
                                            onChange={(e) => {
                                              if (composingItemIdRef.current !== item.id) {
                                                updateItemText(panel.id, item.id, e.target.value);
                                              }
                                            }}
                                            onCompositionStart={() => { composingItemIdRef.current = item.id; }}
                                            onCompositionEnd={(e) => {
                                              composingItemIdRef.current = null;
                                              updateItemText(panel.id, item.id, (e.target as HTMLInputElement).value);
                                            }}
                                          />
                                        </div>
                                        <div className="itemMeta">{formatStamp(item.createdAt)}</div>
                                        <button className="xBtn" onClick={() => setDeleteItemTarget({ panelId: panel.id, itemId: item.id })}>×</button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            )}

                            {isComputedPanel ? (
                              <div className="sumBar">
                                <span className="sumLabel">{computed?.error ?? "합계"}</span>
                                <span className="sumValue">{computed?.value == null ? "-" : formatNumber(computed.value)}</span>
                              </div>
                            ) : sum !== null ? (
                              <div className="sumBar">
                                <span className="sumLabel">합계</span>
                                <span className="sumValue">{formatNumber(sum)}</span>
                              </div>
                            ) : null}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {dotsPanel && (
        <PanelDotsMenu
          panel={dotsPanel}
          categories={categories}
          onMoveCategory={(categoryId) => {
            movePanelToCategory(dotsPanel.id, categoryId);
            setDotsMenuPanelId(null);
          }}
          onDelete={() => {
            deletePanel(dotsPanel.id);
            setDotsMenuPanelId(null);
          }}
          onClose={() => setDotsMenuPanelId(null)}
        />
      )}
      {deleteCategoryTarget && (
        <ConfirmDeleteModal
          message="리스트를 삭제할까요? 안의 패널도 함께 삭제됩니다."
          onConfirm={() => {
            deleteCategory(deleteCategoryTarget);
            setDeleteCategoryTarget(null);
          }}
          onCancel={() => setDeleteCategoryTarget(null)}
        />
      )}
      {deleteItemTarget && (
        <ConfirmDeleteModal
          message="항목을 삭제할까요?"
          onConfirm={() => {
            deleteItem(deleteItemTarget.panelId, deleteItemTarget.itemId);
            setDeleteItemTarget(null);
          }}
          onCancel={() => setDeleteItemTarget(null)}
        />
      )}
    </main>
  );
}
