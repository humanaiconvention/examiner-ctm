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

- [ ] Phase A1: Persistence & Observability Foundations
  - Stand up Redis for checkpoint/ephemeral memory and Postgres + pgvector for long-term semantic state.
  - Integrate OpenTelemetry instrumentation with exports to Postgres (primary), Datadog, and optional Azure Monitor.
  - Configure secrets (Azure Key Vault) and Entra ID SSO/RBAC scaffolding; expose LangSmith + LangGraph Studio hooks.
- [ ] Phase A2: LangChain Primitives & Memory Refactor
  - Introduce prompt registry, LangChain tool wrappers, planner/executor/critic agents, and shared memory drivers.
  - Implement cost/latency-aware model routing with Redis exact cache, semantic cache, and retrieval cache layers.
- [ ] Phase A3: LangGraph Orchestration Upgrade
  - Migrate research/explorer flows to LangGraph FSM with branching, retries, loopbacks, and speculative parallel retrieval.
  - Persist checkpoints to Redis and execution metadata to Postgres for replay.
- [ ] Phase A4: Production Hardening & Security
  - Add structured logging, Grafana dashboards, dual-layer rate limiting, and Azure deployment templates (containers/Helm/azd).
  - Enforce RBAC roles, MFA, conditional access, and audit logging aligned with OpenTelemetry traces and Postgres audit trails.
- [ ] Phase A5: Multi-Agent Coordination Patterns
  - Implement specialist agents (retrieval, synthesis, reviewer) with scoped tools/memory and message bus persistence.
  - Validate with LangSmith scenarios and load tests meeting latency/cost budgets.
- [ ] Phase A6: Fault Tolerance & Resilience
  - Add node-level retry policies, exponential backoff, checkpoint resume, and compensation flows captured in traces.
  - Document recovery runbooks and regression tests for partial-failure scenarios.

<!-- TODOS-END -->

## Pre-Execution Checklist (Phase A Foundations)

- [ ] Provision or confirm Redis checkpoint cluster with high availability, TLS, and backup policy.
- [ ] Provision or confirm Postgres + pgvector instance for semantic memory with migration access and connection pooling.
- [ ] Update IaC/config repos with new endpoints, credentials sourcing (Azure Key Vault), and health check URLs.
- [ ] Validate Entra ID tenant, RBAC role mappings (viewer/contributor/maintainer/admin), MFA, and conditional access policies.
- [ ] Prepare rate-limiting configuration (per-provider + per-tenant) and ensure limiter metrics feed into OpenTelemetry traces.
- [ ] Configure OpenTelemetry collector/export paths (Postgres, Datadog, optional Azure Monitor) and obtain API keys/tokens.
- [ ] Verify LangSmith and LangGraph Studio account access/licensing for observability and graph debugging.
- [ ] Stage baseline smoke tests for Redis/Postgres connectivity, telemetry ingestion, and security enforcement before rollout.
- [ ] Document rollback steps and feature flag toggles for Redis/Postgres/telemetry integrations.

## Phase A Workflow Reference

1. **Phase A1: Persistence & Observability Foundations** – Deploy Redis + Postgres/pgvector, secrets, SSO/RBAC, OpenTelemetry exports, LangSmith/LangGraph Studio hooks.
2. **Phase A2: LangChain Primitives & Memory Refactor** – Introduce prompt registry, LangChain tool wrappers, agent roles, and multi-tier caching with cost-aware routing.
3. **Phase A3: LangGraph Orchestration Upgrade** – Migrate flows to LangGraph FSM with branching, retries, speculative parallelism, and checkpoint persistence.
4. **Phase A4: Production Hardening & Security** – Add structured logging, Grafana/Azure dashboards, dual-layer rate limits, Azure deployment templates, and audit logging.
5. **Phase A5: Multi-Agent Coordination Patterns** – Implement specialist agents, message bus persistence, and latency/cost validation via LangSmith scenarios.
6. **Phase A6: Fault Tolerance & Resilience** – Enable node-level retries, checkpoint resume, compensation flows, and document failure recovery procedures.

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
