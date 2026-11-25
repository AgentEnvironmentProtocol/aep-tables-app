export function renderTablesAppHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AEP Tables</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel-alt: #1e293b;
        --border: #334155;
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #6366f1;
        --accent-hover: #818cf8;
        --ok: #22c55e;
        --warn: #f59e0b;
        --danger: #ef4444;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
      }
      .app {
        display: grid;
        grid-template-columns: 270px 1fr;
        width: 100vw;
        height: 100vh;
      }
      .sidebar {
        background: var(--panel);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .brand {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
      }
      .brand h1 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .aep-badge {
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(99, 102, 241, 0.14);
        border: 1px solid rgba(99, 102, 241, 0.35);
        font-size: 11px;
        color: #c7d2fe;
        word-break: break-all;
        cursor: pointer;
        user-select: all;
      }
      .aep-badge:hover {
        background: rgba(99, 102, 241, 0.24);
      }
      .aep-clients {
        margin-top: 6px;
        color: var(--muted);
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ok);
      }
      .new-table-row {
        padding: 10px 12px;
        display: flex;
        gap: 6px;
        border-bottom: 1px solid var(--border);
      }
      .new-table-row input,
      .drawer input,
      .drawer select,
      .search-input {
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 13px;
      }
      .new-table-row input {
        flex: 1;
        min-width: 0;
      }
      button {
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 6px 11px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      button:hover { background: var(--accent-hover); }
      button.secondary {
        background: var(--panel-alt);
        color: var(--text);
        border: 1px solid var(--border);
      }
      button.secondary:hover { background: #293548; }
      button.danger-ghost {
        background: transparent;
        color: var(--muted);
        padding: 2px 6px;
        font-size: 14px;
        line-height: 1;
      }
      button.danger-ghost:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }
      button.icon-ghost {
        background: transparent;
        color: var(--muted);
        padding: 2px 5px;
        font-size: 12px;
        line-height: 1;
      }
      button.icon-ghost:hover {
        background: rgba(148, 163, 184, 0.16);
        color: var(--text);
      }
      .table-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .table-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid transparent;
        margin-bottom: 4px;
      }
      .table-item:hover { background: var(--panel-alt); }
      .table-item.active {
        background: rgba(99, 102, 241, 0.18);
        border-color: rgba(99, 102, 241, 0.55);
      }
      .table-meta {
        min-width: 0;
        flex: 1;
      }
      .table-name {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .table-sub {
        font-size: 11px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .workspace {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .topbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 16px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
      }
      .title-input {
        flex: 1;
        min-width: 160px;
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 7px 10px;
        font-size: 15px;
        font-weight: 600;
      }
      .search-input {
        width: 190px;
      }
      .pill {
        font-size: 12px;
        padding: 5px 10px;
        border-radius: 999px;
        background: var(--panel-alt);
        border: 1px solid var(--border);
        color: var(--muted);
        white-space: nowrap;
      }
      .pill.aep {
        color: #a5b4fc;
        border-color: rgba(99, 102, 241, 0.5);
        background: rgba(99, 102, 241, 0.14);
      }
      .drawer {
        display: none;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 16px;
        background: #131c31;
        border-bottom: 1px solid var(--border);
      }
      .drawer.open {
        display: flex;
      }
      .drawer label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--muted);
      }
      .toast {
        display: none;
        padding: 8px 16px;
        font-size: 13px;
        background: rgba(239, 68, 68, 0.16);
        border-bottom: 1px solid rgba(239, 68, 68, 0.45);
        color: #fecaca;
      }
      .toast.visible {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .grid-wrap {
        flex: 1;
        overflow: auto;
        padding: 16px;
        min-height: 0;
      }
      table.data-grid {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
      }
      table.data-grid th,
      table.data-grid td {
        border: 1px solid var(--border);
        padding: 6px 8px;
        text-align: left;
        vertical-align: middle;
        font-size: 13px;
      }
      table.data-grid th {
        background: var(--panel-alt);
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .col-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .col-title {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .col-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .type-badge {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        padding: 2px 5px;
        border-radius: 4px;
        background: rgba(148, 163, 184, 0.14);
        color: var(--muted);
        border: 1px solid rgba(148, 163, 184, 0.25);
      }
      .req-star {
        color: var(--warn);
        font-weight: 700;
      }
      .col-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .row-id-col {
        width: 86px;
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px;
        white-space: nowrap;
      }
      .row-act-col {
        width: 68px;
        text-align: center !important;
        white-space: nowrap;
      }
      .cell-input {
        width: 100%;
        min-width: 100px;
        background: transparent;
        color: var(--text);
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 5px 6px;
        font-size: 13px;
        font-family: inherit;
      }
      .cell-input:hover {
        border-color: var(--border);
      }
      .cell-input:focus {
        outline: none;
        background: var(--bg);
        border-color: var(--accent);
      }
      .cell-check-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cell-check {
        width: 16px;
        height: 16px;
        accent-color: var(--accent);
        cursor: pointer;
      }
      tr.draft-row {
        background: rgba(99, 102, 241, 0.08);
      }
      tr.draft-row .cell-input {
        background: var(--bg);
        border-color: var(--border);
      }
      .grid-footer {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .empty-state {
        padding: 28px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <h1>AEP Tables</h1>
          <div class="aep-badge" id="aep-endpoint" title="Click to copy AEP WebSocket URL">AEP: connecting...</div>
          <div class="aep-clients">
            <span class="dot"></span>
            <span id="aep-clients-label">AEP Clients: 0</span>
          </div>
        </div>
        <div class="new-table-row">
          <input id="new-table-name" type="text" placeholder="New table name..." />
          <button id="new-table-btn" type="button">+ New</button>
        </div>
        <div class="table-list" id="table-list"></div>
      </aside>
      <main class="workspace">
        <div class="topbar">
          <input id="table-title" class="title-input" type="text" placeholder="Table name" />
          <span class="pill" id="counts-pill">0 fields · 0 records</span>
          <span class="pill" id="source-pill">Last edit: SYSTEM</span>
          <input id="search-input" class="search-input" type="search" placeholder="Filter records..." />
          <button id="toggle-field-btn" class="secondary" type="button">+ Field</button>
          <button id="add-record-btn" type="button">+ Record</button>
        </div>
        <div class="drawer" id="field-drawer">
          <strong id="field-drawer-title" style="font-size:12px;">Add Field</strong>
          <input id="field-name-input" type="text" placeholder="Field name" />
          <select id="field-type-select">
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="date">date</option>
          </select>
          <label>
            <input id="field-required-input" type="checkbox" />
            Required
          </label>
          <button id="field-submit-btn" type="button">Add Field</button>
          <button id="field-cancel-btn" class="secondary" type="button">Cancel</button>
        </div>
        <div class="toast" id="error-toast">
          <span id="error-toast-msg"></span>
          <button id="error-toast-close" class="danger-ghost" type="button">×</button>
        </div>
        <div class="grid-wrap">
          <table class="data-grid" id="data-grid">
            <thead id="grid-head"></thead>
            <tbody id="grid-body"></tbody>
          </table>
          <div class="grid-footer">
            <button id="footer-add-record-btn" class="secondary" type="button">+ Add Record</button>
          </div>
        </div>
      </main>
    </div>

    <script>
      const tableListEl = document.getElementById("table-list");
      const newTableNameEl = document.getElementById("new-table-name");
      const newTableBtnEl = document.getElementById("new-table-btn");
      const tableTitleEl = document.getElementById("table-title");
      const countsPillEl = document.getElementById("counts-pill");
      const sourcePillEl = document.getElementById("source-pill");
      const searchInputEl = document.getElementById("search-input");
      const toggleFieldBtnEl = document.getElementById("toggle-field-btn");
      const addRecordBtnEl = document.getElementById("add-record-btn");
      const footerAddRecordBtnEl = document.getElementById("footer-add-record-btn");
      const fieldDrawerEl = document.getElementById("field-drawer");
      const fieldDrawerTitleEl = document.getElementById("field-drawer-title");
      const fieldNameInputEl = document.getElementById("field-name-input");
      const fieldTypeSelectEl = document.getElementById("field-type-select");
      const fieldRequiredInputEl = document.getElementById("field-required-input");
      const fieldSubmitBtnEl = document.getElementById("field-submit-btn");
      const fieldCancelBtnEl = document.getElementById("field-cancel-btn");
      const errorToastEl = document.getElementById("error-toast");
      const errorToastMsgEl = document.getElementById("error-toast-msg");
      const errorToastCloseEl = document.getElementById("error-toast-close");
      const gridHeadEl = document.getElementById("grid-head");
      const gridBodyEl = document.getElementById("grid-body");
      const endpointEl = document.getElementById("aep-endpoint");
      const clientsEl = document.getElementById("aep-clients-label");

      let latestState = null;
      let currentTableId = "";
      let aepEndpointUrl = "";
      let editingFieldId = null;
      let draftRecordOpen = false;
      let draftValues = {};
      let titleTimer = null;
      let lastLocalEditAt = 0;

      function showError(msg) {
        errorToastMsgEl.textContent = msg || "Request failed";
        errorToastEl.classList.add("visible");
      }

      function clearError() {
        errorToastEl.classList.remove("visible");
      }

      errorToastCloseEl.addEventListener("click", clearError);

      async function apiJson(url, options) {
        clearError();
        const res = await fetch(url, options);
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          const errMsg = (data && data.error) ? data.error : ("HTTP " + res.status);
          showError(errMsg);
          throw new Error(errMsg);
        }
        return data;
      }

      function openAddFieldDrawer() {
        editingFieldId = null;
        fieldDrawerTitleEl.textContent = "Add Field";
        fieldSubmitBtnEl.textContent = "Add Field";
        fieldNameInputEl.value = "";
        fieldTypeSelectEl.value = "text";
        fieldRequiredInputEl.checked = false;
        fieldDrawerEl.classList.add("open");
        fieldNameInputEl.focus();
      }

      function openEditFieldDrawer(field) {
        editingFieldId = field.id;
        fieldDrawerTitleEl.textContent = "Edit Field: " + field.name;
        fieldSubmitBtnEl.textContent = "Save Field";
        fieldNameInputEl.value = field.name;
        fieldTypeSelectEl.value = field.type;
        fieldRequiredInputEl.checked = Boolean(field.required);
        fieldDrawerEl.classList.add("open");
        fieldNameInputEl.focus();
      }

      function closeFieldDrawer() {
        editingFieldId = null;
        fieldDrawerEl.classList.remove("open");
      }

      toggleFieldBtnEl.addEventListener("click", () => {
        if (fieldDrawerEl.classList.contains("open") && editingFieldId === null) {
          closeFieldDrawer();
        } else {
          openAddFieldDrawer();
        }
      });

      fieldCancelBtnEl.addEventListener("click", closeFieldDrawer);

      async function submitFieldDrawer() {
        if (!currentTableId) return;
        const name = fieldNameInputEl.value.trim();
        if (!name) {
          showError("Field name is required");
          return;
        }
        const payload = {
          name,
          type: fieldTypeSelectEl.value,
          required: fieldRequiredInputEl.checked,
        };
        if (editingFieldId) {
          await apiJson(
            "/api/tables/" + encodeURIComponent(currentTableId) + "/fields/" + encodeURIComponent(editingFieldId),
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
        } else {
          await apiJson("/api/tables/" + encodeURIComponent(currentTableId) + "/fields", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        closeFieldDrawer();
      }

      fieldSubmitBtnEl.addEventListener("click", () => {
        void submitFieldDrawer().catch(() => {});
      });
      fieldNameInputEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          void submitFieldDrawer().catch(() => {});
        }
      });

      function defaultValueForType(type) {
        if (type === "number") return "";
        if (type === "boolean") return false;
        return "";
      }

      function initDraftValues(table) {
        draftValues = {};
        for (const f of table.fields) {
          draftValues[f.id] = defaultValueForType(f.type);
        }
      }

      function hasRequiredValueFields(table) {
        return table.fields.some((f) => f.required && (f.type === "text" || f.type === "number" || f.type === "date"));
      }

      async function handleAddRecordClick() {
        if (!latestState || !latestState.activeTable) return;
        const table = latestState.activeTable;
        if (hasRequiredValueFields(table)) {
          draftRecordOpen = true;
          initDraftValues(table);
          renderGrid(table);
          const firstDraftInput = gridBodyEl.querySelector("tr.draft-row input");
          if (firstDraftInput) firstDraftInput.focus();
          return;
        }
        await apiJson("/api/tables/" + encodeURIComponent(table.id) + "/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: {} }),
        });
      }

      addRecordBtnEl.addEventListener("click", () => {
        void handleAddRecordClick().catch(() => {});
      });
      footerAddRecordBtnEl.addEventListener("click", () => {
        void handleAddRecordClick().catch(() => {});
      });

      function createCellEditor(field, value, onCommit, isDraft) {
        if (field.type === "boolean") {
          const wrap = document.createElement("div");
          wrap.className = "cell-check-wrap";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "cell-check";
          cb.checked = Boolean(value);
          cb.addEventListener("change", () => {
            onCommit(cb.checked);
          });
          wrap.appendChild(cb);
          return wrap;
        }

        const input = document.createElement("input");
        input.className = "cell-input";
        if (field.type === "number") {
          input.type = "number";
          input.step = "any";
          input.value = value === null || value === undefined ? "" : String(value);
        } else if (field.type === "date") {
          input.type = "date";
          input.value = typeof value === "string" ? value : "";
        } else {
          input.type = "text";
          input.value = typeof value === "string" ? value : (value == null ? "" : String(value));
        }

        if (isDraft) {
          input.placeholder = field.required ? field.name + " *" : field.name;
          input.addEventListener("input", () => {
            onCommit(input.value);
          });
        } else {
          const commit = () => {
            const raw = input.value;
            const nextVal = field.type === "number" ? (raw.trim() === "" ? null : raw) : raw;
            onCommit(nextVal);
          };
          if (field.type === "date") {
            input.addEventListener("change", commit);
          } else {
            input.addEventListener("blur", commit);
            input.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter") {
                input.blur();
              }
            });
          }
        }
        return input;
      }

      function renderGrid(table) {
        const activeFocus = document.activeElement;
        const focusCellKey = activeFocus && activeFocus.dataset ? activeFocus.dataset.cellKey : null;

        gridHeadEl.innerHTML = "";
        const headRow = document.createElement("tr");

        const idTh = document.createElement("th");
        idTh.className = "row-id-col";
        idTh.textContent = "ID";
        headRow.appendChild(idTh);

        for (const field of table.fields) {
          const th = document.createElement("th");
          const wrap = document.createElement("div");
          wrap.className = "col-head";

          const title = document.createElement("div");
          title.className = "col-title";
          const nameSpan = document.createElement("span");
          nameSpan.className = "col-name";
          nameSpan.textContent = field.name;
          title.appendChild(nameSpan);

          if (field.required) {
            const star = document.createElement("span");
            star.className = "req-star";
            star.textContent = "*";
            star.title = "Required";
            title.appendChild(star);
          }

          const badge = document.createElement("span");
          badge.className = "type-badge";
          badge.textContent = field.type;
          title.appendChild(badge);

          const actions = document.createElement("div");
          actions.className = "col-actions";

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "icon-ghost";
          editBtn.title = "Edit field";
          editBtn.textContent = "✎";
          editBtn.addEventListener("click", () => openEditFieldDrawer(field));
          actions.appendChild(editBtn);

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "danger-ghost";
          delBtn.title = "Delete field";
          delBtn.textContent = "×";
          delBtn.addEventListener("click", () => {
            void apiJson(
              "/api/tables/" + encodeURIComponent(table.id) + "/fields/" + encodeURIComponent(field.id),
              { method: "DELETE" },
            ).catch(() => {});
          });
          actions.appendChild(delBtn);

          wrap.appendChild(title);
          wrap.appendChild(actions);
          th.appendChild(wrap);
          headRow.appendChild(th);
        }

        const actTh = document.createElement("th");
        actTh.className = "row-act-col";
        actTh.textContent = "Actions";
        headRow.appendChild(actTh);
        gridHeadEl.appendChild(headRow);

        const filterText = (searchInputEl.value || "").trim().toLowerCase();
        const filteredRecords = filterText
          ? table.records.filter((rec) => {
              if (rec.id.toLowerCase().includes(filterText)) return true;
              return table.fields.some((f) => {
                const v = rec.values[f.id];
                return v !== null && v !== undefined && String(v).toLowerCase().includes(filterText);
              });
            })
          : table.records;

        gridBodyEl.innerHTML = "";
        if (filteredRecords.length === 0 && !draftRecordOpen) {
          const emptyTr = document.createElement("tr");
          const emptyTd = document.createElement("td");
          emptyTd.colSpan = table.fields.length + 2;
          emptyTd.className = "empty-state";
          emptyTd.textContent = filterText
            ? "No records match the current filter."
            : "No records yet. Click + Record to add one.";
          emptyTr.appendChild(emptyTd);
          gridBodyEl.appendChild(emptyTr);
          return;
        }

        for (const rec of filteredRecords) {
          const tr = document.createElement("tr");
          const idTd = document.createElement("td");
          idTd.className = "row-id-col";
          idTd.textContent = rec.id;
          tr.appendChild(idTd);

          for (const field of table.fields) {
            const td = document.createElement("td");
            const currentVal = rec.values[field.id];
            const cellKey = table.id + ":" + rec.id + ":" + field.id;
            const editor = createCellEditor(
              field,
              currentVal,
              (nextVal) => {
                const normalizedCurrent =
                  field.type === "number"
                    ? currentVal
                    : field.type === "boolean"
                      ? Boolean(currentVal)
                      : currentVal ?? "";
                const normalizedNext =
                  field.type === "number"
                    ? (nextVal === null || nextVal === "" ? null : Number(nextVal))
                    : nextVal;
                if (normalizedCurrent === normalizedNext) {
                  return;
                }
                lastLocalEditAt = Date.now();
                void apiJson(
                  "/api/tables/" + encodeURIComponent(table.id) + "/records/" + encodeURIComponent(rec.id),
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ values: { [field.id]: nextVal } }),
                  },
                ).catch(() => {
                  renderGrid(table);
                });
              },
              false,
            );
            const focusable = editor.tagName === "INPUT" ? editor : editor.querySelector("input");
            if (focusable) {
              focusable.dataset.cellKey = cellKey;
            }
            td.appendChild(editor);
            tr.appendChild(td);
          }

          const actTd = document.createElement("td");
          actTd.className = "row-act-col";
          const delRowBtn = document.createElement("button");
          delRowBtn.type = "button";
          delRowBtn.className = "danger-ghost";
          delRowBtn.title = "Delete record";
          delRowBtn.textContent = "×";
          delRowBtn.addEventListener("click", () => {
            void apiJson(
              "/api/tables/" + encodeURIComponent(table.id) + "/records/" + encodeURIComponent(rec.id),
              { method: "DELETE" },
            ).catch(() => {});
          });
          actTd.appendChild(delRowBtn);
          tr.appendChild(actTd);
          gridBodyEl.appendChild(tr);
        }

        if (draftRecordOpen) {
          const tr = document.createElement("tr");
          tr.className = "draft-row";

          const idTd = document.createElement("td");
          idTd.className = "row-id-col";
          idTd.textContent = "new";
          tr.appendChild(idTd);

          const submitDraft = async () => {
            const payload = {};
            for (const f of table.fields) {
              const raw = draftValues[f.id];
              if (f.type === "number") {
                payload[f.id] = raw === "" || raw === null || raw === undefined ? null : Number(raw);
              } else if (f.type === "boolean") {
                payload[f.id] = Boolean(raw);
              } else {
                payload[f.id] = raw ?? "";
              }
            }
            await apiJson("/api/tables/" + encodeURIComponent(table.id) + "/records", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ values: payload }),
            });
            draftRecordOpen = false;
            draftValues = {};
          };

          for (const field of table.fields) {
            const td = document.createElement("td");
            const editor = createCellEditor(
              field,
              draftValues[field.id],
              (val) => {
                draftValues[field.id] = val;
              },
              true,
            );
            const focusable = editor.tagName === "INPUT" ? editor : editor.querySelector("input");
            if (focusable && focusable.type !== "checkbox") {
              focusable.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") {
                  void submitDraft().catch(() => {});
                } else if (ev.key === "Escape") {
                  draftRecordOpen = false;
                  renderGrid(table);
                }
              });
            }
            td.appendChild(editor);
            tr.appendChild(td);
          }

          const actTd = document.createElement("td");
          actTd.className = "row-act-col";
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.style.padding = "4px 8px";
          saveBtn.style.fontSize = "12px";
          saveBtn.textContent = "Add";
          saveBtn.addEventListener("click", () => {
            void submitDraft().catch(() => {});
          });
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "danger-ghost";
          cancelBtn.textContent = "×";
          cancelBtn.title = "Cancel";
          cancelBtn.addEventListener("click", () => {
            draftRecordOpen = false;
            renderGrid(table);
          });
          actTd.appendChild(saveBtn);
          actTd.appendChild(cancelBtn);
          tr.appendChild(actTd);
          gridBodyEl.appendChild(tr);
        }

        if (focusCellKey) {
          const target = gridBodyEl.querySelector('[data-cell-key="' + CSS.escape(focusCellKey) + '"]');
          if (target) target.focus();
        }
      }

      function applyState(state) {
        if (!state || !state.activeTable) return;
        latestState = state;
        const table = state.activeTable;
        const switched = table.id !== currentTableId;
        currentTableId = table.id;
        if (switched) {
          draftRecordOpen = false;
          closeFieldDrawer();
        }

        if (state.aepEndpoint) {
          aepEndpointUrl = state.aepEndpoint;
          endpointEl.textContent = "AEP: " + state.aepEndpoint;
        }
        if (typeof state.aepClients === "number") {
          clientsEl.textContent = "AEP Clients: " + state.aepClients;
        }

        document.title = table.name + " — AEP Tables";

        const typingInTitle =
          !switched &&
          table.lastUpdatedBy === "web" &&
          document.activeElement === tableTitleEl &&
          Date.now() - lastLocalEditAt < 1000;
        if (!typingInTitle && tableTitleEl.value !== table.name) {
          tableTitleEl.value = table.name;
        }

        countsPillEl.textContent =
          table.fields.length + " field" + (table.fields.length === 1 ? "" : "s") +
          " · " +
          table.records.length + " record" + (table.records.length === 1 ? "" : "s");

        sourcePillEl.textContent = "Last edit: " + String(table.lastUpdatedBy || "system").toUpperCase();
        sourcePillEl.className = table.lastUpdatedBy === "aep" ? "pill aep" : "pill";

        tableListEl.innerHTML = "";
        for (const item of state.tables || []) {
          const row = document.createElement("div");
          row.className = "table-item" + (item.active ? " active" : "");

          const meta = document.createElement("div");
          meta.className = "table-meta";
          const nameDiv = document.createElement("div");
          nameDiv.className = "table-name";
          nameDiv.textContent = item.name;
          const subDiv = document.createElement("div");
          subDiv.className = "table-sub";
          subDiv.textContent = item.fieldCount + " fields · " + item.recordCount + " records";
          meta.appendChild(nameDiv);
          meta.appendChild(subDiv);
          meta.addEventListener("click", () => {
            void apiJson("/api/tables/" + encodeURIComponent(item.id) + "/open", { method: "POST" }).catch(() => {});
          });

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "danger-ghost";
          delBtn.title = "Delete table";
          delBtn.textContent = "×";
          delBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            void apiJson("/api/tables/" + encodeURIComponent(item.id), { method: "DELETE" }).catch(() => {});
          });

          row.appendChild(meta);
          row.appendChild(delBtn);
          tableListEl.appendChild(row);
        }

        const editingCell =
          !switched &&
          table.lastUpdatedBy === "web" &&
          document.activeElement &&
          gridBodyEl.contains(document.activeElement) &&
          Date.now() - lastLocalEditAt < 400;
        if (!editingCell) {
          renderGrid(table);
        }
      }

      endpointEl.addEventListener("click", () => {
        if (!aepEndpointUrl) return;
        navigator.clipboard?.writeText(aepEndpointUrl).then(() => {
          endpointEl.textContent = "Copied: " + aepEndpointUrl;
          setTimeout(() => {
            endpointEl.textContent = "AEP: " + aepEndpointUrl;
          }, 1200);
        }).catch(() => {});
      });

      tableTitleEl.addEventListener("input", () => {
        if (!currentTableId) return;
        lastLocalEditAt = Date.now();
        clearTimeout(titleTimer);
        titleTimer = setTimeout(() => {
          const nextName = tableTitleEl.value.trim();
          if (!nextName) return;
          void apiJson("/api/tables/" + encodeURIComponent(currentTableId), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: nextName }),
          }).catch(() => {});
        }, 300);
      });

      searchInputEl.addEventListener("input", () => {
        if (latestState && latestState.activeTable) {
          renderGrid(latestState.activeTable);
        }
      });

      async function createNewTable() {
        const name = newTableNameEl.value.trim() || "Untitled Table";
        newTableNameEl.value = "";
        await apiJson("/api/tables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }

      newTableBtnEl.addEventListener("click", () => {
        void createNewTable().catch(() => {});
      });
      newTableNameEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          void createNewTable().catch(() => {});
        }
      });

      const es = new EventSource("/api/events");
      es.addEventListener("state", (ev) => {
        try {
          applyState(JSON.parse(ev.data));
        } catch {
          // Ignore malformed SSE payload
        }
      });

      void fetch("/api/state")
        .then((r) => r.json())
        .then((s) => applyState(s))
        .catch(() => {});
    </script>
  </body>
</html>`;
}
