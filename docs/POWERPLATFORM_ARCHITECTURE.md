# Power Platform Integration Architecture

## Overview

This document illustrates the architecture and data flow for the HumanAI Convention's Power Platform integration.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Development Flow                              │
└──────────────────────────────────────────────────────────────────────┘

    Developer                GitHub Repository              Power Platform
    ┌────────┐              ┌────────────────┐            ┌───────────────┐
    │        │              │                 │            │               │
    │ Local  │   git push   │   Main Branch   │  Workflow  │ HumanAI-Pages │
    │  Dev   │─────────────▶│                 │───────────▶│     -Dev      │
    │        │              │  .github/       │  Trigger   │               │
    └────────┘              │   workflows/    │            │ Power Pages   │
         │                  │                 │            │               │
         │                  └────────────────┘            └───────────────┘
         │                          │
         │ npm run                  │
         │ deploy:powerplatform     │
         │                          │
         └──────────────────────────┘
           Direct Deploy (CLI)
```

## Deployment Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Workflow                       │
└─────────────────────────────────────────────────────────────────────┘

  1. Trigger          2. Quality          3. Build            4. Deploy
  ┌─────────┐        ┌─────────┐        ┌─────────┐         ┌─────────┐
  │         │        │         │        │         │         │         │
  │  Push   │───────▶│  Lint   │───────▶│  npm    │────────▶│   PAC   │
  │  to     │        │  Test   │        │  build  │         │   CLI   │
  │  main   │        │  Type   │        │         │         │ Upload  │
  │         │        │  Check  │        │         │         │         │
  └─────────┘        └─────────┘        └─────────┘         └─────────┘
                           │                  │                   │
                           ▼                  ▼                   ▼
                      ┌─────────┐       ┌─────────┐        ┌─────────┐
                      │ Quality │       │  Build  │        │  Deploy │
                      │  Gates  │       │ Artifact│        │  Status │
                      │  Pass   │       │  Ready  │        │ Success │
                      └─────────┘       └─────────┘        └─────────┘
```

## Component Interaction

```
┌────────────────────────────────────────────────────────────────────┐
│                         Local Development                           │
└────────────────────────────────────────────────────────────────────┘

   ┌───────────────┐
   │   Developer   │
   └───────┬───────┘
           │
           ├─── npm run build:powerplatform
           │    └─▶ Sets VITE_DEPLOYMENT_TARGET=powerplatform
           │        └─▶ Builds web app with PP config
           │
           ├─── npm run deploy:powerplatform
           │    └─▶ Runs deploy-powerplatform.mjs
           │        ├─▶ Checks prerequisites
           │        ├─▶ Authenticates to Power Platform
           │        ├─▶ Uploads dist/ to Power Pages
           │        └─▶ Verifies deployment
           │
           └─── ./scripts/setup-powerplatform.sh
                └─▶ Installs CLI
                └─▶ Validates credentials
                └─▶ Tests authentication

```

## Authentication Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                     Service Principal Auth Flow                     │
└────────────────────────────────────────────────────────────────────┘

   GitHub Secrets                Azure AD              Power Platform
   ┌────────────┐               ┌─────────┐           ┌──────────────┐
   │            │               │         │           │              │
   │ TENANT_ID  │──────────────▶│  Entra  │          │ HumanAI-     │
   │ CLIENT_ID  │   Request     │   ID    │  Token   │  Pages-Dev   │
   │ CLIENT_    │   Token       │ (Azure  │─────────▶│              │
   │  SECRET    │               │   AD)   │  Bearer  │ Environment  │
   │            │               │         │   Auth   │              │
   └────────────┘               └─────────┘           └──────────────┘
         │                            │                      │
         │                            │                      │
         └────────────────────────────┴──────────────────────┘
                      Validated Service Principal
                           with assigned roles
```

## File and Configuration Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                         Configuration Files                         │
└────────────────────────────────────────────────────────────────────┘

   Source Files            Build Process          Deployment Target
   
   ┌──────────────┐        ┌───────────┐         ┌────────────────┐
   │ web/src/     │        │           │         │                │
   │  *.tsx       │───────▶│   Vite    │────────▶│  dist/         │
   │  *.ts        │ Build  │   Build   │ Output  │   index.html   │
   │  *.css       │        │           │         │   assets/      │
   └──────────────┘        └───────────┘         │   version.json │
                                 │                │   routes.json  │
   ┌──────────────┐              │                └────────┬───────┘
   │ power-pages  │              │                         │
   │  .config.json│──────────────┘                         │
   │              │  Config for build                      │
   └──────────────┘  & deployment                          │
                                                            │
                                                            ▼
                                                   ┌────────────────┐
                                                   │  Power Pages   │
                                                   │   HumanAI-     │
                                                   │   Pages-Dev    │
                                                   └────────────────┘
```

## Deployment Modes

