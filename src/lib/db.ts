import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? "/tmp/cashflow-data" : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "cashflow.db");
const SEED_PATH = path.join(process.cwd(), "data", "seed.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    mode TEXT PRIMARY KEY,
    app_title TEXT NOT NULL DEFAULT '',
    motto TEXT NOT NULL DEFAULT '',
    active_category_id TEXT NOT NULL DEFAULT 'all',
    expanded_panel_id TEXT,
    collapsed_panel_ids TEXT NOT NULL DEFAULT '[]',
    sidebar_width INTEGER NOT NULL DEFAULT 240,
    version INTEGER NOT NULL DEFAULT 4
  );

  CREATE TABLE IF NOT EXISTS panels (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    title TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#888888',
    created_at INTEGER NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'standard',
    formula TEXT NOT NULL DEFAULT '',
    category_assigned_at INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS panel_categories (
    panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    PRIMARY KEY (panel_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS todo_items (
    id TEXT PRIMARY KEY,
    panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_panels_mode ON panels(mode);
  CREATE INDEX IF NOT EXISTS idx_todo_items_panel ON todo_items(panel_id);
  CREATE INDEX IF NOT EXISTS idx_categories_mode ON categories(mode);
`);

const panelColumns = new Set(
  (db.prepare("PRAGMA table_info(panels)").all() as { name: string }[]).map((row) => row.name)
);

if (!panelColumns.has("code")) db.exec("ALTER TABLE panels ADD COLUMN code TEXT NOT NULL DEFAULT ''");
if (!panelColumns.has("kind")) db.exec("ALTER TABLE panels ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'");
if (!panelColumns.has("formula")) db.exec("ALTER TABLE panels ADD COLUMN formula TEXT NOT NULL DEFAULT ''");

const appStateColumns = new Set(
  (db.prepare("PRAGMA table_info(app_state)").all() as { name: string }[]).map((row) => row.name)
);

if (!appStateColumns.has("expanded_panel_id")) db.exec("ALTER TABLE app_state ADD COLUMN expanded_panel_id TEXT");
if (!appStateColumns.has("collapsed_panel_ids")) {
  db.exec("ALTER TABLE app_state ADD COLUMN collapsed_panel_ids TEXT NOT NULL DEFAULT '[]'");
}
if (!appStateColumns.has("sidebar_width")) {
  db.exec("ALTER TABLE app_state ADD COLUMN sidebar_width INTEGER NOT NULL DEFAULT 240");
}

// Seed on fresh DB
(function seedIfEmpty() {
  const count = (db.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number }).c;
  if (count > 0) return;
  try {
    if (!fs.existsSync(SEED_PATH)) return;
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8"));

    const txn = db.transaction(() => {
      for (const row of seed.app_state) {
        db.prepare(`INSERT OR IGNORE INTO app_state (mode, app_title, motto, active_category_id, expanded_panel_id, collapsed_panel_ids, sidebar_width, version) VALUES (?,?,?,?,?,?,?,?)`)
          .run(row.mode, row.app_title, row.motto, row.active_category_id, row.expanded_panel_id, row.collapsed_panel_ids, row.sidebar_width, row.version);
      }
      for (const row of seed.categories) {
        db.prepare(`INSERT OR IGNORE INTO categories (id, mode, name, created_at) VALUES (?,?,?,?)`)
          .run(row.id, row.mode, row.name, row.created_at);
      }
      for (const row of seed.panels) {
        db.prepare(`INSERT OR IGNORE INTO panels (id, mode, title, color, kind, code, formula, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(row.id, row.mode, row.title, row.color, row.kind, row.code, row.formula, row.sort_order, row.created_at);
      }
      for (const row of seed.panel_categories) {
        db.prepare(`INSERT OR IGNORE INTO panel_categories (panel_id, category_id) VALUES (?,?)`)
          .run(row.panel_id, row.category_id);
      }
      for (const row of seed.todo_items) {
        db.prepare(`INSERT OR IGNORE INTO todo_items (id, panel_id, text, done, sort_order, created_at) VALUES (?,?,?,?,?,?)`)
          .run(row.id, row.panel_id, row.text, row.done, row.sort_order, row.created_at);
      }
    });
    txn();
  } catch {}
})();

export default db;

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

export type Panel = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  items: TodoItem[];
  code: string;
  kind?: "standard" | "computed";
  formula?: string;
  categoryIds: string[];
  categoryAssignedAt: number | null;
};

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};

