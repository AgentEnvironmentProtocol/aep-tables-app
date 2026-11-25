import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type FieldType = "text" | "number" | "boolean" | "date";
export type FieldValue = string | number | boolean | null;
export type MutationSource = "system" | "web" | "aep";

export interface FieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
}

export interface TableRecord {
  id: string;
  values: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
}

export interface TableData {
  id: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
  records: TableRecord[];
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: MutationSource;
}

export interface TableSummary {
  id: string;
  name: string;
  description: string;
  fieldCount: number;
  recordCount: number;
  active: boolean;
  updatedAt: string;
}

export interface TablesStoreState {
  activeTableId: string;
  activeTable: TableData;
  tables: TableSummary[];
}

export type TableChangeKind =
  | "tableCreated"
  | "tableOpened"
  | "tableUpdated"
  | "tableDeleted"
  | "fieldAdded"
  | "fieldUpdated"
  | "fieldDeleted"
  | "recordAdded"
  | "recordUpdated"
  | "recordDeleted";

export interface TableChangeEvent {
  kind: TableChangeKind;
  tableId: string;
  fieldId?: string;
  recordId?: string;
  source: MutationSource;
  state: TablesStoreState;
}

export interface CreateTableInput {
  id?: string;
  name?: string;
  description?: string;
  fields?: Array<{
    id?: string;
    name: string;
    type: FieldType;
    required?: boolean;
  }>;
  records?: Array<{
    id?: string;
    values?: Record<string, unknown>;
  }>;
  source?: MutationSource;
}

export interface AddFieldInput {
  id?: string;
  name: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: unknown;
}

export interface UpdateFieldInput {
  name?: string;
  type?: FieldType;
  required?: boolean;
}

export interface QueryRecordsOptions {
  filter?: Record<string, unknown>;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface QueryRecordsResult {
  tableId: string;
  total: number;
  count: number;
  records: TableRecord[];
}

export interface TableStoreOptions {
  dataDir?: string;
  persist?: boolean;
  seedDefault?: boolean;
}

const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;
const VALID_FIELD_TYPES = new Set<FieldType>(["text", "number", "boolean", "date"]);
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && VALID_FIELD_TYPES.has(value as FieldType);
}

export function isValidIdSegment(id: string): boolean {
  return id.length > 0 && id !== "." && id !== ".." && SEGMENT_REGEX.test(id);
}

export function slugifyId(raw: string, fallback = "item"): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized === "." || normalized === ".." || !isValidIdSegment(normalized)) {
    return fallback;
  }
  return normalized;
}

function makeUniqueId(base: string, existing: ReadonlySet<string>): string {
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function defaultValueForField(type: FieldType): FieldValue {
  switch (type) {
    case "text":
      return "";
    case "number":
      return null;
    case "boolean":
      return false;
    case "date":
      return "";
  }
}

export function coerceFieldValue(
  raw: unknown,
  field: Pick<FieldDefinition, "name" | "type" | "required">,
): FieldValue {
  let coerced: FieldValue;

  switch (field.type) {
    case "text": {
      if (raw === undefined || raw === null) {
        coerced = "";
      } else if (typeof raw === "string") {
        coerced = raw;
      } else {
        throw new Error(`Field "${field.name}" expects a text string`);
      }
      if (field.required && coerced.trim().length === 0) {
        throw new Error(`Field "${field.name}" is required and cannot be empty`);
      }
      return coerced;
    }

    case "number": {
      if (raw === undefined || raw === null || raw === "") {
        coerced = null;
      } else if (typeof raw === "number") {
        if (!Number.isFinite(raw)) {
          throw new Error(`Field "${field.name}" must be a finite number`);
        }
        coerced = raw;
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          coerced = null;
        } else {
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed)) {
            throw new Error(`Field "${field.name}" must be a valid number`);
          }
          coerced = parsed;
        }
      } else {
        throw new Error(`Field "${field.name}" expects a number`);
      }
      if (field.required && coerced === null) {
        throw new Error(`Field "${field.name}" is required and cannot be null`);
      }
      return coerced;
    }

    case "boolean": {
      if (raw === undefined || raw === null) {
        coerced = false;
      } else if (typeof raw === "boolean") {
        coerced = raw;
      } else if (typeof raw === "string") {
        const lower = raw.trim().toLowerCase();
        if (lower === "true") {
          coerced = true;
        } else if (lower === "false" || lower === "") {
          coerced = false;
        } else {
          throw new Error(`Field "${field.name}" expects a boolean (true or false)`);
        }
      } else {
        throw new Error(`Field "${field.name}" expects a boolean`);
      }
      return coerced;
    }

    case "date": {
      if (raw === undefined || raw === null || raw === "") {
        coerced = "";
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          coerced = "";
        } else {
          if (!isValidIsoDate(trimmed)) {
            throw new Error(`Field "${field.name}" must be a valid YYYY-MM-DD date`);
          }
          coerced = trimmed;
        }
      } else {
        throw new Error(`Field "${field.name}" expects a YYYY-MM-DD date string`);
      }
      if (field.required && coerced === "") {
        throw new Error(`Field "${field.name}" is required and cannot be empty`);
      }
      return coerced;
    }
  }
}

