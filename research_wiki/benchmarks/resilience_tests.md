---
created_by: github:humanaiconvention
last_updated: 2025-10-09T12:15:00Z
tags:
  - benchmarks
  - resilience
  - testing
version: "0.1.0"
source_url: null
source_timestamp: 2025-10-09T12:15:00Z
license: CC-BY-4.0
---

# Research Entry · benchmarks/resilience_tests

## Title

Resilience Test Benchmarks for Explorer Research Integration

## Summary

Resilience benchmarks validate that the Explorer can tolerate simulator outages, wiki misses, and LangGraph fallbacks. They build on existing Vitest suites (`test/simulatorBridge.retry.test.js`, `test/e2e/flowSelector.autoDiscovery.e2e.test.js`) and extend them to cover wiki ingestion and research lookup chains. This entry catalogs the core scenarios and acceptance thresholds.

## Integration Points

- Vitest runner (`npx vitest run`): Execute the resilience suite with `SIM_SHIM_INTEGRATION=1` to exercise shim + wiki interactions.
- `modules/research/simulatorBridge.js`: Ensure retry metrics remain stable when wiki lookups introduce latency.
- `modules/flows/stateController.js`: Verify `simulatorStats` align with wiki provenance when fallback paths trigger.
- `web/tests` and `consciousness-explorer/test`: Add harnesses that ingest wiki fixtures before running flows.

## Related Concepts

- [[concepts/robust_integration]]
- [[flows/langgraph_topology]]
- `test/e2e/flowSelector.autoDiscovery.e2e.test.js`

## Provenance

Benchmark definitions synthesized from existing integration tests, simulator telemetry instrumentation, and roadmap tasks captured in the `devcontainer/add` branch history.

## Suggested Extensions

- Add Playwright-based browser benchmarks that visualize wiki-informed tiles in the dashboard.
- Integrate with GitHub Actions matrix to compare results against baseline FAISS snapshots.
- Emit JSON summaries consumable by the upcoming observability workbooks in `observability-thresholds-baseline.json`.
