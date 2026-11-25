import http, { type IncomingMessage, type ServerResponse } from "node:http";
import {
  AEP_ERROR_CODES,
  AEP_PROTOCOL_VERSION,
  AepError,
  type AepNode,
  type AepValue,
  type BodyChild,
  type CoreEditableType,
  type InterfaceNode,
  type StructureElementNode,
} from "aep-node";
import { AepServer, type MethodHandlerContext } from "aep-node/server";
import { WebSocketTransportServer } from "aep-node/transport";
import {
  isValidFieldType,
  TableStore,
  type FieldDefinition,
  type FieldType,
  type TableChangeEvent,
  type TablesStoreState,
} from "./table-store.js";
import { renderTablesAppHtml } from "./webapp.js";

export interface TablesAepServerOptions {
  host?: string;
  port?: number;
  wsPath?: string;
  dataDir?: string;
  persist?: boolean;
  seedDefault?: boolean;
}

export interface TablesAepServerStartResult {
  httpUrl: string;
  wsUrl: string;
  discoveryUrl: string;
  host: string;
  port: number;
  wsPath: string;
  dataDir: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectObject(params: unknown, context: string): Record<string, unknown> {
  if (params === undefined) {
    return {};
  }
  if (!isPlainObject(params)) {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} params must be an object`);
  }
  return params;
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  context: string,
  allowEmpty = false,
): string {
  const val = obj[key];
  if (typeof val !== "string" || (!allowEmpty && val.trim().length === 0)) {
    throw new AepError(
      AEP_ERROR_CODES.INVALID_PARAMS,
      `${context} requires ${allowEmpty ? "string" : "non-empty string"} "${key}"`,
    );
  }
  return val;
}

function optionalString(obj: Record<string, unknown>, key: string, context: string): string | undefined {
  const val = obj[key];
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== "string") {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "${key}" must be a string`);
  }
  return val;
}

function optionalBoolean(obj: Record<string, unknown>, key: string, context: string): boolean | undefined {
  const val = obj[key];
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== "boolean") {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "${key}" must be a boolean`);
  }
  return val;
}

function optionalInt(obj: Record<string, unknown>, key: string, context: string): number | undefined {
  const val = obj[key];
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== "number" || !Number.isInteger(val)) {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "${key}" must be an integer`);
  }
  return val;
}

function optionalObject(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (val === undefined) {
    return undefined;
  }
  if (!isPlainObject(val)) {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "${key}" must be an object`);
  }
  return val;
}

function editableTypeForField(type: FieldType): CoreEditableType {
  switch (type) {
    case "text":
      return "textField";
    case "number":
      return "numberField";
    case "boolean":
      return "checkbox";
    case "date":
      return "dateField";
  }
}

function parseCreateFields(
  raw: unknown,
  context: string,
): Array<{ id?: string; name: string; type: FieldType; required?: boolean }> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "fields" must be an array`);
  }
  return raw.map((item, idx) => {
    if (!isPlainObject(item)) {
      throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} fields[${idx}] must be an object`);
    }
    const name = requireString(item, "name", `${context}.fields[${idx}]`);
    const rawType = item["type"];
    if (!isValidFieldType(rawType)) {
      throw new AepError(
        AEP_ERROR_CODES.INVALID_PARAMS,
        `${context}.fields[${idx}] "type" must be one of: text, number, boolean, date`,
      );
    }
    const id = optionalString(item, "id", `${context}.fields[${idx}]`);
    const required = optionalBoolean(item, "required", `${context}.fields[${idx}]`);
    return {
      name,
      type: rawType,
      ...(id !== undefined ? { id } : {}),
      ...(required !== undefined ? { required } : {}),
    };
  });
}

function parseCreateRecords(
  raw: unknown,
  context: string,
): Array<{ id?: string; values?: Record<string, unknown> }> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} "records" must be an array`);
  }
  return raw.map((item, idx) => {
    if (!isPlainObject(item)) {
      throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, `${context} records[${idx}] must be an object`);
    }
    const id = optionalString(item, "id", `${context}.records[${idx}]`);
    const values = optionalObject(item, "values", `${context}.records[${idx}]`);
    return {
      ...(id !== undefined ? { id } : {}),
      ...(values !== undefined ? { values } : {}),
    };
  });
}

function buildFieldColumnNode(field: FieldDefinition): StructureElementNode {
  return {
    id: `col-${field.id}`,
    kind: "structure",
    type: "column",
    properties: {
      label: field.name,
      required: field.required,
    },
    meta: {
      "field.id": field.id,
      "field.type": field.type,
    },
    methods: [
      {
        name: "update",
        description: `Update field "${field.name}" (name, type, required)`,
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["text", "number", "boolean", "date"] },
            required: { type: "boolean" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "delete",
        description: `Delete field "${field.name}" from the active table`,
        sideEffects: "write",
      },
    ],
  };
}

