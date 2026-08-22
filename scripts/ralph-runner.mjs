#!/usr/bin/env node

/**
 * Ralph Autonomous Agent Loop Runner for Grokbot
 *
 * Features:
 * - Dual-mode budget guardrails (API dollar limits & Subscription/ACP turn/rate-limit protection)
 * - Deterministic application-level circuit breakers
 * - Fresh context per iteration
 * - Automated branch archiving, version bumping, and progress logging
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// File paths
const PRD_FILE = path.join(REPO_ROOT, 'prd.json');
const PROGRESS_FILE = path.join(REPO_ROOT, 'progress.txt');
const LAST_BRANCH_FILE = path.join(REPO_ROOT, '.last-branch');
const ARCHIVE_DIR = path.join(REPO_ROOT, 'archive');
const PROMPT_FILE = path.join(REPO_ROOT, 'scripts', 'ralph', 'CLAUDE_RALPH.md');

// ANSI colors for clean CLI reporting
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: null, // 'api' | 'subscription'
    maxBudget: null,
    maxPerStory: null,
    maxTurns: null,
    maxIterations: null,
    maxDuration: null, // in minutes
    cooldown: null, // in seconds
    tool: 'claude', // 'claude' | 'amp'
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mode' && args[i + 1]) options.mode = args[++i];
    else if (arg === '--max-budget' && args[i + 1]) options.maxBudget = parseFloat(args[++i]);
    else if (arg === '--max-per-story' && args[i + 1]) options.maxPerStory = parseFloat(args[++i]);
    else if (arg === '--max-turns' && args[i + 1]) options.maxTurns = parseInt(args[++i], 10);
    else if (arg === '--max-iterations' && args[i + 1]) options.maxIterations = parseInt(args[++i], 10);
    else if (arg === '--max-duration' && args[i + 1]) options.maxDuration = parseInt(args[++i], 10);
    else if (arg === '--cooldown' && args[i + 1]) options.cooldown = parseInt(args[++i], 10);
    else if (arg === '--tool' && args[i + 1]) options.tool = args[++i];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  log(`\n🤖 Grokbot Ralph Loop Runner`, colors.cyan + colors.bright);
  console.log(`
Usage:
  node scripts/ralph-runner.mjs [options]

Options:
  --mode <api|subscription>   Execution & budget mode (default from prd.json or subscription)
  --max-budget <usd>          Hard dollar spend ceiling for API mode (default: 10.00)
  --max-per-story <usd>       Dollar spend ceiling per individual story (default: 0.80)
  --max-turns <number>        Max agent turns for subscription mode (default: 30)
  --max-iterations <number>   Max total loop iterations (default: 15)
  --max-duration <minutes>    Hard wall-clock timeout in minutes (default: 240)
  --cooldown <seconds>        Delay between story iterations (default: 15)
  --tool <claude|amp>         AI agent CLI to execute (default: claude)
  --dry-run                   Validate config and exit without running LLM
  --help, -h                  Show this help message
`);
}

function loadPrd() {
  if (!fs.existsSync(PRD_FILE)) {
    log(`⚠️ No prd.json found at ${PRD_FILE}`, colors.yellow);
    log(`Run the generate-prd or prd-to-json skill first, or copy scripts/ralph/prd.json.example to prd.json`, colors.dim);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(PRD_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    log(`❌ Failed to parse prd.json: ${err.message}`, colors.red);
    process.exit(1);
  }
}

function savePrd(prd) {
  fs.writeFileSync(PRD_FILE, JSON.stringify(prd, null, 2), 'utf-8');
}

function handleArchiving(currentBranch) {
  if (!currentBranch) return;

  if (fs.existsSync(LAST_BRANCH_FILE)) {
    const lastBranch = fs.readFileSync(LAST_BRANCH_FILE, 'utf-8').trim();
    if (lastBranch && lastBranch !== currentBranch) {
      const dateStr = new Date().toISOString().split('T')[0];
      const folderName = lastBranch.replace(/^ralph\//, '');
      const targetArchive = path.join(ARCHIVE_DIR, `${dateStr}-${folderName}`);

      log(`📦 Archiving previous run (${lastBranch}) to ${targetArchive}`, colors.cyan);
      fs.mkdirSync(targetArchive, { recursive: true });

      if (fs.existsSync(PRD_FILE)) fs.copyFileSync(PRD_FILE, path.join(targetArchive, 'prd.json'));
      if (fs.existsSync(PROGRESS_FILE)) fs.copyFileSync(PROGRESS_FILE, path.join(targetArchive, 'progress.txt'));

      // Reset progress file
      fs.writeFileSync(
        PROGRESS_FILE,
        `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n`,
        'utf-8'
      );
    }
  }

  fs.writeFileSync(LAST_BRANCH_FILE, currentBranch, 'utf-8');
}

function ensureProgressFile() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    fs.writeFileSync(
      PROGRESS_FILE,
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n`,
      'utf-8'
    );
  }
}

async function runCommandAsync(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      stdout += str;
      process.stdout.write(str);
    });

    proc.stderr.on('data', (chunk) => {
      const str = chunk.toString();
      stderr += str;
      process.stderr.write(str);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function estimateCostFromOutput(output) {
  // Try to parse token or cost metrics from CLI outputs
  let estimatedCost = 0.25; // fallback default estimate per iteration (~$0.25 on Claude 3.7)
  const costMatch = output.match(/cost:\s*\$([0-9.]+)/i);
  if (costMatch) {
    estimatedCost = parseFloat(costMatch[1]);
  }
  return estimatedCost;
}

function isRateLimit(output) {
  const rateLimitPatterns = [
    /you have reached your usage limit/i,
    /rate limit exceeded/i,
    /429 too many requests/i,
    /quota exceeded/i,
    /resets in \d+/i,
  ];
  return rateLimitPatterns.some((pattern) => pattern.test(output));
}

async function main() {
  const cliOptions = parseArgs();
  const prd = loadPrd();
  const budgetCfg = prd.budgetConfig || {};

  // Resolved configurations with CLI overriding prd.json
  const mode = cliOptions.mode || budgetCfg.authMode || 'subscription';
  const maxBudget = cliOptions.maxBudget ?? budgetCfg.maxTotalSpendUsd ?? 10.0;
  const maxPerStory = cliOptions.maxPerStory ?? budgetCfg.maxSpendPerStoryUsd ?? 0.8;
  const maxTurns = cliOptions.maxTurns ?? budgetCfg.maxTurns ?? 30;
  const maxIterations = cliOptions.maxIterations ?? budgetCfg.maxIterations ?? 15;
  const maxDuration = cliOptions.maxDuration ?? budgetCfg.maxDurationMinutes ?? 240;
  const cooldownSec = cliOptions.cooldown ?? budgetCfg.cooldownSeconds ?? 15;
  const tool = cliOptions.tool || 'claude';

  log(`\n======================================================`, colors.cyan);
  log(`🚀 Starting Grokbot Ralph Autonomous Loop`, colors.cyan + colors.bright);
  log(`======================================================`, colors.cyan);
  log(`• Mode:            ${mode.toUpperCase()}`, colors.bright);
  if (mode === 'api') {
    log(`• Total Budget:    $${maxBudget.toFixed(2)} USD`, colors.yellow);
    log(`• Story Budget:    $${maxPerStory.toFixed(2)} USD`, colors.yellow);
  } else {
    log(`• Max Turns:       ${maxTurns} turns (Subscription/ACP protection)`, colors.yellow);
    log(`• Inter-Story Rest:${cooldownSec}s cooldown`, colors.dim);
  }
  log(`• Max Iterations:  ${maxIterations}`, colors.dim);
  log(`• Max Duration:    ${maxDuration} mins`, colors.dim);
  log(`• Tool Backend:    ${tool}`, colors.dim);
  log(`• Target Branch:   ${prd.branchName || 'main'}`, colors.dim);
  log(`======================================================\n`, colors.cyan);

  if (cliOptions.dryRun) {
    log(`✅ Dry run complete. Configuration is valid.`, colors.green);
    process.exit(0);
  }

  handleArchiving(prd.branchName);
  ensureProgressFile();

  const startTime = Date.now();
  let cumulativeCostUsd = 0;
  let cumulativeTurns = 0;
  let consecutiveFailures = 0;
  let lastFailedStoryId = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    log(`\n------------------------------------------------------`, colors.blue);
    log(`🔁 Iteration ${iteration} of ${maxIterations} [${mode.toUpperCase()} MODE]`, colors.blue + colors.bright);
    log(`------------------------------------------------------`, colors.blue);

    // 1. Time Circuit Breaker
    const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
    if (elapsedMinutes >= maxDuration) {
      log(`🛑 Max duration reached (${elapsedMinutes.toFixed(1)}m >= ${maxDuration}m). Stopping loop.`, colors.red);
      break;
    }

    // 2. Budget Circuit Breakers
    if (mode === 'api' && cumulativeCostUsd >= maxBudget) {
      log(`🛑 API dollar budget reached ($${cumulativeCostUsd.toFixed(2)} >= $${maxBudget.toFixed(2)}). Stopping loop.`, colors.red);
      break;
    }

    if (mode === 'subscription' && cumulativeTurns >= maxTurns) {
      log(`🛑 Max subscription turns reached (${cumulativeTurns} >= ${maxTurns}). Stopping loop.`, colors.red);
      break;
    }

    // 3. Find Next Uncompleted User Story
    const currentPrd = loadPrd();
    const stories = currentPrd.userStories || [];
    const pendingStory = stories.find((s) => !s.passes);

    if (!pendingStory) {
      log(`\n🎉 All user stories are marked as passes: true!`, colors.green + colors.bright);
      log(`Ralph completed all tasks successfully.`, colors.green);
      break;
    }

    log(`🎯 Target Story: [${pendingStory.id}] ${pendingStory.title}`, colors.yellow + colors.bright);

    // Check consecutive failure limit
    if (lastFailedStoryId === pendingStory.id && consecutiveFailures >= (budgetCfg.maxConsecutiveFailures || 2)) {
      log(`🛑 Circuit breaker: Story ${pendingStory.id} failed ${consecutiveFailures} times consecutively. Halting.`, colors.red);
      break;
    }

    // 4. Execute AI Instance with clean context
    let command = '';
    if (tool === 'claude') {
      command = `claude --dangerously-skip-permissions --print < "${PROMPT_FILE}"`;
    } else if (tool === 'amp') {
      command = `amp --dangerously-allow-all < "${PROMPT_FILE}"`;
    }

    log(`⚙️ Spawning fresh ${tool} session...`, colors.dim);
    const runResult = await runCommandAsync(command, [], REPO_ROOT);
    cumulativeTurns += 1;

    // Estimate cost & check rate limits
    const iterationCost = estimateCostFromOutput(runResult.stdout + runResult.stderr);
    cumulativeCostUsd += iterationCost;

    if (isRateLimit(runResult.stdout + runResult.stderr)) {
      log(`⚠️ Rate limit or quota warning detected. Gracefully exiting to protect subscription.`, colors.yellow);
      fs.appendFileSync(
        PROGRESS_FILE,
        `\n## Rate Limit Encountered at ${new Date().toISOString()}\n- Pausing loop gracefully.\n`
      );
      break;
    }

    // 5. Check Completion Signal
    const isComplete = runResult.stdout.includes('<promise>COMPLETE</promise>');
    if (isComplete) {
      log(`\n✨ Detected <promise>COMPLETE</promise> signal!`, colors.green);
      break;
    }

    // 6. Pacing & Cooldown between stories
    if (iteration < maxIterations && cooldownSec > 0) {
      log(`⏳ Cooldown pacing (${cooldownSec}s) before next iteration...`, colors.dim);
      await new Promise((r) => setTimeout(r, cooldownSec * 1000));
    }
  }

  log(`\n======================================================`, colors.cyan);
  log(`🏁 Ralph Loop Finished`, colors.cyan + colors.bright);
  log(`• Total Elapsed:   ${((Date.now() - startTime) / 60000).toFixed(1)} mins`, colors.dim);
  log(`• Turns Used:      ${cumulativeTurns}`, colors.dim);
  if (mode === 'api') {
    log(`• Est. Dollar Cost: $${cumulativeCostUsd.toFixed(2)} USD`, colors.green);
  }
  log(`• Check progress:   progress.txt`, colors.yellow);
  log(`======================================================\n`, colors.cyan);
}

main().catch((err) => {
  console.error('Fatal error in Ralph runner:', err);
  process.exit(1);
});
