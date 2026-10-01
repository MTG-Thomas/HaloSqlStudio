# Halo SQL Studio agent guide

This is a browser-only React/TypeScript SQL editor for HaloPSA's reporting API. Start with [README.md](README.md), [package.json](package.json), and the `src/` application before changing authentication, query execution, or results rendering.

## Development and verification

Use the repository's package manifest and checked-in lockfile when installing dependencies. From the root, `npm run dev` starts Vite; `npm run lint` and `npm run build` are the available validation commands. `npm run preview` serves the build locally. There is no test script in the inspected package manifest; report that gap instead of claiming a test suite passed.

For behavior changes, verify the affected browser flow with synthetic data: OAuth callback, tenant configuration, query variables, errors, and results as relevant. Keep browser evidence separate from build success.

## Boundaries

Preserve the direct browser-to-Halo architecture. Do not introduce an intermediary that receives customer queries, results, or OAuth credentials without a reviewed design. Never commit tokens, real customer result sets, or client secrets.

Redirect URI and CORS settings must match the intended deployment host. `$agentid`, `$siteid`, and `$clientid` substitution changes query context; retain the documented empty-value fallback and verify escaping and authorization assumptions when changing it. A variable override is not authorization to act as another user.

Running SQL against a tenant, changing its Halo application, or publishing the static site requires the exact environment and authorized scope. Prefer synthetic fixtures before live reporting API checks.