function buildTablesInterfaceNode(state: TablesStoreState): InterfaceNode {
  const active = state.activeTable;

  const tableListItems: StructureElementNode[] = state.tables.map((t) => ({
    id: `table-${t.id}`,
    kind: "structure",
    type: "listItem",
    properties: {
      title: t.name,
      label: `${t.fieldCount} fields · ${t.recordCount} records`,
    },
    state: {
      selected: t.active,
    },
    meta: {
      "table.id": t.id,
      "table.fieldCount": t.fieldCount,
      "table.recordCount": t.recordCount,
    },
    children: [
      {
        id: "open",
        kind: "control",
        type: "button",
        properties: { label: "Open" },
        methods: [{ name: "invoke", description: `Open table ${t.id}`, sideEffects: "write" }],
      },
      {
        id: "delete",
        kind: "control",
        type: "button",
        properties: { label: "Delete" },
        methods: [{ name: "invoke", description: `Delete table ${t.id}`, sideEffects: "write" }],
      },
    ],
  }));

  const columnNodes: StructureElementNode[] = active.fields.map(buildFieldColumnNode);

  const rowNodes: StructureElementNode[] = active.records.map((rec) => {
    const cellNodes: StructureElementNode[] = active.fields.map((field) => {
      const value = rec.values[field.id] ?? null;
      return {
        id: `cell-${field.id}`,
        kind: "structure",
        type: "cell",
        properties: {
          label: field.name,
        },
        meta: {
          "field.id": field.id,
          "field.type": field.type,
          "record.id": rec.id,
        },
        children: [
          {
            id: "value",
            kind: "editable",
            type: editableTypeForField(field.type),
            properties: {
              label: field.name,
              required: field.required,
            },
            state: {
              value,
            },
            methods: [
              {
                name: "setValue",
                description: `Set "${field.name}" (${field.type}) on record "${rec.id}"`,
                inputSchema: {
                  type: "object",
                  required: ["value"],
                  properties: {
                    value: {},
                  },
                },
                sideEffects: "write",
              },
            ],
          },
        ],
      };
    });

    return {
      id: `row-${rec.id}`,
      kind: "structure",
      type: "row",
      meta: {
        "record.id": rec.id,
      },
      methods: [
        {
          name: "update",
          description: `Update values for record "${rec.id}"`,
          inputSchema: {
            type: "object",
            required: ["values"],
            properties: {
              values: { type: "object" },
            },
          },
          sideEffects: "write",
        },
        {
          name: "delete",
          description: `Delete record "${rec.id}"`,
          sideEffects: "write",
        },
      ],
      children: cellNodes,
    };
  });

  const gridNode: StructureElementNode = {
    id: "grid",
    kind: "structure",
    type: "table",
    properties: {
      title: active.name,
      rows: active.records.length,
      columns: active.fields.length,
    },
    children: [...columnNodes, ...rowNodes],
  };

  const activeTableNode: StructureElementNode = {
    id: "active-table",
    kind: "structure",
    type: "section",
    properties: {
      title: active.name,
      description: active.description,
    },
    meta: {
      "table.id": active.id,
      "table.fieldCount": active.fields.length,
      "table.recordCount": active.records.length,
      "table.lastUpdatedBy": active.lastUpdatedBy,
    },
    methods: [
      {
        name: "getTable",
        description: "Get the full active table schema and records (or specified tableId)",
        inputSchema: {
          type: "object",
          properties: { tableId: { type: "string" } },
        },
        sideEffects: "read",
      },
      {
        name: "rename",
        description: "Rename the active table and optionally update its description",
        inputSchema: {
          type: "object",
          required: ["name"],
          properties: {
            tableId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "addField",
        description: "Add a typed field column (text, number, boolean, date)",
        inputSchema: {
          type: "object",
          required: ["name", "type"],
          properties: {
            tableId: { type: "string" },
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["text", "number", "boolean", "date"] },
            required: { type: "boolean" },
            defaultValue: {},
          },
        },
        sideEffects: "write",
      },
      {
        name: "updateField",
        description: "Update a field's name, type, or required flag",
        inputSchema: {
          type: "object",
          required: ["fieldId"],
          properties: {
            tableId: { type: "string" },
            fieldId: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["text", "number", "boolean", "date"] },
            required: { type: "boolean" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "deleteField",
        description: "Delete a field column and its values from all records",
        inputSchema: {
          type: "object",
          required: ["fieldId"],
          properties: {
            tableId: { type: "string" },
            fieldId: { type: "string" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "addRecord",
        description: "Add a new record row with typed field values",
        inputSchema: {
          type: "object",
          properties: {
            tableId: { type: "string" },
            id: { type: "string" },
            values: { type: "object" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "updateRecord",
        description: "Update one or more field values on an existing record",
        inputSchema: {
          type: "object",
          required: ["recordId", "values"],
          properties: {
            tableId: { type: "string" },
            recordId: { type: "string" },
            values: { type: "object" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "setCell",
        description: "Set a single field cell value on a record",
        inputSchema: {
          type: "object",
          required: ["recordId", "fieldId", "value"],
          properties: {
            tableId: { type: "string" },
            recordId: { type: "string" },
            fieldId: { type: "string" },
            value: {},
          },
        },
        sideEffects: "write",
      },
      {
        name: "deleteRecord",
        description: "Delete a record row by recordId",
        inputSchema: {
          type: "object",
          required: ["recordId"],
          properties: {
            tableId: { type: "string" },
            recordId: { type: "string" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "queryRecords",
        description: "Filter, search, sort, and paginate records in the table",
        inputSchema: {
          type: "object",
          properties: {
            tableId: { type: "string" },
            filter: { type: "object" },
            search: { type: "string" },
            sortBy: { type: "string" },
            sortDir: { type: "string", enum: ["asc", "desc"] },
            limit: { type: "integer", minimum: 0 },
            offset: { type: "integer", minimum: 0 },
          },
        },
        sideEffects: "read",
      },
    ],
    children: [
      {
        id: "name",
        kind: "editable",
        type: "textField",
        properties: {
          label: "Table Name",
          mediaType: "text/plain",
        },
        state: {
          value: active.name,
        },
        methods: [
          {
            name: "setValue",
            description: "Set the active table name",
            inputSchema: {
              type: "object",
              required: ["value"],
              properties: { value: { type: "string" } },
            },
            sideEffects: "write",
          },
        ],
      },
      {
        id: "add-field",
        kind: "control",
        type: "button",
        properties: {
          label: "Add Field",
        },
        methods: [
          {
            name: "invoke",
            description: "Add a field to the active table",
            inputSchema: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["text", "number", "boolean", "date"] },
                required: { type: "boolean" },
              },
            },
            sideEffects: "write",
          },
        ],
      },
      {
        id: "add-record",
        kind: "control",
        type: "button",
        properties: {
          label: "Add Record",
        },
        methods: [
          {
            name: "invoke",
            description: "Add a record to the active table",
            inputSchema: {
              type: "object",
              properties: {
                values: { type: "object" },
              },
            },
            sideEffects: "write",
          },
        ],
      },
      gridNode,
    ],
  };

  return {
    id: "tables",
    kind: "interface",
    type: "page",
    properties: {
      title: "AEP Tables",
      editable: true,
    },
    state: {
      activeTableId: state.activeTableId,
    },
    methods: [
      {
        name: "listTables",
        description: "List all tables and active table metadata",
        sideEffects: "read",
      },
      {
        name: "createTable",
        description: "Create a new table with optional fields and records, and switch to it",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            fields: { type: "array" },
            records: { type: "array" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "openTable",
        description: "Switch the active table by id",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        sideEffects: "write",
      },
      {
        name: "renameTable",
        description: "Rename a table by id",
        inputSchema: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
          },
        },
        sideEffects: "write",
      },
      {
        name: "deleteTable",
        description: "Delete a table by id",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        sideEffects: "write",
      },
    ],
    events: [
      { name: "tableCreated" },
      { name: "tableOpened" },
      { name: "tableUpdated" },
      { name: "tableDeleted" },
      { name: "fieldAdded" },
      { name: "fieldUpdated" },
      { name: "fieldDeleted" },
      { name: "recordAdded" },
      { name: "recordUpdated" },
      { name: "recordDeleted" },
    ],
    children: [
      {
        id: "sidebar",
        kind: "structure",
        type: "section",
        properties: {
          title: "Tables",
        },
        children: [
          {
            id: "new-table",
            kind: "control",
            type: "button",
            properties: {
              label: "New Table",
            },
            methods: [
              {
                name: "invoke",
                description: "Create a new table",
                inputSchema: {
                  type: "object",
                  properties: { name: { type: "string" } },
                },
                sideEffects: "write",
              },
            ],
          },
          {
            id: "table-list",
            kind: "structure",
            type: "list",
            children: tableListItems,
          },
        ],
      },
      activeTableNode,
    ],
  };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }
  const parsed = JSON.parse(text) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("Request JSON body must be an object");
  }
  return parsed;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

export class TablesAepServer {
  readonly store: TableStore;
  private readonly host: string;
  private readonly port: number;
  private readonly wsPath: string;
  private readonly dataDir: string;

  private aepServer?: AepServer;
  private wsServer?: WebSocketTransportServer;
  private httpServer?: http.Server;
  private readonly sseClients = new Set<ServerResponse>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private unsubscribeStore?: () => void;
  private syncChain: Promise<void> = Promise.resolve();
  private aepClientCount = 0;
  private boundPort?: number;
  private started = false;
  private closed = false;

  constructor(options: TablesAepServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 8781;
    this.wsPath = options.wsPath ?? "/aep";
    this.dataDir = options.dataDir ?? "data";
    this.store = new TableStore({
      dataDir: options.dataDir,
      persist: options.persist,
      seedDefault: options.seedDefault,
    });
  }

  get server(): AepServer | undefined {
    return this.aepServer;
  }

  async start(): Promise<TablesAepServerStartResult> {
    if (this.started && this.boundPort !== undefined) {
      return {
        httpUrl: `http://${this.host}:${this.boundPort}`,
        wsUrl: `ws://${this.host}:${this.boundPort}${this.wsPath}`,
        discoveryUrl: `http://${this.host}:${this.boundPort}/.well-known/aep.json`,
        host: this.host,
        port: this.boundPort,
        wsPath: this.wsPath,
        dataDir: this.dataDir,
      };
    }

    const initialBody: BodyChild[] = [buildTablesInterfaceNode(this.store.getState())];
    const aepServer = new AepServer({
      serverInfo: {
        name: "aep-tables-app",
        version: "1.0.0-beta.0",
        description: "Simple AEP-enabled Tables App for storing tables of typed records",
      },
      capabilities: {
        profile: "aep-core-streaming",
        vocabularies: ["aep.web"],
        sessions: {
          policy: "multi-controller",
          allowObserverStreams: true,
        },
      },
      head: {
        "aep.vocabularies": ["aep.web"],
      },
      body: initialBody,
    });
    this.aepServer = aepServer;
    this.registerAepMethods(aepServer);

    this.unsubscribeStore = this.store.onChange((ev) => {
      this.broadcastSseState();
      this.enqueueAepSync(ev);
    });

    const httpServer = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    this.httpServer = httpServer;

    const wsServer = new WebSocketTransportServer({
      server: httpServer,
      path: this.wsPath,
      mode: "binary",
    });
    this.wsServer = wsServer;

    wsServer.onConnection((transport) => {
      if (this.closed) {
        void transport.close("Server closed");
        return;
      }
      this.aepClientCount += 1;
      this.broadcastSseState();
      transport.onClose(() => {
        this.aepClientCount = Math.max(0, this.aepClientCount - 1);
        this.broadcastSseState();
      });
      aepServer.accept(transport);
    });

    this.heartbeatTimer = setInterval(() => {
      for (const res of this.sseClients) {
        if (!res.writableEnded) {
          res.write(": ping\n\n");
        }
      }
    }, 15_000);
    this.heartbeatTimer.unref?.();

    const actualPort = await new Promise<number>((resolve, reject) => {
      const onError = (err: Error) => {
        httpServer.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        const addr = httpServer.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          reject(new Error("Failed to resolve bound HTTP port"));
        }
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(this.port, this.host);
    });

    this.boundPort = actualPort;
    this.started = true;
    this.closed = false;

    return {
      httpUrl: `http://${this.host}:${actualPort}`,
      wsUrl: `ws://${this.host}:${actualPort}${this.wsPath}`,
      discoveryUrl: `http://${this.host}:${actualPort}/.well-known/aep.json`,
      host: this.host,
      port: actualPort,
      wsPath: this.wsPath,
      dataDir: this.dataDir,
    };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = undefined;
    }

    for (const res of this.sseClients) {
      try {
        res.end();
        res.destroy();
      } catch {
        // Ignore
      }
    }
    this.sseClients.clear();

    await this.syncChain.catch(() => {});

    if (this.wsServer) {
      await this.wsServer.close().catch(() => {});
      this.wsServer = undefined;
    }

    if (this.aepServer) {
      await this.aepServer.close().catch(() => {});
      this.aepServer = undefined;
    }

    if (this.httpServer) {
      const srv = this.httpServer;
      this.httpServer = undefined;
      srv.closeAllConnections?.();
      if (srv.listening) {
        await new Promise<void>((resolve) => {
          srv.close(() => resolve());
        });
      }
    }
  }

  private wrapMethod(
    fn: (params: unknown, ctx: MethodHandlerContext) => Promise<unknown> | unknown,
  ) {
    return async (params: unknown, ctx: MethodHandlerContext): Promise<unknown> => {
      try {
        return await fn(params, ctx);
      } catch (err) {
        if (err instanceof AepError) {
          throw err;
        }
        throw new AepError(
          AEP_ERROR_CODES.INVALID_PARAMS,
          err instanceof Error ? err.message : String(err),
        );
      }
    };
  }

  private resolveTargetTableId(obj: Record<string, unknown>, context: string): string {
    const tableId = optionalString(obj, "tableId", context);
    return tableId ?? this.store.getActiveTable().id;
  }

  private registerAepMethods(server: AepServer): void {
    // /tables methods
    server.registerMethod(
      "/tables",
      "listTables",
      this.wrapMethod(() => this.store.getState()),
    );

    server.registerMethod(
      "/tables",
      "createTable",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "createTable");
        const id = optionalString(obj, "id", "createTable");
        const name = optionalString(obj, "name", "createTable");
        const description = optionalString(obj, "description", "createTable");
        const fields = parseCreateFields(obj["fields"], "createTable");
        const records = parseCreateRecords(obj["records"], "createTable");
        return this.store.createTable({
          ...(id !== undefined ? { id } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(fields !== undefined ? { fields } : {}),
          ...(records !== undefined ? { records } : {}),
          source: "aep",
        });
      }),
    );

    server.registerMethod(
      "/tables",
      "openTable",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "openTable");
        const id = requireString(obj, "id", "openTable");
        return this.store.openTable(id, "aep");
      }),
    );

    server.registerMethod(
      "/tables",
      "renameTable",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "renameTable");
        const id = requireString(obj, "id", "renameTable");
        const name = requireString(obj, "name", "renameTable");
        const description = optionalString(obj, "description", "renameTable");
        return this.store.renameTable(id, name, description, "aep");
      }),
    );

    server.registerMethod(
      "/tables",
      "deleteTable",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "deleteTable");
        const id = requireString(obj, "id", "deleteTable");
        return this.store.deleteTable(id, "aep");
      }),
    );

    // /tables/sidebar/new-table
    server.registerMethod(
      "/tables/sidebar/new-table",
      "invoke",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "new-table.invoke");
        const name = optionalString(obj, "name", "new-table.invoke");
        return this.store.createTable({
          ...(name !== undefined ? { name } : {}),
          source: "aep",
        });
      }),
    );

    // /tables/active-table methods
    server.registerMethod(
      "/tables/active-table",
      "getTable",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "getTable");
        const tableId = optionalString(obj, "tableId", "getTable");
        return tableId ? this.store.getTable(tableId) : this.store.getActiveTable();
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "rename",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "rename");
        const tableId = this.resolveTargetTableId(obj, "rename");
        const name = requireString(obj, "name", "rename");
        const description = optionalString(obj, "description", "rename");
        return this.store.renameTable(tableId, name, description, "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "addField",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "addField");
        const tableId = this.resolveTargetTableId(obj, "addField");
        const id = optionalString(obj, "id", "addField");
        const name = requireString(obj, "name", "addField");
        const rawType = obj["type"];
        if (!isValidFieldType(rawType)) {
          throw new AepError(
            AEP_ERROR_CODES.INVALID_PARAMS,
            'addField "type" must be one of: text, number, boolean, date',
          );
        }
        const required = optionalBoolean(obj, "required", "addField");
        return this.store.addField(
          tableId,
          {
            ...(id !== undefined ? { id } : {}),
            name,
            type: rawType,
            ...(required !== undefined ? { required } : {}),
            ...(Object.prototype.hasOwnProperty.call(obj, "defaultValue")
              ? { defaultValue: obj["defaultValue"] }
              : {}),
          },
          "aep",
        );
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "updateField",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "updateField");
        const tableId = this.resolveTargetTableId(obj, "updateField");
        const fieldId = requireString(obj, "fieldId", "updateField");
        const name = optionalString(obj, "name", "updateField");
        const required = optionalBoolean(obj, "required", "updateField");
        let type: FieldType | undefined;
        if (obj["type"] !== undefined) {
          if (!isValidFieldType(obj["type"])) {
            throw new AepError(
              AEP_ERROR_CODES.INVALID_PARAMS,
              'updateField "type" must be one of: text, number, boolean, date',
            );
          }
          type = obj["type"];
        }
        return this.store.updateField(
          tableId,
          fieldId,
          {
            ...(name !== undefined ? { name } : {}),
            ...(type !== undefined ? { type } : {}),
            ...(required !== undefined ? { required } : {}),
          },
          "aep",
        );
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "deleteField",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "deleteField");
        const tableId = this.resolveTargetTableId(obj, "deleteField");
        const fieldId = requireString(obj, "fieldId", "deleteField");
        return this.store.deleteField(tableId, fieldId, "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "addRecord",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "addRecord");
        const tableId = this.resolveTargetTableId(obj, "addRecord");
        const id = optionalString(obj, "id", "addRecord");
        const values = optionalObject(obj, "values", "addRecord") ?? {};
        return this.store.addRecord(tableId, values, "aep", id);
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "updateRecord",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "updateRecord");
        const tableId = this.resolveTargetTableId(obj, "updateRecord");
        const recordId = requireString(obj, "recordId", "updateRecord");
        const values = optionalObject(obj, "values", "updateRecord");
        if (!values) {
          throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, 'updateRecord requires object "values"');
        }
        return this.store.updateRecord(tableId, recordId, values, "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "setCell",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "setCell");
        const tableId = this.resolveTargetTableId(obj, "setCell");
        const recordId = requireString(obj, "recordId", "setCell");
        const fieldId = requireString(obj, "fieldId", "setCell");
        if (!Object.prototype.hasOwnProperty.call(obj, "value")) {
          throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, 'setCell requires "value"');
        }
        return this.store.setCell(tableId, recordId, fieldId, obj["value"], "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "deleteRecord",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "deleteRecord");
        const tableId = this.resolveTargetTableId(obj, "deleteRecord");
        const recordId = requireString(obj, "recordId", "deleteRecord");
        return this.store.deleteRecord(tableId, recordId, "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table",
      "queryRecords",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "queryRecords");
        const tableId = this.resolveTargetTableId(obj, "queryRecords");
        const filter = optionalObject(obj, "filter", "queryRecords");
        const search = optionalString(obj, "search", "queryRecords");
        const sortBy = optionalString(obj, "sortBy", "queryRecords");
        const rawSortDir = optionalString(obj, "sortDir", "queryRecords");
        if (rawSortDir !== undefined && rawSortDir !== "asc" && rawSortDir !== "desc") {
          throw new AepError(
            AEP_ERROR_CODES.INVALID_PARAMS,
            'queryRecords "sortDir" must be "asc" or "desc"',
          );
        }
        const limit = optionalInt(obj, "limit", "queryRecords");
        const offset = optionalInt(obj, "offset", "queryRecords");
        return this.store.queryRecords(tableId, {
          ...(filter !== undefined ? { filter } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(sortBy !== undefined ? { sortBy } : {}),
          ...(rawSortDir !== undefined ? { sortDir: rawSortDir } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });
      }),
    );

    // /tables/active-table child controls and editable
    server.registerMethod(
      "/tables/active-table/name",
      "setValue",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "name.setValue");
        const value = requireString(obj, "value", "name.setValue");
        const activeId = this.store.getActiveTable().id;
        return this.store.renameTable(activeId, value, undefined, "aep");
      }),
    );

    server.registerMethod(
      "/tables/active-table/add-field",
      "invoke",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "add-field.invoke");
        const name = requireString(obj, "name", "add-field.invoke");
        const rawType = obj["type"];
        if (!isValidFieldType(rawType)) {
          throw new AepError(
            AEP_ERROR_CODES.INVALID_PARAMS,
            'add-field.invoke "type" must be one of: text, number, boolean, date',
          );
        }
        const required = optionalBoolean(obj, "required", "add-field.invoke");
        const activeId = this.store.getActiveTable().id;
        return this.store.addField(
          activeId,
          {
            name,
            type: rawType,
            ...(required !== undefined ? { required } : {}),
          },
          "aep",
        );
      }),
    );

    server.registerMethod(
      "/tables/active-table/add-record",
      "invoke",
      this.wrapMethod((raw) => {
        const obj = expectObject(raw, "add-record.invoke");
        const values = optionalObject(obj, "values", "add-record.invoke") ?? {};
        const activeId = this.store.getActiveTable().id;
        return this.store.addRecord(activeId, values, "aep");
      }),
    );

    // Dynamic subtree handlers (sidebar list items, grid columns, grid rows, grid cells)
    server.onInvoke(
      this.wrapMethod((raw, ctx) => {
        const sidebarMatch = /^\/tables\/sidebar\/table-list\/table-([^/]+)\/(open|delete)$/.exec(
          ctx.path,
        );
        if (sidebarMatch && ctx.method === "invoke") {
          const tableId = sidebarMatch[1]!;
          const action = sidebarMatch[2]!;
          return action === "open"
            ? this.store.openTable(tableId, "aep")
            : this.store.deleteTable(tableId, "aep");
        }

        const colMatch = /^\/tables\/active-table\/grid\/col-([^/]+)$/.exec(ctx.path);
        if (colMatch) {
          const fieldId = colMatch[1]!;
          const activeId = this.store.getActiveTable().id;
          if (ctx.method === "update") {
            const obj = expectObject(raw, "column.update");
            const name = optionalString(obj, "name", "column.update");
            const required = optionalBoolean(obj, "required", "column.update");
            let type: FieldType | undefined;
            if (obj["type"] !== undefined) {
              if (!isValidFieldType(obj["type"])) {
                throw new AepError(
                  AEP_ERROR_CODES.INVALID_PARAMS,
                  'column.update "type" must be one of: text, number, boolean, date',
                );
              }
              type = obj["type"];
            }
            return this.store.updateField(
              activeId,
              fieldId,
              {
                ...(name !== undefined ? { name } : {}),
                ...(type !== undefined ? { type } : {}),
                ...(required !== undefined ? { required } : {}),
              },
              "aep",
            );
          }
          if (ctx.method === "delete") {
            return this.store.deleteField(activeId, fieldId, "aep");
          }
        }

        const rowMatch = /^\/tables\/active-table\/grid\/row-([^/]+)$/.exec(ctx.path);
        if (rowMatch) {
          const recordId = rowMatch[1]!;
          const activeId = this.store.getActiveTable().id;
          if (ctx.method === "update") {
            const obj = expectObject(raw, "row.update");
            const values = optionalObject(obj, "values", "row.update");
            if (!values) {
              throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, 'row.update requires object "values"');
            }
            return this.store.updateRecord(activeId, recordId, values, "aep");
          }
          if (ctx.method === "delete") {
            return this.store.deleteRecord(activeId, recordId, "aep");
          }
        }

        const cellMatch =
          /^\/tables\/active-table\/grid\/row-([^/]+)\/cell-([^/]+)\/value$/.exec(ctx.path);
        if (cellMatch && ctx.method === "setValue") {
          const recordId = cellMatch[1]!;
          const fieldId = cellMatch[2]!;
          const obj = expectObject(raw, "cell.setValue");
          if (!Object.prototype.hasOwnProperty.call(obj, "value")) {
            throw new AepError(AEP_ERROR_CODES.INVALID_PARAMS, 'cell.setValue requires "value"');
          }
          const activeId = this.store.getActiveTable().id;
          return this.store.setCell(activeId, recordId, fieldId, obj["value"], "aep");
        }

        throw new AepError(
          AEP_ERROR_CODES.METHOD_NOT_FOUND,
          `Method "${ctx.method}" not handled on "${ctx.path}"`,
        );
      }),
    );
  }

  private enqueueAepSync(ev: TableChangeEvent): void {
    this.syncChain = this.syncChain
      .then(async () => {
        if (this.closed || !this.aepServer) {
          return;
        }
        const nextRoot: AepNode = buildTablesInterfaceNode(ev.state);
        await this.aepServer.updateNode("/tables", nextRoot);
        await this.aepServer.emitNodeEvent("/tables", ev.kind, {
          tableId: ev.tableId,
          ...(ev.fieldId !== undefined ? { fieldId: ev.fieldId } : {}),
          ...(ev.recordId !== undefined ? { recordId: ev.recordId } : {}),
          activeTableId: ev.state.activeTableId,
          source: ev.source,
        } as unknown as AepValue);
      })
      .catch(() => {});
  }

  private buildWebStatePayload(hostHeader?: string): Record<string, unknown> {
    const state = this.store.getState();
    const port = this.boundPort ?? this.port;
    const authority = hostHeader || `${this.host}:${port}`;
    return {
      ...state,
      aepEndpoint: `ws://${authority}${this.wsPath}`,
      aepClients: this.aepClientCount,
    };
  }

  private broadcastSseState(): void {
    if (this.sseClients.size === 0) {
      return;
    }
    const payload = JSON.stringify(this.buildWebStatePayload());
    const frame = `event: state\ndata: ${payload}\n\n`;
    for (const res of this.sseClients) {
      if (!res.writableEnded) {
        res.write(frame);
      }
    }
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const parsedUrl = new URL(req.url ?? "/", `http://${this.host}:${this.boundPort ?? this.port}`);
    const pathname = parsedUrl.pathname;
    const hostHeader = req.headers["host"];

    try {
      if (method === "GET" && pathname === "/") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(renderTablesAppHtml());
        return;
      }

      if (method === "GET" && pathname === "/.well-known/aep.json") {
        const port = this.boundPort ?? this.port;
        const authority = hostHeader || `${this.host}:${port}`;
        sendJson(res, 200, {
          protocolVersion: AEP_PROTOCOL_VERSION,
          name: "aep-tables-app",
          aepEndpoint: `ws://${authority}${this.wsPath}`,
          transport: "websocket",
          mode: "binary",
          rootPath: "/tables",
        });
        return;
      }

      if (method === "GET" && pathname === "/api/state") {
        sendJson(res, 200, this.buildWebStatePayload(hostHeader));
        return;
      }

      if (method === "GET" && pathname === "/api/events") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        this.sseClients.add(res);
        res.write(`event: state\ndata: ${JSON.stringify(this.buildWebStatePayload(hostHeader))}\n\n`);
        req.on("close", () => {
          this.sseClients.delete(res);
        });
        return;
      }

      if (method === "POST" && pathname === "/api/tables") {
        const body = await readJsonBody(req);
        const table = this.store.createTable({
          ...(typeof body["id"] === "string" ? { id: body["id"] } : {}),
          ...(typeof body["name"] === "string" ? { name: body["name"] } : {}),
          ...(typeof body["description"] === "string" ? { description: body["description"] } : {}),
          ...(Array.isArray(body["fields"])
            ? { fields: parseCreateFields(body["fields"], "POST /api/tables") }
            : {}),
          ...(Array.isArray(body["records"])
            ? { records: parseCreateRecords(body["records"], "POST /api/tables") }
            : {}),
          source: "web",
        });
        sendJson(res, 201, table);
        return;
      }

      const openMatch = /^\/api\/tables\/([^/]+)\/open$/.exec(pathname);
      if (method === "POST" && openMatch?.[1]) {
        const tableId = decodeURIComponent(openMatch[1]);
        const table = this.store.openTable(tableId, "web");
        sendJson(res, 200, table);
        return;
      }

      const fieldsMatch = /^\/api\/tables\/([^/]+)\/fields$/.exec(pathname);
      if (method === "POST" && fieldsMatch?.[1]) {
        const tableId = decodeURIComponent(fieldsMatch[1]);
        const body = await readJsonBody(req);
        if (typeof body["name"] !== "string" || !isValidFieldType(body["type"])) {
          throw new Error('Field requires string "name" and valid "type" (text, number, boolean, date)');
        }
        const table = this.store.addField(
          tableId,
          {
            ...(typeof body["id"] === "string" ? { id: body["id"] } : {}),
            name: body["name"],
            type: body["type"],
            ...(typeof body["required"] === "boolean" ? { required: body["required"] } : {}),
            ...(Object.prototype.hasOwnProperty.call(body, "defaultValue")
              ? { defaultValue: body["defaultValue"] }
              : {}),
          },
          "web",
        );
        sendJson(res, 201, table);
        return;
      }

      const fieldItemMatch = /^\/api\/tables\/([^/]+)\/fields\/([^/]+)$/.exec(pathname);
      if (fieldItemMatch?.[1] && fieldItemMatch[2]) {
        const tableId = decodeURIComponent(fieldItemMatch[1]);
        const fieldId = decodeURIComponent(fieldItemMatch[2]);
        if (method === "PUT") {
          const body = await readJsonBody(req);
          let type: FieldType | undefined;
          if (body["type"] !== undefined) {
            if (!isValidFieldType(body["type"])) {
              throw new Error('Field "type" must be one of: text, number, boolean, date');
            }
            type = body["type"];
          }
          const table = this.store.updateField(
            tableId,
            fieldId,
            {
              ...(typeof body["name"] === "string" ? { name: body["name"] } : {}),
              ...(type !== undefined ? { type } : {}),
              ...(typeof body["required"] === "boolean" ? { required: body["required"] } : {}),
            },
            "web",
          );
          sendJson(res, 200, table);
          return;
        }
        if (method === "DELETE") {
          const table = this.store.deleteField(tableId, fieldId, "web");
          sendJson(res, 200, table);
          return;
        }
      }

      const recordsMatch = /^\/api\/tables\/([^/]+)\/records$/.exec(pathname);
      if (method === "POST" && recordsMatch?.[1]) {
        const tableId = decodeURIComponent(recordsMatch[1]);
        const body = await readJsonBody(req);
        const values = isPlainObject(body["values"]) ? body["values"] : {};
        const explicitId = typeof body["id"] === "string" ? body["id"] : undefined;
        const record = this.store.addRecord(tableId, values, "web", explicitId);
        sendJson(res, 201, record);
        return;
      }

      const recordItemMatch = /^\/api\/tables\/([^/]+)\/records\/([^/]+)$/.exec(pathname);
      if (recordItemMatch?.[1] && recordItemMatch[2]) {
        const tableId = decodeURIComponent(recordItemMatch[1]);
        const recordId = decodeURIComponent(recordItemMatch[2]);
        if (method === "PUT") {
          const body = await readJsonBody(req);
          if (!isPlainObject(body["values"])) {
            throw new Error('Request body requires object "values"');
          }
          const record = this.store.updateRecord(tableId, recordId, body["values"], "web");
          sendJson(res, 200, record);
          return;
        }
        if (method === "DELETE") {
          const table = this.store.deleteRecord(tableId, recordId, "web");
          sendJson(res, 200, table);
          return;
        }
      }

      const tableMatch = /^\/api\/tables\/([^/]+)$/.exec(pathname);
      if (tableMatch?.[1]) {
        const tableId = decodeURIComponent(tableMatch[1]);
        if (method === "PUT") {
          const body = await readJsonBody(req);
          if (typeof body["name"] !== "string" || body["name"].trim().length === 0) {
            throw new Error('Request body requires non-empty string "name"');
          }
          const description =
            typeof body["description"] === "string" ? body["description"] : undefined;
          const table = this.store.renameTable(tableId, body["name"], description, "web");
          sendJson(res, 200, table);
          return;
        }
        if (method === "DELETE") {
          const nextState = this.store.deleteTable(tableId, "web");
          sendJson(res, 200, nextState);
          return;
        }
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = message.includes("not found") ? 404 : 400;
      sendJson(res, statusCode, { error: message });
    }
  }
}