export type AppState = {
  version: number;
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

export function readState(mode: "main"): { state: AppState | null; categories: Category[] } {
  const row = db.prepare("SELECT * FROM app_state WHERE mode = ?").get(mode) as
    | {
        app_title: string;
        motto: string;
        active_category_id: string;
        expanded_panel_id: string | null;
        collapsed_panel_ids: string | null;
        sidebar_width: number | null;
        version: number;
      }
    | undefined;

  if (!row) return { state: null, categories: [] };

  return {
    state: {
      version: row.version,
      appTitle: row.app_title,
      motto: row.motto,
      activeCategoryId: row.active_category_id,
      layout: {
        expandedPanelIdsByCategory: (() => {
          if (!row.expanded_panel_id) return {};
          try {
            const parsed = JSON.parse(row.expanded_panel_id);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
            return {};
          } catch {
            return {};
          }
        })(),
        collapsedPanelIds: (() => {
          try {
            const parsed = JSON.parse(row.collapsed_panel_ids ?? "[]");
            return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
          } catch {
            return [];
          }
        })(),
        sidebarWidth: typeof row.sidebar_width === "number" ? row.sidebar_width : 240,
      },
      panels: readPanels(mode),
    },
    categories: readCategories(mode),
  };
}

export function readPanels(mode: "main"): Panel[] {
  const panelRows = db.prepare("SELECT * FROM panels WHERE mode = ? ORDER BY sort_order ASC, created_at ASC").all(mode) as {
    id: string;
    title: string;
    color: string;
    created_at: number;
    code: string;
    kind: "standard" | "computed";
    formula: string;
    category_assigned_at: number | null;
  }[];

  return panelRows.map((p) => {
    const categoryIds = (
      db.prepare("SELECT category_id FROM panel_categories WHERE panel_id = ?").all(p.id) as { category_id: string }[]
    ).map((r) => r.category_id);

    const items = (
      db.prepare("SELECT * FROM todo_items WHERE panel_id = ? ORDER BY sort_order ASC, created_at ASC").all(p.id) as {
        id: string;
        text: string;
        done: number;
        created_at: number;
      }[]
    ).map((i) => ({
      id: i.id,
      text: i.text,
      done: i.done === 1,
      createdAt: i.created_at,
    }));

    return {
      id: p.id,
      title: p.title,
      color: p.color,
      createdAt: p.created_at,
      items,
      code: p.code ?? "",
      kind: p.kind ?? "standard",
      formula: p.formula ?? "",
      categoryIds,
      categoryAssignedAt: p.category_assigned_at,
    };
  });
}

export function readCategories(mode: "main"): Category[] {
  return (
    db.prepare("SELECT * FROM categories WHERE mode = ? ORDER BY created_at ASC").all(mode) as {
      id: string;
      name: string;
      created_at: number;
    }[]
  ).map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at }));
}

export function writeState(mode: "main", state: AppState, categories: Category[]): void {
  const layout = state.layout ?? {
    expandedPanelIdsByCategory: {},
    collapsedPanelIds: [],
    sidebarWidth: 240,
  };

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO app_state (mode, app_title, motto, active_category_id, expanded_panel_id, collapsed_panel_ids, sidebar_width, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mode) DO UPDATE SET
        app_title = excluded.app_title,
        motto = excluded.motto,
        active_category_id = excluded.active_category_id,
        expanded_panel_id = excluded.expanded_panel_id,
        collapsed_panel_ids = excluded.collapsed_panel_ids,
        sidebar_width = excluded.sidebar_width,
        version = excluded.version
    `).run(
      mode,
      state.appTitle,
      state.motto,
      state.activeCategoryId,
      JSON.stringify(layout.expandedPanelIdsByCategory ?? {}),
      JSON.stringify(layout.collapsedPanelIds ?? []),
      layout.sidebarWidth ?? 240,
      state.version
    );

    const existingPanelIds = new Set(
      (db.prepare("SELECT id FROM panels WHERE mode = ?").all(mode) as { id: string }[]).map((r) => r.id)
    );
    const incomingPanelIds = new Set(state.panels.map((p) => p.id));

    for (const id of existingPanelIds) {
      if (!incomingPanelIds.has(id)) db.prepare("DELETE FROM panels WHERE id = ?").run(id);
    }

    state.panels.forEach((p, idx) => {
      db.prepare(`
        INSERT INTO panels (id, mode, title, color, created_at, code, kind, formula, category_assigned_at, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          color = excluded.color,
          code = excluded.code,
          kind = excluded.kind,
          formula = excluded.formula,
          category_assigned_at = excluded.category_assigned_at,
          sort_order = excluded.sort_order
      `).run(
        p.id,
        mode,
        p.title,
        p.color,
        p.createdAt,
        p.code ?? "",
        p.kind ?? "standard",
        p.formula ?? "",
        p.categoryAssignedAt ?? null,
        idx
      );

      db.prepare("DELETE FROM panel_categories WHERE panel_id = ?").run(p.id);
      for (const cid of p.categoryIds) {
        db.prepare("INSERT OR IGNORE INTO panel_categories (panel_id, category_id) VALUES (?, ?)").run(p.id, cid);
      }

      db.prepare("DELETE FROM todo_items WHERE panel_id = ?").run(p.id);
      p.items.forEach((item, itemIdx) => {
        db.prepare(`
          INSERT INTO todo_items (id, panel_id, text, done, created_at, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(item.id, p.id, item.text, item.done ? 1 : 0, item.createdAt, itemIdx);
      });
    });

    const existingCatIds = new Set(
      (db.prepare("SELECT id FROM categories WHERE mode = ?").all(mode) as { id: string }[]).map((r) => r.id)
    );
    const incomingCatIds = new Set(categories.map((c) => c.id));

    for (const id of existingCatIds) {
      if (!incomingCatIds.has(id)) db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    }

    for (const c of categories) {
      db.prepare(`
        INSERT INTO categories (id, mode, name, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `).run(c.id, mode, c.name, c.createdAt);
    }
  });

  txn();
}
