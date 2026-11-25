import path from "node:path";
import { TablesAepServer } from "./tables-aep-server.js";

interface TablesCliArgs {
  host: string;
  port: number;
  wsPath: string;
  dataDir: string;
  seedDefault: boolean;
  jsonReady: boolean;
  exitOnStdinEof: boolean;
}

function parseIntArg(raw: string | undefined, flag: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`Invalid integer for ${flag}: "${raw ?? ""}"`);
  }
  return num;
}

function parseCliArgs(argv: string[]): TablesCliArgs {
  const args: TablesCliArgs = {
    host: "127.0.0.1",
    port: 8781,
    wsPath: "/aep",
    dataDir: path.resolve(process.cwd(), "data"),
    seedDefault: true,
    jsonReady: false,
    exitOnStdinEof: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    switch (token) {
      case "--host":
        args.host = argv[++i] ?? args.host;
        break;
      case "--port":
        args.port = parseIntArg(argv[++i], "--port");
        break;
      case "--path":
        args.wsPath = argv[++i] ?? args.wsPath;
        break;
      case "--data-dir":
        args.dataDir = path.resolve(argv[++i] ?? "data");
        break;
      case "--no-seed":
        args.seedDefault = false;
        break;
      case "--json-ready":
        args.jsonReady = true;
        break;
      case "--exit-on-stdin-eof":
        args.exitOnStdinEof = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`AEP Tables App Server

Usage:
  node dist/cli.js [options]

Options:
  --host <ip>            Bind host (default: 127.0.0.1)
  --port <port>          HTTP + WebSocket port (default: 8781; 0 = ephemeral)
  --path <wsPath>        AEP WebSocket path (default: /aep)
  --data-dir <dir>       Directory to store table JSON files (default: ./data)
  --no-seed              Do not create starter Tasks table when directory is empty
  --json-ready           Print single-line AEP_TABLES_READY JSON on stdout
  --exit-on-stdin-eof    Shut down cleanly when stdin closes
  -h, --help             Show help`);
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  const server = new TablesAepServer({
    host: opts.host,
    port: opts.port,
    wsPath: opts.wsPath,
    dataDir: opts.dataDir,
    persist: true,
    seedDefault: opts.seedDefault,
  });

  let shuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (!opts.jsonReady && signal) {
      console.error(`\n[${signal}] Shutting down AEP Tables Server...`);
    }
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  if (opts.exitOnStdinEof) {
    process.stdin.resume();
    process.stdin.on("end", () => {
      void shutdown("STDIN_EOF");
    });
    process.stdin.on("close", () => {
      void shutdown("STDIN_CLOSE");
    });
  }

  const started = await server.start();
  if (opts.jsonReady) {
    console.log(`AEP_TABLES_READY ${JSON.stringify(started)}`);
  } else {
    console.log(`AEP Tables Webapp:         ${started.httpUrl}`);
    console.log(`AEP Tables WebSocket:      ${started.wsUrl}`);
    console.log(`AEP Discovery Manifest:    ${started.discoveryUrl}`);
    console.log(`Tables Data Dir:           ${started.dataDir}`);
    console.log("Press Ctrl+C to shut down.");
  }
}

main().catch((err) => {
  console.error("Failed to start AEP Tables Server:", err instanceof Error ? err.message : err);
  process.exit(1);
});
