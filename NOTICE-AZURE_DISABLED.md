Azure infra artifacts preserved but disabled

This repository contains IaC templates and GitHub Actions workflows that can deploy Azure resources (Cognitive Services, Power Platform, Static Web Apps). Per project settings, automatic triggers for these workflows have been disabled and they are now manual-only (workflow_dispatch) to prevent accidental or scheduled activation.

If you need to re-enable any workflow, follow these steps:
1. Review the workflow in `.github/workflows/`.
2. Reintroduce the triggers you need (push, pull_request, schedule) only after confirming Azure subscription, billing, and secrets are intentionally set.
3. Ensure secrets used by the workflow are removed or rotated if they were previously present and you no longer trust them.

Workflows changed in this commit:
- .github/workflows/deploy-powerplatform.yml (push trigger removed — manual-only)
- .github/workflows/azure-static-web-app.yml (push/pull_request triggers removed — manual-only)
- .github/workflows/powerplatform-export.yml (schedule removed — manual-only)
- .github/workflows/powerplatform-unpack-pr.yml (schedule removed — manual-only)
- .github/workflows/azure-cognitive-test.yml (push trigger removed — manual-only)

If you want me to push these changes to a branch or open a PR, tell me and I'll commit to `wip/disable-azure` and push it for review.
