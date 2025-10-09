# Project snapshot — quick start

Purpose

This file is a focused handoff for picking up work on the HumanAI Convention workspace (Explorer / Research / Flows / Tiles). Put this in the repo root so an engineer or an assistant can resume without digging through the entire codebase.

High-level architecture

- Explorer (dashboard/flow-selector): UI that lists "flows" and loads "tiles" (tile.json + logic.js). It orchestrates flow execution and integrates a central StateAwareController.
- Flows: small modules that implement reasoning patterns (context anchoring, causal reasoning, ethics, planning, interpretability, creativity). Each flow returns a `flowResult` and `stateSignals` which the controller ingests.
- StateAwareController: central AMIE-inspired controller that tracks phases, knowledge, uncertainties, observations, and artifact/evidence requests. It exposes: `integrateObservation(flow, bundle)`, `processPendingArtifacts()` (sync/async), and `getSnapshot()`.
- Research simulator: two options
  - JS fallback bridge: `consciousness-explorer/modules/research/simulatorBridge.js` — deterministic local scoring used by tests and local runs.
  - Python shim: `python/sim_shim.py` — lightweight HTTP shim exposing `/simulate` for production/dev use. The bridge will call this shim if `SIM_SHIM_URL` is set.

Important files & locations

- Flow selector (UI orchestration): `consciousness-explorer/dashboard/flow-selector.js`
  - Key: options.simulateSync (default true) controls whether artifact simulation is awaited synchronously.
  - API: returns `setSimulateSync(value)`, `getController()`, `getControllerSnapshot()`, `getSharedContext()`, and `getSharedContextSnapshot()`.
  - Initializes the shared context bus metadata so dashboard integrations can subscribe to `sharedContext` updates.

- Shared context bus: `consciousness-explorer/modules/context/sharedContextBus.js`
  - Maintains a normalized `ContextEnvelope`, publishes versioned commits, and exposes `updateFromFlow`, `subscribe`, and `snapshot()` helpers.
  - Used by `StateAwareController` and `GraphOrchestrator` to coordinate shared state across flows and graph nodes.

- State controller: `consciousness-explorer/modules/flows/stateController.js`
  - Key methods: `integrateObservation(flow, bundle)`, `processPendingArtifacts()`, `getSnapshot()`.
  - Accepts `{ sharedContext, sharedContextOptions }` in the constructor and publishes flow observations to the shared context bus.

- Graph orchestrator: `consciousness-explorer/modules/flows/graphOrchestrator.js`
  - Provides `execute`, `executeLinear`, `executeGraph`, and now injects `sharedContext` & `sharedContextSnapshot` into payloads and node contexts for graph-aware flows.
- LangGraph runtime loader (optional): `consciousness-explorer/modules/flows/langGraphRuntime.js`
  - Lazily imports `@langchain/langgraph`, caches native executors, and falls back to the shim path when the dependency is missing or compilation fails.
  - `GraphOrchestrator` checks this module whenever `ENABLE_GRAPH_EXPLORER` is enabled, annotating results with metadata (`graphMetadata.runtime`, `native`, `fallback`).
- Research simulator:
  - JS bridge (fallback): `consciousness-explorer/modules/research/simulatorBridge.js`
  - Python shim: `python/sim_shim.py` (HTTP server, POST /simulate)
  - Optional helper to spawn shim: `consciousness-explorer/modules/research/pythonShimManager.js`

- Tests and test helpers:
  - Web tests (Vitest): `web/tests/*` and `web/src/__tests__` etc.
  - Key tests added: `web/tests/state.controller.test.ts`, `web/tests/contextAnchoringFlow.unit.test.ts`, `web/tests/research.simulator.integration.test.ts`.
  - New shared context coverage: `consciousness-explorer/test/sharedContextBus.test.js` validates the bus, controller integration, and orchestrator propagation.

Quick dev commands

- Install & lint/test (from repo root):

```pwsh
npm install
npm run lint
npm run test
```

- Run web dev server (workspace task available):

```pwsh
npm run dev
# or use the workspace "web: dev" task in VSCode
```

- Run the Python shim locally (dev) and point the JS bridge at it:

