import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { AEP_ERROR_CODES, AepError, type AepNode, type NodeUpdatedParams } from "aep-node";
import { AepClient } from "aep-node/client";
import { connectWebSocket } from "aep-node/transport";
import { TablesAepServer } from "../dist/tables-aep-server.js";

function findChild(node: AepNode, id: string): AepNode | undefined {
  if (node.kind === "channel" || !node.children) {
    return undefined;
  }
  return node.children.find((c) => c.id === id);
}

describe("TablesAepServer (AEP + HTTP/SSE Webapp)", () => {
  const tempDirs: string[] = [];

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves human webapp, discovery manifest, mountable AEP tree, typed CRUD, live SSE/AEP sync, and persistence", async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "aep-tables-"));
    tempDirs.push(dataDir);

    const server = new TablesAepServer({
      port: 0,
      dataDir,
      persist: true,
      seedDefault: true,
    });
    const started = await server.start();

    const transport = await connectWebSocket(started.wsUrl, { mode: "binary" });
    const client = await AepClient.connect(transport, {
      syncTree: true,
      clientInfo: { name: "tables-test-client", version: "1.0.0-beta.0" },
    });

    const sseController = new AbortController();
    const ssePayloads: Array<{
      activeTableId: string;
      activeTable: { id: string; name: string; records: Array<{ id: string; values: Record<string, unknown> }> };
      aepClients: number;
    }> = [];

    const sseDone = (async () => {
      const sseRes = await fetch(`${started.httpUrl}/api/events`, {
        signal: sseController.signal,
      });
      assert.equal(sseRes.status, 200);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (dataLine) {
              ssePayloads.push(JSON.parse(dataLine.slice("data: ".length)));
            }
          }
        }
      } catch {
        // Expected on abort
      }
    })();

    try {
      // 1. Verify HTML webapp & /.well-known/aep.json discovery
      const htmlRes = await fetch(`${started.httpUrl}/`);
      assert.equal(htmlRes.status, 200);
      const html = await htmlRes.text();
      assert.ok(html.includes("AEP Tables"));
      assert.ok(html.includes('EventSource("/api/events")'));

      const manifestRes = await fetch(started.discoveryUrl);
      assert.equal(manifestRes.status, 200);
      const manifest = (await manifestRes.json()) as {
        protocolVersion: string;
        aepEndpoint: string;
        rootPath: string;
        mode: string;
        name: string;
      };
      assert.equal(manifest.protocolVersion, "1.0.0-beta.0");
      assert.equal(manifest.aepEndpoint, started.wsUrl);
      assert.equal(manifest.rootPath, "/tables");
      assert.equal(manifest.mode, "binary");
      assert.equal(manifest.name, "aep-tables-app");

      // Starter tasks.json persisted on disk
      assert.ok(existsSync(path.join(dataDir, "tasks.json")));

      // Verify tree root contains ONLY interface#tables (zero OUs -> mount-compatible)
      const tree = await client.getTree({ path: "/" });
      assert.equal(tree.node.kind, "body");
      assert.equal(tree.node.children.length, 1);
      assert.equal(tree.node.children[0]?.kind, "interface");
      assert.equal(tree.node.children[0]?.id, "tables");

      // Verify tabular grid structure on seeded Tasks table
      const gridNode = (await client.getNode("/tables/active-table/grid")).node;
      assert.equal(gridNode.kind, "structure");
      assert.equal(gridNode.type, "table");
      const titleCellVal = (await client.getNode("/tables/active-table/grid/row-rec-1/cell-title/value")).node;
      assert.equal(titleCellVal.kind, "editable");
      assert.equal(titleCellVal.type, "textField");
      assert.equal(titleCellVal.state?.value, "Verify AEP table endpoint");

      const doneCellVal = (await client.getNode("/tables/active-table/grid/row-rec-1/cell-done/value")).node;
      assert.equal(doneCellVal.type, "checkbox");
      assert.equal(doneCellVal.state?.value, true);

      // 2. Create table over AEP with all 4 basic datatypes
      const created = await client.invoke<{ id: string; name: string; fields: Array<{ id: string }> }>(
        "/tables",
        "createTable",
        {
          name: "Contacts",
          description: "People directory",
          fields: [
            { id: "full_name", name: "Full Name", type: "text", required: true },
            { id: "age", name: "Age", type: "number" },
            { id: "active", name: "Active", type: "boolean" },
            { id: "joined", name: "Joined", type: "date" },
          ],
          records: [
            {
              values: {
                full_name: "Alice",
                age: 34,
                active: true,
                joined: "2025-04-12",
              },
            },
          ],
        },
      );
      assert.equal(created.result.id, "contacts");
      assert.ok(existsSync(path.join(dataDir, "contacts.json")));

      // 3. Field CRUD via /tables/active-table and direct column nodes
      await client.invoke("/tables/active-table", "addField", {
        id: "score",
        name: "Score",
        type: "number",
        defaultValue: 100,
      });
      await client.invoke("/tables/active-table/grid/col-score", "update", {
        name: "Rating",
      });

      // Add, update, setCell, query, and delete records via AEP
      const rec2 = await client.invoke<{ id: string; values: Record<string, unknown> }>(
        "/tables/active-table",
        "addRecord",
        {
          values: {
            full_name: "Bob",
            age: "29",
            active: false,
            joined: "2026-01-15",
            score: 88,
          },
        },
      );
      assert.equal(rec2.result.values["age"], 29);

      await client.invoke(
        `/tables/active-table/grid/row-${rec2.result.id}/cell-active/value`,
        "setValue",
        { value: true },
      );

      await client.invoke(`/tables/active-table/grid/row-${rec2.result.id}`, "update", {
        values: { score: 95 },
      });

      const queried = await client.invoke<{
        total: number;
        records: Array<{ id: string; values: Record<string, unknown> }>;
      }>("/tables/active-table", "queryRecords", {
        filter: { active: true },
        sortBy: "age",
        sortDir: "asc",
      });
      assert.equal(queried.result.total, 2);
      assert.equal(queried.result.records[0]?.values["full_name"], "Bob");
      assert.equal(queried.result.records[1]?.values["full_name"], "Alice");

      const searched = await client.invoke<{
        total: number;
        records: Array<{ values: Record<string, unknown> }>;
      }>("/tables/active-table", "queryRecords", {
        search: "alice",
      });
      assert.equal(searched.result.total, 1);

      await client.invoke("/tables/active-table/grid/col-score", "delete", {});
      const afterColDel = await client.invoke<{ fields: Array<{ id: string }> }>(
        "/tables/active-table",
        "getTable",
        {},
      );
      assert.equal(afterColDel.result.fields.some((f) => f.id === "score"), false);

      // Sidebar invocations & table name editable
      await client.invoke("/tables/active-table/name", "setValue", { value: "Team Contacts" });
      await client.invoke("/tables/sidebar/table-list/table-tasks/open", "invoke", {});
      const listed = await client.invoke<{ activeTableId: string }>("/tables", "listTables", {});
      assert.equal(listed.result.activeTableId, "tasks");

      await client.invoke("/tables/sidebar/new-table", "invoke", { name: "Quick Notes" });
      assert.ok(existsSync(path.join(dataDir, "quick-notes.json")));

      await client.invoke("/tables/active-table/add-field", "invoke", {
        name: "Note",
        type: "text",
      });
      await client.invoke("/tables/active-table/add-record", "invoke", {
        values: { name: "Row 1", note: "Hello" },
      });

      // Verify SSE pushed live updates from AEP mutations
      await new Promise((r) => setTimeout(r, 80));
      assert.ok(ssePayloads.some((p) => p.activeTableId === "contacts"));
      assert.ok(ssePayloads.some((p) => p.activeTableId === "quick-notes"));

      // 4. Verify REST Web UI mutation syncs back to AEP tree via node.updated
      await client.invoke("/tables", "openTable", { id: "contacts" });
      const aepUpdates: NodeUpdatedParams[] = [];
      const unsub = client.onNodeUpdated((ev) => aepUpdates.push(ev));

      const putRes = await fetch(`${started.httpUrl}/api/tables/contacts/records/rec-1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: { age: 35, active: false },
        }),
      });
      assert.equal(putRes.status, 200);
      await new Promise((r) => setTimeout(r, 80));
      unsub();

      assert.ok(aepUpdates.length >= 1, "Expected AEP node.updated after Web UI PUT");
      const ageNode = await client.getNode("/tables/active-table/grid/row-rec-1/cell-age/value");
      assert.equal(ageNode.node.state?.value, 35);

      const gridAfterWeb = await client.getNode("/tables/active-table/grid");
      const row1 = findChild(gridAfterWeb.node, "row-rec-1");
      assert.ok(row1);

      // 5. Validation errors produce INVALID_PARAMS over AEP and HTTP 400 over REST
      await assert.rejects(
        () =>
          client.invoke("/tables/active-table", "addRecord", {
            values: { full_name: "" },
          }),
        (err: unknown) => err instanceof AepError && err.code === AEP_ERROR_CODES.INVALID_PARAMS,
      );
      await assert.rejects(
        () =>
          client.invoke("/tables/active-table", "setCell", {
            recordId: "rec-1",
            fieldId: "age",
            value: "not-a-number",
          }),
        (err: unknown) => err instanceof AepError && err.code === AEP_ERROR_CODES.INVALID_PARAMS,
      );
      await assert.rejects(
        () =>
          client.invoke("/tables/active-table", "setCell", {
            recordId: "rec-1",
            fieldId: "joined",
            value: "2026-02-30",
          }),
        (err: unknown) => err instanceof AepError && err.code === AEP_ERROR_CODES.INVALID_PARAMS,
      );

      const badRestRes = await fetch(`${started.httpUrl}/api/tables/contacts/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: { full_name: "Bad Date", joined: "not-a-date" },
        }),
      });
      assert.equal(badRestRes.status, 400);

      // Delete table over AEP and REST
      await client.invoke("/tables", "deleteTable", { id: "quick-notes" });
      assert.equal(existsSync(path.join(dataDir, "quick-notes.json")), false);

      const postTableRes = await fetch(`${started.httpUrl}/api/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Web Temp" }),
      });
      assert.equal(postTableRes.status, 201);
      const delTableRes = await fetch(`${started.httpUrl}/api/tables/web-temp`, {
        method: "DELETE",
      });
      assert.equal(delTableRes.status, 200);
    } finally {
      sseController.abort();
      await sseDone.catch(() => {});
      await client.close();
      await server.close();
    }

    // 6. Verify disk persistence reload across server restart
    const restarted = new TablesAepServer({
      port: 0,
      dataDir,
      persist: true,
      seedDefault: true,
    });
    const restartedInfo = await restarted.start();
    try {
      const stateRes = await fetch(`${restartedInfo.httpUrl}/api/state`);
      assert.equal(stateRes.status, 200);
      const state = (await stateRes.json()) as {
        tables: Array<{ id: string; name: string }>;
      };
      const contacts = state.tables.find((t) => t.id === "contacts");
      assert.ok(contacts);
      assert.equal(contacts.name, "Team Contacts");
      const reloadedContacts = restarted.store.getTable("contacts");
      assert.equal(reloadedContacts.records[0]?.values["age"], 35);
    } finally {
      await restarted.close();
    }
  });
});
