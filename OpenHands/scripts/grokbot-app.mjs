#!/usr/bin/env node
/**
 * Grokbot App CLI — Command-line tool to register, unregister, list, and manage apps.
 *
 * Usage:
 *   node scripts/grokbot-app.mjs register <name> --port <port> [--title <title>] [--dir <dir>] [--start-cmd <cmd>]
 *   node scripts/grokbot-app.mjs unregister <name>
 *   node scripts/grokbot-app.mjs list
 *   node scripts/grokbot-app.mjs next-port [--preferred <port>]
 *   node scripts/grokbot-app.mjs auto-start
 *   node scripts/grokbot-app.mjs stop <name> [--unregister]
 */

import { execSync } from "node:child_process";
import process from "node:process";
import {
  registerApp,
  unregisterApp,
  listApps,
  getApp,
  allocateNextPort,
  autoStartApps,
  DEFAULT_REGISTRY_PATH,
} from "./app-registry.mjs";
import { listListeningPorts } from "./preview-proxy.mjs";
import { deployToCloudflarePages } from "./grokbot-deploy.mjs";

function printHelp() {
  console.log(`
Grokbot App Registry & Deployment CLI

COMMANDS:
  deploy-pages <dir> [--name <slug>] [--branch <branch>]
      Deploy static HTML/JS/CSS app or build to Cloudflare Pages (permanent 24/7 https://<slug>.pages.dev)

  register <name> --port <port> [--title <title>] [--dir <dir>] [--start-cmd <cmd>]
      Register a dynamic app to a port and subdomain slug (e.g. mario-game -> 3000)

  unregister <name>
      Remove an app registration

  list
      List all registered apps

  get <name>
      Get details for a registered app

  next-port [--preferred <port>]
      Find the next available port for a new app

  auto-start
      Auto-start all registered persistent applications

  stop <name> [--unregister]
      Stop a running app process by killing its port listener and optionally unregistering it

OPTIONS:
  --registry-path <path>  Override registry JSON path (default: \${DEFAULT_REGISTRY_PATH})
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
    case "deploy-pages":
    case "deploy": {
      let targetDir = ".";
      let name = null;
      let branch = "main";

      for (let i = 0; i < filteredArgs.length; i++) {
        const arg = filteredArgs[i];
        if (arg === "--name" || arg === "-n") {
          name = filteredArgs[++i];
        } else if (arg === "--branch" || arg === "-b") {
          branch = filteredArgs[++i];
        } else if (!arg.startsWith("-") && targetDir === ".") {
          targetDir = arg;
        }
      }

      try {
        const res = deployToCloudflarePages(targetDir, { name, branch });
        if (process.env.GROKBOT_OUTPUT_FORMAT === "json") {
          console.log(JSON.stringify(res));
        }
      } catch (err) {
        console.error(`Error deploying to Cloudflare Pages: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case "register": {
      const name = filteredArgs[0];
      if (!name) {
        console.error("Error: App name is required (e.g. grokbot-app register mario-game --port 3000)");
        process.exit(1);
      }

      let port = null;
      let title = null;
      let dir = null;
      let startCmd = null;

      for (let i = 1; i < filteredArgs.length; i++) {
        if (filteredArgs[i] === "--port" && i + 1 < filteredArgs.length) {
          port = filteredArgs[++i];
        } else if (filteredArgs[i] === "--title" && i + 1 < filteredArgs.length) {
          title = filteredArgs[++i];
        } else if (filteredArgs[i] === "--dir" && i + 1 < filteredArgs.length) {
          dir = filteredArgs[++i];
        } else if (
          (filteredArgs[i] === "--start-cmd" || filteredArgs[i] === "--start_cmd") &&
          i + 1 < filteredArgs.length
        ) {
          startCmd = filteredArgs[++i];
        }
      }

      if (!port) {
        console.error("Error: --port <port> is required");
        process.exit(1);
      }

      try {
        const record = await registerApp(
          { name, port, title, dir, startCmd },
          registryPath,
        );
        console.log(JSON.stringify({ success: true, app: record }, null, 2));
      } catch (err) {
        console.error("Error registering app:", err.message);
        process.exit(1);
      }
      break;
    }

    case "auto-start": {
      try {
        const results = await autoStartApps({ registryPath });
        console.log(JSON.stringify({ success: true, count: results.length, results }, null, 2));
      } catch (err) {
        console.error("Error auto-starting apps:", err.message);
        process.exit(1);
      }
      break;
    }

    case "stop": {
      const name = filteredArgs[0];
      if (!name) {
        console.error("Error: App name is required (e.g. grokbot-app stop mario-game)");
        process.exit(1);
      }

      const shouldUnregister = filteredArgs.includes("--unregister");
      const app = await getApp(name, registryPath);
      if (!app) {
        console.error(`App "${name}" not found in registry.`);
        process.exit(1);
      }

      try {
        // Attempt to kill process listening on port
        try {
          execSync(`fuser -k ${app.port}/tcp 2>/dev/null || true`);
        } catch {
          // Ignore if fuser is not present or exits non-zero
        }

        let unregistered = false;
        if (shouldUnregister) {
          unregistered = await unregisterApp(name, registryPath);
        }

        console.log(
          JSON.stringify({
            success: true,
            stopped: app.name,
            port: app.port,
            unregistered,
          }),
        );
      } catch (err) {
        console.error(`Error stopping app "${name}":`, err.message);
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
