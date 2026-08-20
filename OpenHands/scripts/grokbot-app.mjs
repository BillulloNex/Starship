#!/usr/bin/env node
/**
 * Grokbot App CLI — Command-line tool to register, unregister, and list apps.
 *
 * Usage:
 *   node scripts/grokbot-app.mjs register <name> --port <port> [--title <title>]
 *   node scripts/grokbot-app.mjs unregister <name>
 *   node scripts/grokbot-app.mjs list
 *   node scripts/grokbot-app.mjs next-port [--preferred <port>]
 */

import process from "node:process";
import {
  registerApp,
  unregisterApp,
  listApps,
  getApp,
  allocateNextPort,
  DEFAULT_REGISTRY_PATH,
} from "./app-registry.mjs";
import { listListeningPorts } from "./preview-proxy.mjs";

function printHelp() {
  console.log(`
Grokbot App Registry CLI

COMMANDS:
  register <name> --port <port> [--title <title>] [--dir <dir>]
      Register an app to a port and subdomain slug (e.g. teddybear -> 3000)

  unregister <name>
      Remove an app registration

  list
      List all registered apps

  get <name>
      Get details for a registered app

  next-port [--preferred <port>]
      Find the next available port for a new app

OPTIONS:
  --registry-path <path>  Override registry JSON path (default: ${DEFAULT_REGISTRY_PATH})
  -h, --help              Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  let registryPath = DEFAULT_REGISTRY_PATH;

  // Extract global flags
  const filteredArgs = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--registry-path" && i + 1 < args.length) {
      registryPath = args[++i];
    } else {
      filteredArgs.push(args[i]);
    }
  }

  switch (command) {
    case "register": {
      const name = filteredArgs[0];
      if (!name) {
        console.error("Error: App name is required (e.g. grokbot-app register teddybear --port 3000)");
        process.exit(1);
      }

      let port = null;
      let title = null;
      let dir = null;

      for (let i = 1; i < filteredArgs.length; i++) {
        if (filteredArgs[i] === "--port" && i + 1 < filteredArgs.length) {
          port = filteredArgs[++i];
        } else if (filteredArgs[i] === "--title" && i + 1 < filteredArgs.length) {
          title = filteredArgs[++i];
        } else if (filteredArgs[i] === "--dir" && i + 1 < filteredArgs.length) {
          dir = filteredArgs[++i];
        }
      }

      if (!port) {
        console.error("Error: --port <port> is required");
        process.exit(1);
      }

      try {
        const record = await registerApp({ name, port, title, dir }, registryPath);
        console.log(JSON.stringify({ success: true, app: record }, null, 2));
      } catch (err) {
        console.error("Error registering app:", err.message);
        process.exit(1);
      }
      break;
    }

    case "unregister": {
      const name = filteredArgs[0];
      if (!name) {
        console.error("Error: App name is required");
        process.exit(1);
      }
      const success = await unregisterApp(name, registryPath);
      console.log(JSON.stringify({ success, name }));
      break;
    }

    case "list": {
      const apps = await listApps(registryPath);
      console.log(JSON.stringify(apps, null, 2));
      break;
    }

    case "get": {
      const name = filteredArgs[0];
      if (!name) {
        console.error("Error: App name is required");
        process.exit(1);
      }
      const app = await getApp(name, registryPath);
      if (!app) {
        console.error(`App "${name}" not found.`);
        process.exit(1);
      }
      console.log(JSON.stringify(app, null, 2));
      break;
    }

    case "next-port": {
      let preferredPort = null;
      for (let i = 0; i < filteredArgs.length; i++) {
        if (filteredArgs[i] === "--preferred" && i + 1 < filteredArgs.length) {
          preferredPort = Number.parseInt(filteredArgs[++i], 10);
        }
      }

      try {
        const listening = await listListeningPorts();
        const port = await allocateNextPort(
          { preferredPort, activePorts: new Set(listening) },
          registryPath,
        );
        console.log(port);
      } catch (err) {
        console.error("Error allocating port:", err.message);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