function convertExistingValue(raw: FieldValue | undefined, targetType: FieldType): FieldValue {
  if (raw === undefined || raw === null) {
    return defaultValueForField(targetType);
  }
  switch (targetType) {
    case "text":
      return String(raw);
    case "number": {
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      if (typeof raw === "string" && raw.trim().length > 0) {
        const parsed = Number(raw.trim());
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (typeof raw === "boolean") {
        return raw ? 1 : 0;
      }
      return null;
    }
    case "boolean": {
      if (typeof raw === "boolean") {
        return raw;
      }
      if (typeof raw === "number") {
        return raw !== 0;
      }
      const lower = raw.trim().toLowerCase();
      return lower === "true" || lower === "1" || lower === "yes";
    }
    case "date": {
      if (typeof raw === "string" && isValidIsoDate(raw.trim())) {
        return raw.trim();
      }
      return "";
    }
  }
}

function cloneTable(table: TableData): TableData {
  return {
    ...table,
    fields: table.fields.map((f) => ({ ...f })),
    records: table.records.map((r) => ({
      ...r,
      values: { ...r.values },
    })),
  };
}

export class TableStore {
  private readonly dataDir: string;
  private readonly persist: boolean;
  private readonly tables = new Map<string, TableData>();
  private readonly listeners = new Set<(event: TableChangeEvent) => void>();
  private activeTableId = "";

  constructor(options: TableStoreOptions = {}) {
    this.dataDir = path.resolve(options.dataDir ?? path.join(process.cwd(), "data"));
    this.persist = options.persist ?? true;
    const seedDefault = options.seedDefault ?? true;

    if (this.persist) {
      this.loadFromDisk();
    }

    if (this.tables.size === 0 && seedDefault) {
      this.seedDefaultTable();
    }

    if (this.tables.size === 0) {
      const created = this.createTableInternal({
        id: "untitled-table",
        name: "Untitled Table",
        fields: [{ id: "name", name: "Name", type: "text", required: false }],
        source: "system",
      });
      this.activeTableId = created.id;
    } else if (!this.activeTableId || !this.tables.has(this.activeTableId)) {
      this.activeTableId = this.tables.keys().next().value!;
    }
  }

  onChange(listener: (event: TableChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): TablesStoreState {
    const active = this.requireTable(this.activeTableId);
    const tables: TableSummary[] = Array.from(this.tables.values()).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      fieldCount: t.fields.length,
      recordCount: t.records.length,
      active: t.id === this.activeTableId,
      updatedAt: t.updatedAt,
    }));
    return {
      activeTableId: this.activeTableId,
      activeTable: cloneTable(active),
      tables,
    };
  }

  getActiveTable(): TableData {
    return cloneTable(this.requireTable(this.activeTableId));
  }

  getTable(tableId: string): TableData {
    return cloneTable(this.requireTable(tableId));
  }

  createTable(input: CreateTableInput = {}): TableData {
    const source = input.source ?? "system";
    const table = this.createTableInternal(input);
    this.activeTableId = table.id;
    this.emit("tableCreated", { tableId: table.id, source });
    return cloneTable(table);
  }

  openTable(tableId: string, source: MutationSource = "system"): TableData {
    const table = this.requireTable(tableId);
    this.activeTableId = table.id;
    this.emit("tableOpened", { tableId: table.id, source });
    return cloneTable(table);
  }

  renameTable(
    tableId: string,
    name: string,
    description?: string,
    source: MutationSource = "system",
  ): TableData {
    const table = this.requireTable(tableId);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("Table name cannot be empty");
    }
    table.name = trimmed;
    if (description !== undefined) {
      table.description = description;
    }
    table.updatedAt = new Date().toISOString();
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("tableUpdated", { tableId: table.id, source });
    return cloneTable(table);
  }

  deleteTable(tableId: string, source: MutationSource = "system"): TablesStoreState {
    this.requireTable(tableId);
    this.tables.delete(tableId);
    this.deleteTableFromDisk(tableId);

    if (this.tables.size === 0) {
      const fallback = this.createTableInternal({
        id: "untitled-table",
        name: "Untitled Table",
        fields: [{ id: "name", name: "Name", type: "text", required: false }],
        source,
      });
      this.activeTableId = fallback.id;
    } else if (this.activeTableId === tableId) {
      this.activeTableId = this.tables.keys().next().value!;
    }

    this.emit("tableDeleted", { tableId, source });
    return this.getState();
  }

  addField(
    tableId: string,
    input: AddFieldInput,
    source: MutationSource = "system",
  ): TableData {
    const table = this.requireTable(tableId);
    const name = input.name.trim();
    if (name.length === 0) {
      throw new Error("Field name cannot be empty");
    }
    if (!isValidFieldType(input.type)) {
      throw new Error(`Invalid field type "${String(input.type)}". Expected text, number, boolean, or date`);
    }
    const existingIds = new Set(table.fields.map((f) => f.id));
    let fieldId: string;
    if (input.id !== undefined) {
      if (!isValidIdSegment(input.id)) {
        throw new Error(`Invalid field id "${input.id}"`);
      }
      if (existingIds.has(input.id)) {
        throw new Error(`Field "${input.id}" already exists in table "${tableId}"`);
      }
      fieldId = input.id;
    } else {
      fieldId = makeUniqueId(slugifyId(name, "field"), existingIds);
    }

    const required = Boolean(input.required);
    const field: FieldDefinition = {
      id: fieldId,
      name,
      type: input.type,
      required,
    };

    const initialCellValue =
      input.defaultValue !== undefined
        ? coerceFieldValue(input.defaultValue, field)
        : defaultValueForField(field.type);

    if (required && input.defaultValue === undefined && table.records.length > 0) {
      // Allow adding a required field to a non-empty table unless an invalid defaultValue was given;
      // existing records receive the type default (or caller can supply defaultValue).
      if (field.type === "text" || field.type === "date") {
        // Keep empty string for existing records when no defaultValue provided.
      }
    }

    table.fields.push(field);
    const now = new Date().toISOString();
    for (const record of table.records) {
      record.values[field.id] = initialCellValue;
      record.updatedAt = now;
    }
    table.updatedAt = now;
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("fieldAdded", { tableId: table.id, fieldId: field.id, source });
    return cloneTable(table);
  }

  updateField(
    tableId: string,
    fieldId: string,
    input: UpdateFieldInput,
    source: MutationSource = "system",
  ): TableData {
    const table = this.requireTable(tableId);
    const field = this.requireField(table, fieldId);

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length === 0) {
        throw new Error("Field name cannot be empty");
      }
      field.name = trimmed;
    }

    if (input.type !== undefined) {
      if (!isValidFieldType(input.type)) {
        throw new Error(`Invalid field type "${String(input.type)}". Expected text, number, boolean, or date`);
      }
      if (input.type !== field.type) {
        field.type = input.type;
        for (const record of table.records) {
          record.values[field.id] = convertExistingValue(record.values[field.id], input.type);
        }
      }
    }

    if (input.required !== undefined) {
      field.required = Boolean(input.required);
    }

    table.updatedAt = new Date().toISOString();
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("fieldUpdated", { tableId: table.id, fieldId: field.id, source });
    return cloneTable(table);
  }

  deleteField(
    tableId: string,
    fieldId: string,
    source: MutationSource = "system",
  ): TableData {
    const table = this.requireTable(tableId);
    const idx = table.fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) {
      throw new Error(`Field "${fieldId}" not found in table "${tableId}"`);
    }
    table.fields.splice(idx, 1);
    const now = new Date().toISOString();
    for (const record of table.records) {
      delete record.values[fieldId];
      record.updatedAt = now;
    }
    table.updatedAt = now;
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("fieldDeleted", { tableId: table.id, fieldId, source });
    return cloneTable(table);
  }

  addRecord(
    tableId: string,
    values: Record<string, unknown> = {},
    source: MutationSource = "system",
    explicitId?: string,
  ): TableRecord {
    const table = this.requireTable(tableId);
    const existingIds = new Set(table.records.map((r) => r.id));

    let recordId: string;
    if (explicitId !== undefined) {
      if (!isValidIdSegment(explicitId)) {
        throw new Error(`Invalid record id "${explicitId}"`);
      }
      if (existingIds.has(explicitId)) {
        throw new Error(`Record "${explicitId}" already exists in table "${tableId}"`);
      }
      recordId = explicitId;
    } else {
      let seq = table.records.length + 1;
      while (existingIds.has(`rec-${seq}`)) {
        seq += 1;
      }
      recordId = `rec-${seq}`;
    }

    const unknownKeys = Object.keys(values).filter(
      (k) => !table.fields.some((f) => f.id === k),
    );
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s) for table "${tableId}": ${unknownKeys.join(", ")}`);
    }

    const recordValues: Record<string, FieldValue> = {};
    for (const field of table.fields) {
      const raw = Object.prototype.hasOwnProperty.call(values, field.id)
        ? values[field.id]
        : undefined;
      recordValues[field.id] = coerceFieldValue(raw, field);
    }

    const now = new Date().toISOString();
    const record: TableRecord = {
      id: recordId,
      values: recordValues,
      createdAt: now,
      updatedAt: now,
    };
    table.records.push(record);
    table.updatedAt = now;
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("recordAdded", { tableId: table.id, recordId: record.id, source });
    return { ...record, values: { ...record.values } };
  }

  updateRecord(
    tableId: string,
    recordId: string,
    values: Record<string, unknown>,
    source: MutationSource = "system",
  ): TableRecord {
    const table = this.requireTable(tableId);
    const record = this.requireRecord(table, recordId);

    const unknownKeys = Object.keys(values).filter(
      (k) => !table.fields.some((f) => f.id === k),
    );
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown field(s) for table "${tableId}": ${unknownKeys.join(", ")}`);
    }

    const nextValues: Record<string, FieldValue> = { ...record.values };
    for (const field of table.fields) {
      if (Object.prototype.hasOwnProperty.call(values, field.id)) {
        nextValues[field.id] = coerceFieldValue(values[field.id], field);
      }
    }

    const now = new Date().toISOString();
    record.values = nextValues;
    record.updatedAt = now;
    table.updatedAt = now;
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("recordUpdated", { tableId: table.id, recordId: record.id, source });
    return { ...record, values: { ...record.values } };
  }

  setCell(
    tableId: string,
    recordId: string,
    fieldId: string,
    value: unknown,
    source: MutationSource = "system",
  ): TableRecord {
    const table = this.requireTable(tableId);
    const field = this.requireField(table, fieldId);
    const record = this.requireRecord(table, recordId);

    const coerced = coerceFieldValue(value, field);
    const now = new Date().toISOString();
    record.values[field.id] = coerced;
    record.updatedAt = now;
    table.updatedAt = now;
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("recordUpdated", {
      tableId: table.id,
      fieldId: field.id,
      recordId: record.id,
      source,
    });
    return { ...record, values: { ...record.values } };
  }

  deleteRecord(
    tableId: string,
    recordId: string,
    source: MutationSource = "system",
  ): TableData {
    const table = this.requireTable(tableId);
    const idx = table.records.findIndex((r) => r.id === recordId);
    if (idx === -1) {
      throw new Error(`Record "${recordId}" not found in table "${tableId}"`);
    }
    table.records.splice(idx, 1);
    table.updatedAt = new Date().toISOString();
    table.lastUpdatedBy = source;
    this.saveTableToDisk(table);
    this.emit("recordDeleted", { tableId: table.id, recordId, source });
    return cloneTable(table);
  }

  queryRecords(tableId: string, options: QueryRecordsOptions = {}): QueryRecordsResult {
    const table = this.requireTable(tableId);
    let results = table.records.map((r) => ({ ...r, values: { ...r.values } }));

    if (options.filter) {
      for (const [fieldId, expected] of Object.entries(options.filter)) {
        const field = table.fields.find((f) => f.id === fieldId);
        if (!field) {
          throw new Error(`Unknown filter field "${fieldId}" in table "${tableId}"`);
        }
        results = results.filter((rec) => rec.values[fieldId] === expected);
      }
    }

    if (options.search !== undefined && options.search.trim().length > 0) {
      const needle = options.search.trim().toLowerCase();
      results = results.filter((rec) => {
        if (rec.id.toLowerCase().includes(needle)) {
          return true;
        }
        return table.fields.some((f) => {
          const val = rec.values[f.id];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(needle);
        });
      });
    }

    if (options.sortBy !== undefined) {
      const sortBy = options.sortBy;
      const dir = options.sortDir === "desc" ? -1 : 1;
      const isField = table.fields.some((f) => f.id === sortBy);
      if (!isField && sortBy !== "id" && sortBy !== "createdAt" && sortBy !== "updatedAt") {
        throw new Error(`Unknown sortBy field "${sortBy}" in table "${tableId}"`);
      }
      results.sort((a, b) => {
        const va =
          sortBy === "id"
            ? a.id
            : sortBy === "createdAt"
              ? a.createdAt
              : sortBy === "updatedAt"
                ? a.updatedAt
                : a.values[sortBy];
        const vb =
          sortBy === "id"
            ? b.id
            : sortBy === "createdAt"
              ? b.createdAt
              : sortBy === "updatedAt"
                ? b.updatedAt
                : b.values[sortBy];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === "number" && typeof vb === "number") {
          return (va - vb) * dir;
        }
        if (typeof va === "boolean" && typeof vb === "boolean") {
          return (Number(va) - Number(vb)) * dir;
        }
        return String(va).localeCompare(String(vb)) * dir;
      });
    }

    const total = results.length;
    const offset = Math.max(0, options.offset ?? 0);
    const sliced =
      options.limit !== undefined
        ? results.slice(offset, offset + Math.max(0, options.limit))
        : results.slice(offset);

    return {
      tableId: table.id,
      total,
      count: sliced.length,
      records: sliced,
    };
  }

  private createTableInternal(input: CreateTableInput): TableData {
    const name = (input.name ?? "Untitled Table").trim() || "Untitled Table";
    const existingIds = new Set(this.tables.keys());

    let tableId: string;
    if (input.id !== undefined) {
      if (!isValidIdSegment(input.id)) {
        throw new Error(`Invalid table id "${input.id}"`);
      }
      if (existingIds.has(input.id)) {
        throw new Error(`Table "${input.id}" already exists`);
      }
      tableId = input.id;
    } else {
      tableId = makeUniqueId(slugifyId(name, "table"), existingIds);
    }

    const fields: FieldDefinition[] = [];
    const fieldIds = new Set<string>();
    const rawFields =
      input.fields && input.fields.length > 0
        ? input.fields
        : [{ id: "name", name: "Name", type: "text" as FieldType, required: false }];

    for (const rawField of rawFields) {
      const fName = rawField.name.trim();
      if (fName.length === 0) {
        throw new Error("Field name cannot be empty");
      }
      if (!isValidFieldType(rawField.type)) {
        throw new Error(
          `Invalid field type "${String(rawField.type)}". Expected text, number, boolean, or date`,
        );
      }
      let fId: string;
      if (rawField.id !== undefined) {
        if (!isValidIdSegment(rawField.id)) {
          throw new Error(`Invalid field id "${rawField.id}"`);
        }
        if (fieldIds.has(rawField.id)) {
          throw new Error(`Duplicate field id "${rawField.id}"`);
        }
        fId = rawField.id;
      } else {
        fId = makeUniqueId(slugifyId(fName, "field"), fieldIds);
      }
      fieldIds.add(fId);
      fields.push({
        id: fId,
        name: fName,
        type: rawField.type,
        required: Boolean(rawField.required),
      });
    }

    const now = new Date().toISOString();
    const table: TableData = {
      id: tableId,
      name,
      description: input.description ?? "",
      fields,
      records: [],
      createdAt: now,
      updatedAt: now,
      lastUpdatedBy: input.source ?? "system",
    };

    if (input.records && input.records.length > 0) {
      const recordIds = new Set<string>();
      for (let i = 0; i < input.records.length; i += 1) {
        const rawRec = input.records[i]!;
        let rId: string;
        if (rawRec.id !== undefined) {
          if (!isValidIdSegment(rawRec.id)) {
            throw new Error(`Invalid record id "${rawRec.id}"`);
          }
          if (recordIds.has(rawRec.id)) {
            throw new Error(`Duplicate record id "${rawRec.id}"`);
          }
          rId = rawRec.id;
        } else {
          rId = makeUniqueId(`rec-${i + 1}`, recordIds);
        }
        recordIds.add(rId);

        const rawValues = rawRec.values ?? {};
        const unknownKeys = Object.keys(rawValues).filter((k) => !fieldIds.has(k));
        if (unknownKeys.length > 0) {
          throw new Error(`Unknown field(s) in initial record: ${unknownKeys.join(", ")}`);
        }

        const coercedValues: Record<string, FieldValue> = {};
        for (const field of fields) {
          const rawVal = Object.prototype.hasOwnProperty.call(rawValues, field.id)
            ? rawValues[field.id]
            : undefined;
          coercedValues[field.id] = coerceFieldValue(rawVal, field);
        }

        table.records.push({
          id: rId,
          values: coercedValues,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    this.tables.set(table.id, table);
    this.saveTableToDisk(table);
    return table;
  }

  private seedDefaultTable(): void {
    const tasks = this.createTableInternal({
      id: "tasks",
      name: "Tasks",
      description: "Simple task list with typed fields",
      fields: [
        { id: "title", name: "Title", type: "text", required: true },
        { id: "priority", name: "Priority", type: "number", required: false },
        { id: "done", name: "Done", type: "boolean", required: false },
        { id: "due_date", name: "Due Date", type: "date", required: false },
      ],
      records: [
        {
          id: "rec-1",
          values: {
            title: "Verify AEP table endpoint",
            priority: 1,
            done: true,
            due_date: "2026-11-25",
          },
        },
        {
          id: "rec-2",
          values: {
            title: "Add records via human UI or agent",
            priority: 2,
            done: false,
            due_date: "2026-11-28",
          },
        },
        {
          id: "rec-3",
          values: {
            title: "Connect to virtual OS mount tree",
            priority: 3,
            done: false,
            due_date: "2026-12-01",
          },
        },
      ],
      source: "system",
    });
    this.activeTableId = tasks.id;
  }

  private requireTable(tableId: string): TableData {
    const table = this.tables.get(tableId);
    if (!table) {
      throw new Error(`Table "${tableId}" not found`);
    }
    return table;
  }

  private requireField(table: TableData, fieldId: string): FieldDefinition {
    const field = table.fields.find((f) => f.id === fieldId);
    if (!field) {
      throw new Error(`Field "${fieldId}" not found in table "${table.id}"`);
    }
    return field;
  }

  private requireRecord(table: TableData, recordId: string): TableRecord {
    const record = table.records.find((r) => r.id === recordId);
    if (!record) {
      throw new Error(`Record "${recordId}" not found in table "${table.id}"`);
    }
    return record;
  }

  private emit(
    kind: TableChangeKind,
    details: { tableId: string; fieldId?: string; recordId?: string; source: MutationSource },
  ): void {
    const event: TableChangeEvent = {
      kind,
      tableId: details.tableId,
      ...(details.fieldId !== undefined ? { fieldId: details.fieldId } : {}),
      ...(details.recordId !== undefined ? { recordId: details.recordId } : {}),
      source: details.source,
      state: this.getState(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(this.dataDir)) {
      return;
    }
    const files = readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    const loaded: TableData[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(path.join(this.dataDir, file), "utf8");
        const parsed = JSON.parse(raw) as Partial<TableData>;
        if (
          typeof parsed.id === "string" &&
          isValidIdSegment(parsed.id) &&
          typeof parsed.name === "string" &&
          Array.isArray(parsed.fields) &&
          Array.isArray(parsed.records)
        ) {
          loaded.push({
            id: parsed.id,
            name: parsed.name,
            description: typeof parsed.description === "string" ? parsed.description : "",
            fields: parsed.fields,
            records: parsed.records,
            createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
            lastUpdatedBy:
              parsed.lastUpdatedBy === "web" ||
              parsed.lastUpdatedBy === "aep" ||
              parsed.lastUpdatedBy === "system"
                ? parsed.lastUpdatedBy
                : "system",
          });
        }
      } catch {
        // Skip malformed table files on startup
      }
    }

    loaded.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const table of loaded) {
      this.tables.set(table.id, table);
    }
  }

  private saveTableToDisk(table: TableData): void {
    if (!this.persist) {
      return;
    }
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(
      path.join(this.dataDir, `${table.id}.json`),
      JSON.stringify(table, null, 2),
      "utf8",
    );
  }

  private deleteTableFromDisk(tableId: string): void {
    if (!this.persist) {
      return;
    }
    const filePath = path.join(this.dataDir, `${tableId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}
