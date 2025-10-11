Saved work snapshot: Azure diagnostics helpers

What I saved:
- `consciousness-explorer/test/scripts/verify-azure-deployments.ps1` — PowerShell helper to compare `.env` AZURE_OPENAI_* entries with management-plane data (keys and deployments) via Azure CLI.
- Ran `test/scripts/list-azure-deployments.mjs` and `test/scripts/check-azure-model.mjs` from the `consciousness-explorer` folder; captured 404 Resource not found responses for the configured regions (EASTUS, EASTUS2, WESTUS3).

How to continue locally:
1. Run the helper to inspect .env and Azure management-plane:
   ```powershell
   $env:DOTENV_CONFIG_PATH='D:\humanaiconvention\.env'
   .\consciousness-explorer\test\scripts\verify-azure-deployments.ps1
   ```
2. Update `.env` deployment names/endpoints/keys to match the Azure Portal / `az` output, then re-run the repo diagnostics:
   ```powershell
   $env:DOTENV_CONFIG_PATH='D:\humanaiconvention\.env'; node .\consciousness-explorer\test\scripts\check-azure-model.mjs
   ```

Notes:
- I pushed these changes to branch `wip/save-azure-diagnostics` so your progress is preserved remotely.
- If you want me to open a PR, revert the embedded `pgvector` addition, or strip sensitive files from the commit, tell me which and I’ll prepare it.