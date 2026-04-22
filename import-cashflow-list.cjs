const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const TODO_DREAM_URL = "http://127.0.0.1:3000/api/dream";
const TARGET_CATEGORY_NAME = "Cashflow";
const DB_PATH = path.join(__dirname, "data", "cashflow.db");

async function main() {
  const response = await fetch(TODO_DREAM_URL);
  if (!response.ok) {
    throw new Error(`Failed to read source dream data: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const categories = Array.isArray(payload.categories_dream) ? payload.categories_dream : [];
  const panels = Array.isArray(payload.state?.panels) ? payload.state.panels : [];

  const sourceCategory = categories.find(
    (category) => category && typeof category.name === "string" && category.name === TARGET_CATEGORY_NAME
  );

  if (!sourceCategory) {
    throw new Error(`Could not find '${TARGET_CATEGORY_NAME}' in source dream categories.`);
  }

  const selectedPanels = panels.filter((panel) =>
    Array.isArray(panel?.categoryIds) && panel.categoryIds.includes(sourceCategory.id)
  );

  if (!selectedPanels.length) {
    throw new Error(`No panels were tagged with '${TARGET_CATEGORY_NAME}'.`);
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const wipeMode = db.transaction((mode) => {
    const panelIds = db.prepare("SELECT id FROM panels WHERE mode = ?").all(mode);
    for (const { id } of panelIds) {
      db.prepare("DELETE FROM panels WHERE id = ?").run(id);
    }
    db.prepare("DELETE FROM categories WHERE mode = ?").run(mode);
  });

  const upsertAppState = db.prepare(`
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
  `);

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, mode, name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      mode = excluded.mode,
      created_at = excluded.created_at
  `);

  const insertPanel = db.prepare(`
    INSERT INTO panels (id, mode, title, color, created_at, category_assigned_at, is_special, bg_image, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      title = excluded.title,
      color = excluded.color,
      created_at = excluded.created_at,
      category_assigned_at = excluded.category_assigned_at,
      is_special = excluded.is_special,
      bg_image = excluded.bg_image,
      sort_order = excluded.sort_order
  `);

  const insertPanelCategory = db.prepare(`
    INSERT OR REPLACE INTO panel_categories (panel_id, category_id)
    VALUES (?, ?)
  `);

  const insertTodo = db.prepare(`
    INSERT INTO todo_items (id, panel_id, text, done, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      panel_id = excluded.panel_id,
      text = excluded.text,
      done = excluded.done,
      created_at = excluded.created_at,
      sort_order = excluded.sort_order
  `);

  const importTxn = db.transaction(() => {
    wipeMode("main");
    wipeMode("dream");

    upsertAppState.run("main", "Cashflow", "", "all", "{}", "[]", 240, 4);
    upsertAppState.run("dream", "Cashflow Dream", "", sourceCategory.id, "{}", "[]", 240, 4);

    insertCategory.run(
      sourceCategory.id,
      "dream",
      sourceCategory.name,
      typeof sourceCategory.createdAt === "number" ? sourceCategory.createdAt : Date.now()
    );

    selectedPanels.forEach((panel, panelIndex) => {
      insertPanel.run(
        panel.id,
        "dream",
        typeof panel.title === "string" ? panel.title : "Untitled",
        typeof panel.color === "string" ? panel.color : "#7c98ff",
        typeof panel.createdAt === "number" ? panel.createdAt : Date.now(),
        typeof panel.categoryAssignedAt === "number" ? panel.categoryAssignedAt : null,
        panel.isSpecial ? 1 : 0,
        typeof panel.bgImage === "string" ? panel.bgImage : null,
        panelIndex
      );

      db.prepare("DELETE FROM panel_categories WHERE panel_id = ?").run(panel.id);
      db.prepare("DELETE FROM todo_items WHERE panel_id = ?").run(panel.id);

      const categoryIds = Array.isArray(panel.categoryIds) ? panel.categoryIds : [];
      for (const categoryId of categoryIds) {
        insertPanelCategory.run(panel.id, categoryId);
      }

      const items = Array.isArray(panel.items) ? panel.items : [];
      items.forEach((item, itemIndex) => {
        insertTodo.run(
          item.id,
          panel.id,
          typeof item.text === "string" ? item.text : "",
          item.done ? 1 : 0,
          typeof item.createdAt === "number" ? item.createdAt : Date.now(),
          itemIndex
        );
      });
    });
  });

  importTxn();
  db.close();

  console.log(
    JSON.stringify(
      {
        importedCategory: sourceCategory.name,
        importedPanels: selectedPanels.map((panel) => panel.title),
        panelCount: selectedPanels.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
