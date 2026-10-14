# Generated chat toolchain

## 2026-10-14 — candidate 1 preparation; network/install gates pending

A developer scaffolding the no-key chat receives the template's own committed
dependency lock. Updating the root package alone leaves future generated apps on
the old graph. This entry records the bounded source-template migration in
progress; it is **not complete or approved for publication**.

| Package | Existing locked version | Prepared manifest range |
| --- | --- | --- |
| vite | 6.4.3 | ^8.3.4 |
| @vitejs/plugin-react | 4.7.0 | ^6.1.2 |
| @assistant-ui/react | 0.14.14 | ^0.14.14 (unchanged) |
| lucide-react | 0.468.0 | ^0.468.0 (unchanged) |
| react / react-dom | 19.2.7 | ^19.0.0 (unchanged) |

The parent retrieved exact public npm metadata for
[Vite 8.3.4](https://registry.npmjs.org/vite/8.3.4),
[plugin-react 6.1.2](https://registry.npmjs.org/@vitejs%2fplugin-react/6.1.2),
[React 19.3.0](https://registry.npmjs.org/react/19.3.0) and
[ReactDOM 19.3.0](https://registry.npmjs.org/react-dom/19.3.0).
The worker verified the saved bytes against all four command/hash receipts
offline. Vite and the plugin declare Node `^20.19.0 || >=22.12.0`; the plugin
requires Vite `^8.0.0`. The template now declares that Node requirement. Local
Node 22.22.2 satisfies it; the existing CI selects Node 22, but candidate CI has
not run. React/ReactDOM may resolve 19.3.0 within the existing ranges; no new
runtime resolution or installed peer check is claimed yet.

The unchanged Vite configuration contains only the React plugin and localhost
host setting. No custom SSR/build plugin or compatibility flag was added.
[Vite 7](https://v7.vite.dev/guide/migration) raises the Node/browser floors;
[Vite 8](https://vite.dev/guide/migration) changes the bundler/transformer to
Rolldown/Oxc and defaults browser targets to Chrome/Edge 111, Firefox 114 and
Safari 16.4. The README discloses those defaults. Old browsers have not been tested.

The committed lock is deliberately unchanged, awaiting npm regeneration by the
parent. **The manifest and lock are temporarily out of sync; do not use this
intermediate state as a reproducible install or release.** The worker's original
registry EACCES transcript remains intact. No network retry, hand-written lock
integrity, forced resolution, legacy peer mode or override was used.

Observed baseline: the accepted source binding matches exactly; the no-key demo
and all 65 unchanged runtime scenarios passed before this preparation, including
196 cancellations, concurrent Stop, Retry and the 128-stop sustained session.
The archived full audit reports six affected transitive packages (four high,
one moderate, one low). No fresh candidate audit exists, and those findings
are not claimed resolved.

Pending acceptance for `GeneratedChatCurrentToolchain-v1`: npm-generated source
lock; clean copied/generated install with tarball integrity verification; exact
locked-version registry binding and peer resolution; no-key demo; the same 65
scenario identities/assertions; production build; fresh full audit; unchanged
behavior/root hashes; parent generator/Chrome proof, independent review and
native Linux CI. Install/build timings and sizes will be recorded as observations,
not performance certification. Assistant-ui/icon major migrations remain separate.

Append subsequent lock hashes, exact resolutions and actual check results below;
retain this provisional entry and the original failed-registry evidence.

### Preparation hashes and local checks

SHA-256 of source bytes; the unchanged lock hash is a baseline, not a new resolution.

| Template file | Before | Prepared state |
| --- | --- | --- |
| `package.json` | `1967ba21a4990b73cf2702ada8ced1294a1ceb09feb51f61258c07199a7755c9` | `c464bf1caeaa78013d643967466b1021062ce4f04a50be2fddad4ee04e5b765f` |
| `README.md` | `8be8d44b92426c1ce5458f346dff2473d8443988c486f4808fc86586cfe4e11b` | `d1b3f1e9fb6d1e1080b6762dcad8c324012e9c63e80247be3d557c28363b6783` |
| `package-lock.json` | `fd1d53e6249ac23ff1eeb4bc8ae9c75a0fdc4d43e699bcc2a133c6127beffba6` | `fd1d53e6249ac23ff1eeb4bc8ae9c75a0fdc4d43e699bcc2a133c6127beffba6` |

All other template files (including cancellation implementation, all smoke
assertions, JSX/CSS, Vite config and public not-run state) and the bound root
manifest/lock, generator, scaffold smoke and CI config remain byte-identical.
The local preparation check validates manifest JSON, unchanged runtime ranges,
source preservation and the exact diff; installation and runtime validation
against the new lock remain pending. Later results must be appended explicitly.

### 2026-10-14 — parent npm verification and offline evidence check

The parent regenerated the lock with npm; manifest and lock now agree. The new
lock SHA-256 is
`38c8ac9c90977e581c61a7abe5dabe5084f1e3680d3a629fb4345f5e9401b24e`.
Locked Vite/plugin-react are 8.3.4/6.1.2. React/ReactDOM remain 19.2.7,
assistant-ui remains 0.14.14 and lucide-react remains 0.468.0. All runtime
dependency entries and protected behavior/root source hashes are unchanged.

- Fresh generation, normal `npm ci` with integrity checks, and `npm ls --all`
  passed. All six direct lock entries match exact registry tarball/integrity metadata.
- The no-key demo passed. The unchanged smoke script passed the same 65 ordered
  scenario identities/statuses: 196 cancellations, peak 4 timers, zero remaining.
- Production build passed. The fresh full audit, including development
  dependencies, reports **zero affected packages**, versus six in the baseline.
- The worker checked all 13 parent command receipts against complete output
  hashes, the actual source/generated locks, smoke receipts and build artifacts
  offline. Passing expensive scenarios were not rerun.

These results supersede the earlier pending npm/install state; the original
failure/preparation evidence remains intact. Parent Chrome proof, independent
review and native Linux CI remain separate gates. `GeneratedChatCurrentToolchain-v1`
is not declared complete or approved here. No performance, model-quality or
old-browser compatibility claim is made.
