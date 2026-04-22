/**
 * migrate-json-to-sqlite.cjs
 * todos.json + dream.json → todo-carousel.db 마이그레이션 스크립트
 */

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DATA_DIR  = path.join(__dirname, "data");
const DB_PATH   = path.join(DATA_DIR, "todo-carousel.db");
const TODOS_JSON = path.join(DATA_DIR, "todos.json");
const DREAM_JSON = path.join(DATA_DIR, "dream.json");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── 테이블 생성 ─────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    mode       TEXT PRIMARY KEY,
    app_title  TEXT NOT NULL DEFAULT '',
    motto      TEXT NOT NULL DEFAULT '',
    active_category_id TEXT NOT NULL DEFAULT 'all',
    version    INTEGER NOT NULL DEFAULT 4
  );

  CREATE TABLE IF NOT EXISTS panels (
    id                   TEXT PRIMARY KEY,
    mode                 TEXT NOT NULL,
    title                TEXT NOT NULL,
    color                TEXT NOT NULL DEFAULT '#888888',
    created_at           INTEGER NOT NULL,
    category_assigned_at INTEGER,
    is_special           INTEGER NOT NULL DEFAULT 0,
    bg_image             TEXT,
    sort_order           INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS panel_categories (
    panel_id    TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    PRIMARY KEY (panel_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS todo_items (
    id         TEXT PRIMARY KEY,
    panel_id   TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    mode       TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_panels_mode       ON panels(mode);
  CREATE INDEX IF NOT EXISTS idx_todo_items_panel  ON todo_items(panel_id);
  CREATE INDEX IF NOT EXISTS idx_categories_mode   ON categories(mode);
`);

// ─── 마이그레이션 함수 ───────────────────────────────────────────────────────

function migrate(jsonPath, mode, categoriesKey) {
  if (!fs.existsSync(jsonPath)) {
    console.log(`[SKIP] ${jsonPath} 파일 없음`);
    return;
  }

  const raw  = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  const state      = data.state;
  const categories = data[categoriesKey] || [];

  if (!state) {
    console.log(`[SKIP] ${mode}: state 없음`);
    return;
  }

  console.log(`\n[START] ${mode} 마이그레이션`);
  console.log(`  panels: ${state.panels.length}개`);
  console.log(`  categories: ${categories.length}개`);

  const txn = db.transaction(() => {
    // app_state
    db.prepare(`
      INSERT INTO app_state (mode, app_title, motto, active_category_id, version)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(mode) DO UPDATE SET
        app_title          = excluded.app_title,
        motto              = excluded.motto,
        active_category_id = excluded.active_category_id,
        version            = excluded.version
    `).run(mode, state.appTitle || "", state.motto || "", state.activeCategoryId || "all", state.version || 4);

    // panels + items
    let totalItems = 0;
    state.panels.forEach((p, idx) => {
      db.prepare(`
        INSERT OR REPLACE INTO panels
          (id, mode, title, color, created_at, category_assigned_at, is_special, bg_image, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.id, mode, p.title, p.color || "#888888",
        p.createdAt, p.categoryAssignedAt ?? null,
        p.isSpecial ? 1 : 0, p.bgImage ?? null, idx
      );

      // categoryIds
      const catIds = Array.isArray(p.categoryIds) ? p.categoryIds : [];
      for (const cid of catIds) {
        db.prepare("INSERT OR IGNORE INTO panel_categories (panel_id, category_id) VALUES (?, ?)").run(p.id, cid);
      }

      // items
      const items = Array.isArray(p.items) ? p.items : [];
      items.forEach((item, iIdx) => {
        db.prepare(`
          INSERT OR REPLACE INTO todo_items (id, panel_id, text, done, created_at, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(item.id, p.id, item.text, item.done ? 1 : 0, item.createdAt, iIdx);
      });
      totalItems += items.length;
    });
    console.log(`  todo items 총 ${totalItems}개 삽입`);

    // categories
    for (const c of categories) {
      db.prepare(`
        INSERT OR REPLACE INTO categories (id, mode, name, created_at)
        VALUES (?, ?, ?, ?)
      `).run(c.id, mode, c.name, c.createdAt);
    }
  });

  txn();
  console.log(`[DONE] ${mode} 마이그레이션 완료`);
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

migrate(TODOS_JSON, "main",  "categories_main");
migrate(DREAM_JSON, "dream", "categories_dream");

// ─── 결과 확인 ───────────────────────────────────────────────────────────────

console.log("\n─── 최종 DB 현황 ───────────────────────────────");
const appStates = db.prepare("SELECT mode, app_title, motto FROM app_state").all();
console.log("app_state:", appStates);

const panelCount = db.prepare("SELECT mode, COUNT(*) as cnt FROM panels GROUP BY mode").all();
console.log("panels:", panelCount);

const itemCount = db.prepare("SELECT COUNT(*) as cnt FROM todo_items").get();
console.log("todo_items:", itemCount);

const catCount = db.prepare("SELECT mode, COUNT(*) as cnt FROM categories GROUP BY mode").all();
console.log("categories:", catCount);

console.log("\n✅ 마이그레이션 성공!");
db.close();