```pwsh
# start the shim in a terminal
python python/sim_shim.py
# set env for Node or the browser environment: SIM_SHIM_URL=http://127.0.0.1:8765
# For local Node scripts, you can export it or set in call:
$env:SIM_SHIM_URL = 'http://127.0.0.1:8765'
# then run the app/tests which rely on fetch to call the shim
```

## Runtime feature flags

Two feature flags gate the new integrations. They can be set through environment variables (preferred) or injected at runtime via `globalThis.__RUNTIME_FLAGS__` for browser-based experiments.

- `ENABLE_LANGCHAIN_CORE`
  - Default: `false`
  - When enabled, `langchainClient` boots the LangChain runtime and emits step telemetry. When disabled, flows fall back to the legacy probe pipeline and log a `runtime:disabled` event.
- `ENABLE_GRAPH_EXPLORER`
  - Default: `false`
  - When enabled, `GraphOrchestrator` syncs into graph mode, exposing `sharedContextSnapshot` to each node. When disabled, execution remains linear but still publishes shared context updates.

### Local usage (PowerShell examples)

```pwsh
# Enable LangChain + graph execution for the current shell
$env:ENABLE_LANGCHAIN_CORE = '1'
$env:ENABLE_GRAPH_EXPLORER = '1'

# Run tests with both flags enabled
npm run test

# Clear the flags for linear fallback
Remove-Item env:ENABLE_LANGCHAIN_CORE
Remove-Item env:ENABLE_GRAPH_EXPLORER
```

The flag loader also respects lowercase booleans (`true`, `false`), `on`/`off`, and numeric literals (`0`, `1`). For browser devtools or Playwright tests you can set:

```js
globalThis.__RUNTIME_FLAGS__ = { ENABLE_LANGCHAIN_CORE: true, ENABLE_GRAPH_EXPLORER: false };
```

## LangGraph execution (optional)

Native graph orchestration is an optional add-on. If `@langchain/langgraph` is not installed the orchestrator automatically falls back to the existing shim path.

1. Install the optional dependency (workspace root or `consciousness-explorer` package):

```pwsh
npm install @langchain/langgraph @langchain/core
```

2. Enable the graph explorer flag (see runtime flags above) and run flows/tests as normal. The orchestrator will:
   - Attempt to load LangGraph lazily via `modules/flows/langGraphRuntime.js`.
   - Use native `StateGraph` execution when available, annotating results with `graphMetadata.runtime = "langgraph-native"`.
   - Fall back to the shim and mark `graphMetadata.runtime = "graph-shim"` when the dependency is missing, compilation fails, or the flag is disabled.

3. Targeted tests:

```pwsh
npm test -- --run graphOrchestrator.langgraph.test.js
npm test -- --run langGraphRuntime.test.js
```

### Pilot graph example

The context anchoring flow now ships with a pilot graph definition at `modules/flows/contextAnchoringGraph.js`. When the graph flag is enabled, you can register it with the orchestrator and execute the flow like this:

```js
import StateAwareController from './modules/flows/stateController.js';
import { GraphOrchestrator } from './modules/flows/graphOrchestrator.js';
import { createContextAnchoringGraphDefinition } from './modules/flows/contextAnchoringGraph.js';

const controller = new StateAwareController();
const orchestrator = new GraphOrchestrator({
  controller,
  executors: {
    'context-anchoring': runContextAnchoringFlow
  }
});

const definition = createContextAnchoringGraphDefinition();
orchestrator.setGraphDefinition('context-anchoring', definition);

const result = await orchestrator.execute('context-anchoring', {
  intent: 'map the decision context',
  perspective: 'human'
});

console.log(result.graphMetadata.runtime); // "langgraph-native" when LangGraph is installed and flag enabled
```

When `@langchain/langgraph` is unavailable or compilation fails, the orchestrator automatically falls back to the shim path and sets `graphMetadata.runtime` to `"graph-shim"` while still returning the flow output.

### Pick up checklist (what I'd do next)

1. Implement robust Python shim integration (in-progress)
   - Provide a child-process manager or a production HTTP endpoint wrapper.
   - Make sure the bridge falls back gracefully when the shim is down.
2. Add controller edge-case tests
   - concurrent artifacts, timeouts, simulator errors, knowledge conflict resolution, phase transitions.
3. UI surface for sim results
   - Show `bundle.flowResult.simResult` details in tiles when present (debug mode optional).
