# AEP Tables App

A dual-interface web app for managing simple tables of typed records (no spreadsheet formulas and no cross-table relationships), built with [`aep-node`](../../aep-node/README.md).

1. **Human Desktop Webapp** (`http://127.0.0.1:8781/`) — dark-themed table workspace with sidebar table switching, typed inline cell editors, field management, search filtering, and live Server-Sent Events (`/api/events`) updates.
2. **AEP Endpoint** (`ws://127.0.0.1:8781/aep`, advertised at `/.well-known/aep.json`) — exposes `/tables` directly over AEP WebSocket (binary mode) so autonomous agents can connect standalone or mount it inside a virtual OS host via AEP passthrough.

## Supported Field Datatypes

- `text`: UTF-8 string
- `number`: finite number or `null`
- `boolean`: `true` / `false`
- `date`: `YYYY-MM-DD` ISO calendar date or `""`

## Quick Start

```bash
npm install
npm start
```

Options:

```bash
npm start -- --port 8781 --data-dir ./data
npm start -- --no-seed --port 0
```

## AEP Tree Structure (`/tables`)

- `/tables` (`interface`, `type="page"`): `listTables`, `createTable`, `openTable`, `renameTable`, `deleteTable`
  - `/tables/sidebar/new-table` (`control`, `type="button"`): `invoke`
  - `/tables/sidebar/table-list/table-<id>` (`structure`, `type="listItem"`): child `open` and `delete` buttons
  - `/tables/active-table` (`structure`, `type="section"`): `getTable`, `rename`, `addField`, `updateField`, `deleteField`, `addRecord`, `updateRecord`, `setCell`, `deleteRecord`, `queryRecords`
    - `/tables/active-table/name` (`editable`, `type="textField"`): `setValue`
    - `/tables/active-table/add-field` (`control`, `type="button"`): `invoke`
    - `/tables/active-table/add-record` (`control`, `type="button"`): `invoke`
    - `/tables/active-table/grid` (`structure`, `type="table"`)
      - `/tables/active-table/grid/col-<fieldId>` (`structure`, `type="column"`): `update`, `delete`
      - `/tables/active-table/grid/row-<recordId>` (`structure`, `type="row"`): `update`, `delete`
        - `/tables/active-table/grid/row-<recordId>/cell-<fieldId>` (`structure`, `type="cell"`)
          - `/tables/active-table/grid/row-<recordId>/cell-<fieldId>/value` (`editable`, `type="textField|numberField|checkbox|dateField"`): `setValue`

## Tests

```bash
npm run typecheck
npm test
```
