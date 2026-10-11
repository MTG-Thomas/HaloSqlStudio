# Vite+ spike: defer adoption

Evaluated 2026-10-11. This branch is an experimental partial migration, **not a qualified Solution release**. Do not merge it into a Git-managed installation until the build contract and acceptance gaps below are resolved.

## Sources and scope

- Pilot baseline: `jackmusick/HaloSqlStudio` main `f8b019e0982f4fcd4804a4627cc1b63a7969755e`.
- Platform: `Midtown-Technology-Group/bifrost` main `08255ad355a3ab63f0c04a214c3c230432552dfe` (fresh read-only checkout).
- [Official migration guide](https://viteplus.dev/guide/migrate), [migration rules](https://viteplus.dev/guide/migrate-rules), and [checker documentation](https://viteplus.dev/guide/check).
- Latest registry release and official guidance agreed on Vite+ 1.1.0. Host: Windows, Node 24.21.0, npm 11.19.0. Installed CLI: BiFrost 3.0.1-dev.319.

No Python workflows, authentication code, access policies, manifests, runtime frontend source, or platform code changed. No installation, deployment, merge, or ticket-writing webhook was performed. No SDK package, instance selectors, credentials, or generated dist files are committed.

## Baseline architecture

The only npm package is apps/halo-sql-studio; package-lock.json v3 owns its dependency graph. There is no root JS workspace or CI workflow. Scripts are dev=vite, build=tsc --noEmit && vite build, build:dev=vite build --mode development, lint=eslint ., test=node --test src/main.test.mjs, preview=vite preview.

React plugin 6.1.2 is the sole Vite plugin. Tailwind 4 uses PostCSS. The @ alias resolves to src. No custom output directory, externalization, or asset naming is configured: dist/index.html, dist/assets, and copied public files are expected. Monaco is lazy-loaded through @monaco-editor/react; the app does not configure bundled Monaco workers. AG Grid and routing are runtime dependencies, unchanged in this trial.

The root tsconfig has files=[] and references app/node configs; tsc --noEmit does not traverse those references. App config is permissive and includes src; node config is strict and includes vite.config.ts. Explicit checking is necessary to expose the baseline diagnostics. ESLint uses JS recommended and TypeScript recommended rules, React Hooks recommended, and React Refresh only-export-components with allowConstantExport and mount exceptions. TypeScript unused-vars is explicitly off. Node globals are separately configured for the native test.

Production config skips readBifrostEnv and injects no credentials. During serve only, it reads BIFROST_API_URL/BIFROST_ACCESS_TOKEN, ancestor .env files, or CLI credentials, then defines VITE_BIFROST_API_URL/TOKEN/APP_ID/ORG_ID. Production receives per-viewer bootstrap through the platform mount runtime. The app declares ambient bifrost types but intentionally has no SDK dependency in its manifest or lockfile.

## Before/after inventory and decisions

| Surface | Baseline installed tool | Retained trial |
|---|---|---|
| Development/build/preview | Vite 8.3.4 | Vite+ 1.1.0; core bundles Vite 8.3.3/Rolldown 1.2.12 |
| Type checking | TypeScript 5.9.3, declared ^5.8.3 | Retained; adds explicit typecheck script; Vite+ checker is a separate diagnostic command |
| Lint | ESLint 9.39.5 and original plugins | Unchanged configuration/dependencies and seven warnings |
| Hooks rules | eslint-plugin-react-hooks 5.2.0 | Retained verbatim; no parity assumption |
| Formatting | No gate | Optional Oxfmt check of vite.config.ts only; no application formatting churn |
| Tests | Node native runner + esbuild 0.28.2 | Unchanged |
| Orchestration | npm scripts | Retained; no task-cache abstraction or Vitest conversion |
| Direct dev dependencies | 15 | 16; vite alias plus vite-plus, all original checker/lint dependencies retained |

Official migration ran with --no-interactive --no-agent --no-editor --no-hooks from the app package root. It introduced a large lint/global config, removed ESLint, and reported two skipped rules (no-dupe-args/no-octal, described by the migrator as superseded by strict mode). The initial generated lint/check run also introduced React Compiler and type-aware warnings. That automatic lint replacement was **not accepted**: the complete original ESLint gate is restored, rather than quietly dropping checks or assuming semantic parity. Unsupported-rule fallback therefore remains the original ESLint toolchain in full. Oxlint replacement is deferred, not completed.

Vite imports and scripts use Vite+. The official vite core alias and override are retained for plugin imports. Plugins are lazy for validation commands. baseUrl is removed from app/root configs per migration; relative paths mappings are preserved and explicit TypeScript diagnostics match the baseline. The checker remains enabled, with no suppressed diagnostics. Its ten errors are visible through typecheck:vp. The original build check is preserved, but its empty-root limitation is documented rather than presented as comprehensive type safety.

The lockfile was regenerated from the original lock rather than retaining migrator churn. Existing entries with changed versions are Vite/core and flatted 3.4.2 to 3.4.4; runtime dependency declarations are identical. No unrelated direct dependency upgrades were requested. Added Vite+ packages account for substantial lockfile growth. SDK installation with BiFrost's lock-disabled command resolves some newer packages within existing ranges; measured baseline and trial installed direct dependencies differed only in Vite/core, with Vite+ added. Measurements describe that install contract, not a frozen-lock CI comparison.

## Validation

| Check | Baseline | Trial | Disposition |
|---|---|---|---|
| npm ci | Fails: missing @emnapi/core/runtime 1.11.3 lock entries | Regenerated lock passes dry-run | Existing baseline lock issue |
| npm run lint | 0 errors, 7 warnings | Same rule IDs/files and 7 warnings | Coverage preserved by keeping ESLint |
| tsc --noEmit | Pass | Pass | Empty root, not app verification |
| tsc --noEmit -p tsconfig.app.json | 6 errors | Same 6 errors | Existing application defects |
| tsc --noEmit -p tsconfig.node.json | Pass | Pass | Config types remain compatible |
| Node native suite on Windows | 1 failure | Same failure | file URL pathname becomes /C:/...; no test changed/skipped |
| Python suite, from Solution root | 8 passed | 8 passed | Existing suite unchanged |
| npm run build | Pass, six measured runs | Pass, six measured runs | Local build only |
| Oxfmt config check | No existing gate | Pass | Config only, no new app-wide gate |
| Vite+ typecheck | N/A | 10 errors | Not equivalent; retain TypeScript |
| Development server | Starts on 5185 | Starts on 5186 | Browser loads JS/SDK and matching initialization error |

The six real TypeScript errors are two missing @/lib/halo-api imports, ResultsCopy ColumnInfo mismatch, missing MonacoWrapper onSave, missing monaco namespace, and Monaco hover.enabled=true incompatible with the current API. Vite+'s checker includes those six plus three NodeJS namespace errors and a Tailwind darkMode type error outside the baseline app/node include set. Do not call that checker a replacement until project scope and ambient Node types are explicitly qualified.

The first benchmark Python invocation used the app directory and failed to import functions. Correct root invocations subsequently passed all eight tests on both branches. This harness mistake is not a baseline product defect.

Browser inspection used only http://127.0.0.1:5185/ and :5186/, a deliberately unreachable local API at port 65530, and a noncredential sentinel. Both showed Unable to initialize Halo SQL Studio / Failed to fetch, with the expected API connection-refused error. This demonstrates development startup, React rendering, and SDK module resolution. **Monaco interaction, AG Grid, routing acceptance, authenticated SDK integration, and an installed/deployed Solution are unverified.** No fake API responses are being presented as runtime acceptance.

## Performance observations

Three runs per category; seconds include npm/process startup. Cold means removing task-owned dist and node_modules/.vite before each run, not clearing OS/npm caches. Runs were sequential on a shared Windows host, baseline first; first-run startup and filesystem effects are confounders. No benchmark improvement claim is justified.

| Command/category | Baseline runs | Trial runs | Baseline mean +/- sample SD | Trial mean +/- sample SD |
|---|---|---|---|---|
| npm run build, output-clean | 9.351, 1.592, 1.520 | 1.691, 1.812, 1.992 | 4.154 +/- 4.501 | 1.832 +/- 0.151 |
| npm run build, warm | 1.516, 1.493, 1.540 | 1.839, 1.873, 2.623 | 1.516 +/- 0.024 | 2.112 +/- 0.443 |
| lint + root tsc + native test | 26.492, 4.300, 4.198 | 18.036, 4.915, 5.096 | 11.663 +/- 12.842 | 9.349 +/- 7.524 |

Validation timings include the same failing Windows test; they are not successful full-validation durations. Original explicit app/node checks took 4.861/2.320 seconds; trial took 5.673/2.508 (single diagnostic runs, no performance inference). Raw measurements are in viteplus-spike-results.json.

| Output at root base | Baseline | Trial |
|---|---:|---:|
| Files, including copied public assets | 14 | 14 |
| Total bytes | 1,698,939 | 1,699,550 |
| Sum of individually gzipped files | 486,937 | 486,982 |

The approximately 0.04% size change is immaterial. Base-path builds separately produced dist/index.html with mount-v1 metadata and asset URLs under /api/applications/spike-local/dist/. Output is structurally compatible; byte equality and deployed usability are not established.

## BiFrost lifecycle contract

The manifest's app path selects the package. The CLI collector includes source/public assets, skips generated/dependency directories and .env files. Git-managed installation clones source and invokes the canonical SolutionAppBuilder. The server materializes the instance web SDK tarball as a local file dependency merged into package.json. The CLI prebuild injects the selected instance SDK URL in an isolated package. Neither requires a persisted application SDK URL.

The canonical server and CLI prebuild commands are npm install --no-audit --no-fund --package-lock=false followed by **npx vite build --base <platform route>**. They bypass the app build script, so its validation is not a deployment gate. Dist files are collected for platform storage/serving; main merge is not deployment evidence. Solution start uses transient SDK installation and **npm run dev -- --port ... --strictPort**, which can invoke vp dev.

Sources at the exact inspected platform SHA:
- [Server materialization/build](https://github.com/Midtown-Technology-Group/bifrost/blob/08255ad355a3ab63f0c04a214c3c230432552dfe/api/src/services/solutions/app_build.py)
- [CLI discovery, prebuild, SDK installation, and development](https://github.com/Midtown-Technology-Group/bifrost/blob/08255ad355a3ab63f0c04a214c3c230432552dfe/api/bifrost/commands/solution.py)

Vite+ core has no executable bin entry. After in-place migration, the stale vite shim fails because node_modules/vite/bin/vite.js is absent. In a freshly materialized SDK-injected workspace, the exact canonical install/npx commands succeeded but reported standalone **Vite 8.3.4**, not the declared core's bundled Vite 8.3.3. npx chose an upstream tool from cache/registry. This is a platform build-selection defect: a successful build does not establish that it used Vite+. Keeping a second standalone Vite solely to satisfy this builder would undermine consolidation.

Direct vp build --base ... succeeds with the instance SDK and correct asset layout. Sentinel BIFROST/VITE token, URL, app ID, and org ID values were absent from generated files, as was the production instance hostname. SDK tarball was downloaded read-only from the selected instance; production authentication or workflow execution was not used for verification. These are bounded bundle checks, not a proof that arbitrary future VITE_* environment inputs cannot leak.

Supported solution start was not exercised: automatic approval review rejected the disconnected-local-endpoint command with reason blocked by policy. The dedicated pve-t340 test VM was initially listed as running, but direct/jump SSH timed out and a later guest-exec check reported VM 101 not running. No shared VM was started or reconfigured. No non-production install was created and no Solution deployment was attempted. The complete lifecycle completion criterion is therefore unmet.

## General follow-up proposal

Tracked in [MTG BiFrost #1188](https://github.com/Midtown-Technology-Group/bifrost/issues/1188).

Add an opt-in, app-owned build script/output directory contract and a documented non-secret application base-path environment variable. Share resolution between canonical server builds and CLI prebuild; preserve SDK injection and existing access/ownership policies. Arbitrary frontends should not have to accept Vite-specific CLI arguments. Keep a legacy default for existing apps, but never let an explicitly selected toolchain silently fall back to an npm registry binary. Validate output confinement, index/assets, and both ordinary Vite and Vite+ on a non-production install. No HaloSqlStudio-specific platform condition is needed. Lock-disabled installation reproducibility is a separate existing concern.

## Wider applicability

- gobifrost/halo-dispatch-portal currently declares Vite ^7.1.7, React 19, TypeScript ~5.9.3, and native Node lifecycle/config tests. It needs a separately validated Vite 8 prerequisite upgrade before the official migration, and retains its tests. The same builder-selection concern applies; compatibility is a hypothesis, not verified.
- This BiFrost Workspace checkout contains quick-support, event-lead-capture staff-review, and meraki-admin-governance frontends with npm, Vite 8, TypeScript, and React. They are potential pilots, but some currently pin an instance SDK URL and have different plugin/typecheck conventions. No workspace frontend was changed or tested by this spike.
- Other repository-managed Solutions share the builder contract, so the opt-in contract can be reusable. Lint/parity, assets, test runner, base routing and SDK runtime checks remain per-Solution acceptance requirements.

## Recommendation and rollback

**Defer adoption.** Vite+ dev/build and asset generation work locally, but this retained trial adds one direct development dependency while preserving all original lint/typechecking tools. It does not yet demonstrate reduced maintenance. Full checker/lint consolidation lacks parity, the Windows test and baseline real type errors remain, and the standard Solution builder selects the wrong toolchain. Keep this branch as evidence rather than treating it as a production migration.

Smallest next steps: qualify a generic platform build contract in non-production; separately repair the baseline test portability/type errors; then rerun native tests, rule-negative controls, checker comparison, Monaco/AG Grid/routing and deployed-SDK acceptance. Rollback is reverting the tooling commit and reinstalling original dependencies; no live state needs reconciliation.