4. Add timeouts / perf fallback for synchronous `processPendingArtifacts()` so the UI doesn't hang.
5. Docs: add README sections and deployment notes describing simulator options and how to run the shim in production.
6. Resolve Dependabot alerts (1 critical, 1 moderate) flagged after pushing commit 537e997 to `main`.

<!-- TODOS-START -->

## Tracked Todos

- [x] Phase 1: Solidify LangChain adapters
  - Inventory placeholder adapters and document required LangChain primitives for explorer/research flows.
  - Implement a shared LangChain client bootstrap that exposes RunnableSequence builders and tool registries.
  - Refactor explorer probes and research pipelines to call the real LangChain helpers while preserving current signatures and fallbacks.
  - Extend telemetry/logging so LangChain steps emit structured outputs and add regression coverage to guard the fallback path.
- [x] Phase 2: Prepare shared context plumbing
  - [x] Introduce a central context bus (or reuse GraphOrchestrator shared state) and propagate envelope updates across modules.
  - [x] Add runtime flags (ENABLE_LANGCHAIN_CORE, ENABLE_GRAPH_EXPLORER) and document linear vs graph execution modes.
  - [x] Update docs with developer recipes for enabling LangChain locally.
- [ ] Phase 3: Layer LangGraph execution
  - Install LangGraph and generate graph definitions that map existing flow steps to nodes using shared state.
  - Enhance GraphOrchestrator to prefer LangGraph when enabled, with safe fallback to linear execution.
  - Model explorer and research flows with branching/concurrency, persisting envelopes between nodes.
  - Add integration tests covering both linear and graph orchestration paths.
- [x] Phase 4: Rollout & observability
  - Guard feature rollout with flags per environment and monitor telemetry.
  - Add dashboards comparing latency/success/context completeness between modes.
  - Run regression simulations to validate shared-state durability before enabling graph mode broadly.

<!-- TODOS-END -->

Notes & gotchas

- The flow-selector currently defaults to synchronous simulation processing (deterministic behavior). You can toggle at runtime with `setSimulateSync(false)` returned from `initFlowSelector`.
- The JS simulator bridge will prefer the shim when `SIM_SHIM_URL` is present in the environment (or `globalThis.__SIM_SHIM_URL__` for browser tests). If the shim cannot be reached the bridge falls back to the deterministic JS scoring and annotates the result with `shimError`.
- Tests run in a Node/JSDOM environment. A few tests directly manipulate `document` or expect DOM presence; run them inside the web test runner (Vitest workspace) as usual.

Contacts / context

- Branch: current work is on branch `devcontainer/add`.
- CI: Vitest is used for unit/integration tests; keep an eye on unhandled async operations — tests failing with "something ran after teardown" are usually caused by uncancelled timeouts/promises.

Where to look first when resuming

1. `consciousness-explorer/dashboard/flow-selector.js` — orchestration, simulateSync toggle and tile-loading logic.
2. `consciousness-explorer/modules/flows/stateController.js` — controller logic and artifact processing.
3. `consciousness-explorer/modules/research/simulatorBridge.js` and `python/sim_shim.py` — simulator integration.
4. `web/tests/*` — tests added to validate the controller, flows, and simulator.

If you'd like me to continue

- Say which todo to pick up next (I left a small tracked todo list in the repo while I was working). If you want me to continue now I can:
  - finish the Python shim integration and add tests, or
  - add controller edge-case tests, or
  - implement the timeout/fallback for synchronous processing.

✦ File saved: start.md

---

Status note (2025-10-08): LangChain telemetry instrumentation was merged to `main` via PR #68. The topic branch
`modules/reconcile-modules-langchain-telemetry` was pushed and merged; local topic branch `modules/reconcile-modules` has been deleted.
Key commits: c65c887 (instrument(langchain): emit telemetry events, wire to probeLogger, add logging test), 0776c7f (merge).
PR: [modules/reconcile-modules-langchain-telemetry PR](https://github.com/humanaiconvention/consciousness-explorer/pull/new/modules/reconcile-modules-langchain-telemetry)

Status note (2025-10-08 late): Pushed 537e997 "feat: consolidate LangGraph rollout phases 1-4" directly to `main`; next session pick up Phase 3 graph execution work and remediate the new Dependabot findings.