```
┌────────────────────────────────────────────────────────────────────┐
│                      Three Deployment Modes                         │
└────────────────────────────────────────────────────────────────────┘

   1. Automated (CI/CD)
   ────────────────────────────────────────────────
   
   GitHub Push ───▶ Workflow ───▶ Deploy
                    (Automatic)
   
   
   2. Manual CLI
   ────────────────────────────────────────────────
   
   Developer ───▶ npm run deploy ───▶ Deploy
                  (Interactive)
   
   
   3. Dry Run
   ────────────────────────────────────────────────
   
   Developer ───▶ npm run deploy:dry-run ───▶ Preview
                  (No actual deployment)
```

## Security Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Security Layers                             │
└────────────────────────────────────────────────────────────────────┘

   Layer 1: GitHub           Layer 2: Azure AD       Layer 3: Power Platform
   ┌─────────────┐          ┌──────────────┐        ┌─────────────────┐
   │             │          │              │        │                 │
   │  Encrypted  │─────────▶│   Service    │───────▶│  Application    │
   │  Secrets    │  Used by │  Principal   │ Has    │  User with      │
   │  Storage    │          │  Auth        │ Role   │  System Admin   │
   │             │          │              │        │  or Customizer  │
   └─────────────┘          └──────────────┘        └─────────────────┘
         │                        │                         │
         │                        │                         │
         └────────────────────────┴─────────────────────────┘
                    Protected throughout pipeline
                       No plain text exposure
```

## Health Check & Monitoring

```
┌────────────────────────────────────────────────────────────────────┐
│                    Post-Deployment Verification                     │
└────────────────────────────────────────────────────────────────────┘

   Deployment Complete
         │
         ▼
   ┌──────────────┐
   │ Wait 30 sec  │ (Allow propagation)
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────────────────────────┐
   │         Verification Tests               │
   ├──────────────────────────────────────────┤
   │ 1. HTTP GET / (Homepage)                 │
   │    └─▶ Expect: 200 OK                    │
   │                                           │
   │ 2. HTTP GET /version.json                │
   │    └─▶ Expect: Valid JSON                │
   │                                           │
   │ 3. Check for React mount point           │
   │    └─▶ Expect: <div id="root">           │
   │                                           │
   │ 4. Test navigation                       │
   │    └─▶ Expect: Routes accessible         │
   └──────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │   Report      │
   │   Status      │
   └───────────────┘
```

## Technology Stack

```
┌────────────────────────────────────────────────────────────────────┐
│                         Technology Layers                           │
└────────────────────────────────────────────────────────────────────┘

   Frontend               Build Tools          Deployment
   ┌────────────┐        ┌──────────┐        ┌─────────────────┐
   │            │        │          │        │                 │
   │  React     │        │  Vite    │        │  Power Platform │
   │  TypeScript│───────▶│  npm     │───────▶│  CLI (PAC)      │
   │  Vite      │ Build  │  Node.js │ Deploy │  Power Pages    │
   │            │        │          │        │                 │
   └────────────┘        └──────────┘        └─────────────────┘
        │                     │                       │
        │                     │                       │
        └─────────────────────┴───────────────────────┘
                Configuration via JSON
                 Environment Variables
```

## Environment Variables Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                  Environment Variable Injection                     │
└────────────────────────────────────────────────────────────────────┘

   Build Time                    Runtime               Power Platform
   ┌──────────────────┐         ┌──────────┐         ┌──────────────┐
   │                  │         │          │         │              │
   │ VITE_DEPLOYMENT_ │        │ window.  │         │ Configuration│
   │   TARGET         │───────▶│ __ENV__  │────────▶│   Applied    │
   │                  │ Inject │          │ Runtime │              │
   │ VITE_POWERPLAT-  │  into  │ App      │  Check  │ Power Pages  │
   │   FORM_ENV       │  build │ Instance │         │              │
   │                  │        │          │         │              │
   └──────────────────┘        └──────────┘         └──────────────┘
```

## Summary

This architecture provides:

✅ **Multiple Deployment Paths**: Automated CI/CD, manual CLI, and dry-run testing
✅ **Security**: Encrypted secrets, service principal auth, role-based access
✅ **Quality Gates**: Lint, test, and typecheck before deployment
✅ **Verification**: Automated post-deployment health checks
✅ **Flexibility**: Environment-specific configuration
✅ **Developer Experience**: Setup scripts, documentation, and tooling

## Key Components

1. **GitHub Actions Workflow**: Orchestrates the entire pipeline
2. **Power Platform CLI**: Handles authentication and deployment
3. **Configuration Files**: Manages environment-specific settings
4. **Deployment Scripts**: Provides manual deployment capabilities
5. **Verification Tests**: Ensures successful deployment

## Related Documentation

- Main Deployment Guide: `../DEPLOY_POWERPLATFORM.md`
- Quick Start: `./QUICKSTART_POWERPLATFORM.md`
- Secrets Setup: `./GITHUB_SECRETS_POWERPLATFORM.md`
- Integration Summary: `./POWERPLATFORM_INTEGRATION_SUMMARY.md`

---

**Environment**: HumanAI-Pages-Dev  
**Last Updated**: 2024-01-15
