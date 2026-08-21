import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Proactive context compaction: agent judgment + occupancy threshold.
//
// Compaction triggers in two ways:
//   1. Agent judgment — the agent calls compact_context when it decides the
//      current context is no longer needed (task switch, phase done, user asked).
//      The reason/focus is passed as free-form `instructions`.
//   2. Occupancy threshold — when context usage reaches `ratio` of the window
//      (optionally capped by `maxTokens`), the extension arms compaction
//      automatically. The threshold comes EXCLUSIVELY from the extension's own
//      `proactive-compact` settings block: it has no semantic relation to
//      pi-observational-memory's compaction config, which measures a delta
//      since last compaction rather than occupancy, so no fallback to it
//      exists by design.
//
// Firing is asynchronous and OM-style (mirrors pi-observational-memory's own
// trigger): at `agent_end`, if the agent is idle, `ctx.compact()` is called
// WITHOUT awaiting. The turn that triggered compaction is therefore never paused
// mid-execution. The wait for the context rebuild is deferred to the next turn's
// context build, which awaits compaction (agent-session.js:865) — or, if the
// agent is idle in between, completes in the background with no perceived delay.
// pi's native compaction, by contrast, is awaited at message_end and blocks the
// triggering turn until the context is rebuilt. The total compaction cost is the
// same either way; async only moves where the wait lands.

type PendingSource = "agent" | "threshold";

interface PendingCompact {
  source: PendingSource;
  instructions?: string;
}

interface TriggerConfig {
  // Occupancy fraction of the window at which Channel B arms.
  ratio: number;
  // Optional cap on the threshold: min(ratio × window, maxTokens). Keeps
  // large-window models from deferring compaction to several hundred k tokens.
  maxTokens?: number;
}

const MIN_CONTEXT_TOKENS = 16000;
// Channel B does not arm when the computed threshold falls below this. A
// trigger this small means compaction could not shrink anything meaningful
// (pi keeps the most recent keepRecentTokens verbatim), and arming would loop
// on no-op compactions. Hardcoded on purpose: only reachable on windows far
// below the supported 200k+ range — not worth a config knob.
const DEFAULT_RATIO = 0.6;

let pending: PendingCompact | undefined;
let config: TriggerConfig = { ratio: DEFAULT_RATIO };
let compactionInFlight = false;

function readJson(path: string): any | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

// Merge global + project `proactive-compact` settings (project overrides).
function resolveConfig(cwd?: string): void {
  const global = readJson(join(homedir(), ".pi", "agent", "settings.json"));
  const project = cwd ? readJson(join(cwd, ".pi", "settings.json")) : undefined;
  const pc = { ...(global?.["proactive-compact"] ?? {}), ...(project?.["proactive-compact"] ?? {}) };
  config = {
    ratio: typeof pc.ratio === "number" ? pc.ratio : DEFAULT_RATIO,
    maxTokens: typeof pc.maxTokens === "number" ? pc.maxTokens : undefined,
  };
}

// Threshold in tokens. Infinity when the window size is unknown (occupancy
// cannot be computed → Channel B does not arm).
function effectiveThreshold(contextWindow: number | undefined): number {
  if (typeof contextWindow !== "number" || contextWindow <= 0) return Number.POSITIVE_INFINITY;
  let t = Math.max(1, Math.floor(contextWindow * config.ratio));
  if (config.maxTokens !== undefined) t = Math.min(t, config.maxTokens);
  return t;
}

function notify(source: PendingSource, instructions: string | undefined, hasUI: boolean, ui: any, error?: Error): void {
  if (!hasUI || !ui) return;
  if (error) {
    ui.notify(`Proactive compaction failed: ${error.message}`, "error");
    return;
  }
  const label =
    source === "threshold"
      ? "Compaction completed (occupancy threshold)"
      : instructions
        ? "Compaction completed"
        : "Proactive compaction completed";
  ui.notify(label, "info");
}

export default function proactiveCompact(pi: ExtensionAPI) {
  resolveConfig();

  // Reload config when the session (re)starts, so settings edits are picked up.
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    resolveConfig(ctx.cwd);
  });

  // Agent-driven compaction. Called when the agent judges the current context
  // is no longer needed (task switch, phase done, user asked). The `instructions`
  // carry the focus / reason and are forwarded as customInstructions so other
  // extensions (e.g. pi-observational-memory) can incorporate them.
  pi.registerTool({
    name: "compact_context",
    label: "Compact Context",
    description:
      "Request proactive context compaction. Runs asynchronously when the agent is idle; the current turn continues uninterrupted.",
    promptGuidelines: [
      "Call compact_context at context boundaries — points where earlier context stops being load-bearing for the work ahead: a new unrelated task starting, a major phase finished, or the user asked to compact. State the focus in `instructions`.",
      "Mid-task, apply the same test before calling: earlier context still load-bearing → defer compaction.",
    ],
    parameters: Type.Object({
      instructions: Type.Optional(
        Type.String({
          description:
            "Focus or reason for the compaction, forwarded as customInstructions. E.g. 'TASK BOUNDARY: new unrelated task; drop previous context', 'keep only code changes and open errors; drop exploratory search noise'.",
        }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
      pending = { source: "agent", instructions: params.instructions };
      const usage = ctx.getContextUsage();
      return {
        content: [
          {
            type: "text",
            text: `Compaction requested; will run asynchronously when the agent is idle. Context was ${usage?.percent ?? "?"}% of window.`,
          },
        ],
      };
    },
  });

  // Occupancy threshold: arm compaction when context usage reaches the
  // configured threshold. Non-blocking arm; the actual compaction fires
  // asynchronously at agent_end when the agent is idle.
  pi.on("tool_execution_end", (_event, ctx: ExtensionContext) => {
    if (pending || compactionInFlight) return;
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens == null) return;
    const threshold = effectiveThreshold(usage.contextWindow);
    // See MIN_CONTEXT_TOKENS: below this, compaction cannot shrink anything
    // meaningful and arming would loop on no-op compactions.
    if (threshold < MIN_CONTEXT_TOKENS) return;
    if (usage.tokens >= threshold) {
      pending = { source: "threshold" };
    }
  });

  // Fire compaction asynchronously, OM-style: at agent_end, if the agent is idle,
  // call ctx.compact() WITHOUT awaiting so the agent loop is never paused. The
  // compaction runs in the background; a new turn may begin while it completes.
  // Mirrors pi-observational-memory's compaction-trigger.ts (setTimeout(0) +
  // isIdle guard + in-flight lock). If the agent is not idle yet, defer and let
  // the next agent_end retry (pending is kept until a real fire).
  pi.on("agent_end", (_event, ctx: ExtensionContext) => {
    if (pending === undefined || compactionInFlight) return;
    const hasUI = ctx.hasUI;
    const ui = ctx.ui;
    compactionInFlight = true;
    setTimeout(() => {
      if (!ctx.isIdle()) {
        // Agent became busy again before going idle; retry on the next agent_end.
        compactionInFlight = false;
        return;
      }
      const { source, instructions } = pending;
      pending = undefined;
      ctx.compact({
        customInstructions: instructions,
        onComplete: () => {
          compactionInFlight = false;
          notify(source, instructions, hasUI, ui);
        },
        onError: (e: Error) => {
          compactionInFlight = false;
          notify(source, instructions, hasUI, ui, e);
        },
      });
    }, 0);
  });
}
