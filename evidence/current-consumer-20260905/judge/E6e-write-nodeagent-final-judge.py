from pathlib import Path
import datetime, hashlib, json, re

P = Path(__file__).resolve().parent
O = P / 'E6e-nodeagent-independent-review'
E = P / 'E6e-nodeagent-current-consumer'
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda b: hashlib.sha256(b).hexdigest()
receipt = load(P / 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.json')
before, after = [load(O / ('custody-' + phase + '.json')) for phase in ['before', 'after']]
main = load(O / 'browser-01/report.json')
late = load(O / 'late-stop-01/report.json')
captures = load(O / 'capture-binding-check.json')
checks = load(O / 'checks.json')
assert before['state'] == after['state']
assert len(after['futureFilteredBlobMismatches']) == 60
assert all(row['path'].startswith('evidence/current-consumer-20260905/') for row in after['futureFilteredBlobMismatches'])
assert main['passed'] and len(main['checks']) == 105 and len(main['captures']) == 28
assert late['passed'] and len(late['checks']) == 25 and len(late['captures']) == 6
assert all(item['passed'] for report in [main, late] for item in report['checks'])
assert not captures['failures'] and sum(row['captures'] for row in captures['reports']) == 110
assert all(row['exitCode'] == 0 for row in checks)
test_text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', (O / 'tests.stdout.log').read_text(encoding='utf-8-sig'))
assert '41 passed (41)' in test_text
for cell in main['cells']:
    assert len(cell['attempts']) == 3 and len({item['id'] for item in cell['attempts']}) == 3
    assert len({item['parentId'] for item in cell['attempts']}) == 1
    assert not cell['failedRequests']
    assert len(cell['errors']) == 2 and all(error == 'PROOF FIXTURE: second tool failed after the first actual result.' for error in cell['errors'])
    assert all(item['type'] == 'warning' and 'GPU stall due to ReadPixels' in item['text'] for item in cell['console'])
viewed = [
    (E / 'evidence/nodeagent-d3-source-before/source-error-390/change-boundary.png', 'Actual source before: labelled 3px composer/current response boundary; no failure explanation or Retry.'),
    (E / 'evidence/nodeagent-d3-generated-before/generated-running-390/change-boundary.png', 'Actual generated before: labelled 3px composer/current response; the running response has no Stop control.'),
    (E / 'd3-final-browser-03/source-error-text-200-390.png', 'Worker after: error explanation and focused Retry fully visible; known enlarged header overflow persists.'),
    (E / 'd3-final-browser-03/generated-error-text-200-390.png', 'Worker after: failed tool, error and focused Retry visible at enlarged text; recovery stays inside viewport.'),
    (O / 'browser-01/source-stopped-390.png', 'Independent ordinary Stop: stopped card, truthful response-only notice, Retry and composer focus visible.'),
    (O / 'browser-01/source-error-text-200-390.png', 'Independent enlarged source: failure and visible keyboard focus; top header still clips, graph text remains outside this repair.'),
    (O / 'browser-01/generated-error-text-200-390.png', 'Independent enlarged installed app: failure and focused Retry paint unobstructed; no horizontal overflow in changed controls.'),
    (O / 'browser-01/source-recovered-1440.png', 'Independent desktop recovery: completed source cards persist, failure notice clears; graph labels remain crowded/clipped.'),
    (O / 'browser-01/generated-error-again-1440.png', 'Independent desktop installed app: prior memo and current completed first tool remain; second tool explicitly failed and Retry is visible.'),
    (O / 'late-stop-01/generated-stopped-390.png', 'Independent late Stop in installed app: full first result stays visible; second tool is stopped, not working or completed.'),
    (O / 'late-stop-01/source-stopped-390.png', 'Independent late Stop in source: first completed context result retained, second tool stopped, composer focus visible.')
]
visual = [{'path': str(path.relative_to(P)).replace('\\', '/'), 'sha256': sha(path.read_bytes()), 'observation': note} for path, note in viewed]
finding = {
    'priority': 'P1', 'kind': 'publication-custody', 'status': 'OPEN',
    'title': 'Git normalization changes 60 hash-bound evidence files when staged',
    'cause': 'The packet has no local attributes and inherits root * text=auto eol=lf. Its manifest and 59 copied CRLF text artifacts will be converted to LF.',
    'examples': after['futureFilteredBlobMismatches'][:3],
    'impact': 'A normal commit would contain different bytes from the accepted manifest and raw receipts even though the working-copy hash checks pass.',
    'smallestCorrection': 'Add a packet-local .gitattributes protecting exact raw bytes, preserve all historical artifact bytes, include the new metadata file in a refrozen manifest/receipt and verify future filtered blobs. Do not normalize historical originals or change root policy.',
    'closure': 'A bounded metadata/filtered-blob recheck is sufficient if all implementation and consumer bindings remain unchanged. No UI or compiler matrix rerun is needed for this correction.'
}
artifacts = {str(path.relative_to(P)).replace('\\', '/'): {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size} for path in sorted(O.rglob('*')) if path.is_file()}
for name in ['E6e-nodeagent-independent-custody.py', 'E6e-nodeagent-independent-recovery.mjs', 'E6e-nodeagent-independent-late-stop.mjs', 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.md', 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.json', Path(__file__).name]:
    path = P / name
    artifacts[name] = {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
report = {
    'schemaVersion': 'portfolio.nodeagent-independent-judge/v1', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'verdict': 'APPROVED_SCOPED_SOURCE_AND_INSTALLED_BEHAVIOR_PUBLICATION_BLOCKED',
    'request': 'Make each repository usable for developer/user handoff, including visual/responsive/interaction proof through planner, worker and independent judge.',
    'reviewerContext': 'Reused nonauthor implementation reviewer because all four team slots were occupied. This reviewer did not author NodeAgent product files or its worker plan. The independent replay adapts the existing scenario with a four-cell scope, repeated native keyboard activation and captured console/network errors; late Stop is a separate added case. No independent authorship of the original scenario is claimed.',
    'candidate': {'repo': receipt['sourceRoot'], 'head': receipt['head'], 'branch': receipt['branch'], 'receiptSha256': sha((P / 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.json').read_bytes()), 'authoredPaths': receipt['authoredPaths'], 'authoredDigest': receipt['authoredDigest'], 'sourceProofBindings': 234, 'sourceProofDigest': receipt['sourceProofDigest'], 'portableManifestSha256': receipt['portableManifestSha256'], 'stateBeforeAfter': after['state']},
    'sourceAssessment': {
        'scope': 'Six existing UI owners, one compatible template lock, two browser scenarios, two onboarding/tour corrections and HANDOFF; 12 authored paths total. No adapter, graph, provider, backend, dependency range or historical promotion edit.',
        'causalChain': ['Unlocked normal template installation selected an incompatible assistant-ui cohort; earlier exact unchanged generated UI completed when resolved against the canonical compatible cohort. The new template lock now installs that cohort normally.', 'The existing assistant-ui runtime already supports cancel, incomplete/error status and reload; the UI did not present those states. Native Cancel/Reload and the actual tool-part status now own response recovery.', 'The message-ID ref takes a synchronous claim before the native Reload callback, preventing rapid duplicate activation before isRunning propagates. The installed native primitive honors prevented events and disables while running.', 'Each observed failed/retried response receives a new actual SDK response ID and retains the same user-parent ID; no permanent retry lock occurs on the second failure.', 'The source focus-visible-only scroll reveals the existing recovery region above its sticky composer without moving a pointer target. The generated min-width fixes remove inherited intrinsic-width overflow at the actual grid/flex owners.'],
        'implementationFindings': [],
        'dependencyVersionsObservedBothLocks': {'@assistant-ui/react': '0.14.14', '@assistant-ui/core': '0.2.10', '@assistant-ui/store': '0.2.13', '@assistant-ui/tap': '0.5.14', 'react': '19.2.7', 'react-dom': '19.2.7'}
    },
    'independentProof': {
        'browser': main['browser'], 'node': main['node'], 'normalMotion': True,
        'recovery': {'checks': 105, 'captures': 28, 'cells': [{'surface': c['kind'], 'width': c['width'], 'height': 844 if c['width'] == 390 else 960, 'stopInput': c['stopInput'], 'stopLatencyMs': c['stopLatencyMs'], 'attempts': c['attempts'], 'accumulation': c.get('accumulation')} for c in main['cells']]},
        'lateStop': {'checks': 25, 'captures': 6, 'width': 390, 'surfaces': ['generated', 'source'], 'scenario': 'Complete one earlier response, then wait for the next response first tool to finish and second tool to run. Native Stop retains current completed tool/earlier response/graph snapshot and explicit Retry recovers.'},
        'nativeDuplicateActivation': 'Two native Enter activations per Retry in both 390 cells, and pointer double-click in both 1440 cells. The first keyboard activation legitimately moves focus to the empty composer; the second key goes to that native focused target. Exactly three attempts across the two injected failures and recovery.',
        'enlargement': 'Original computed font sizes sampled before mutation and doubled only in browser memory; both changed recovery/composer regions have zero internal overflow and visible focus/error hit-tests. Generated document overflow 0, source document overflow 21 retained.',
        'retainedEarlierOutput': 'Earlier response text and source graph snapshots checked after ordinary Stop and recovery; late Stop separately checks current completed tool data and status.',
        'unexpectedPageErrors': 0, 'intentionalPageErrors': 8, 'failedRequests': 0, 'consoleWarnings': 'Four source-390 WebGL ReadPixels GPU-stall warnings retained. No browser console errors. Dev server also reported five inherited vendor sourcemap missing-source warnings in the tool transcript.',
        'freshChecks': checks, 'existingTestsPassed': 41, 'typecheckPassed': True, 'tours': '3 tours /36 steps /11 citations passed',
        'captureBindings': 'All 110 worker-final and independent PNG hashes, exact dimensions, JSON states and before/after HTML pairs verified. This is custody verification; only the separately listed 11 PNGs were visually inspected.'
    },
    'custody': {'sourceAndIndexRefsPreserved': True, 'authoredBindings': 12, 'sourceBindings': 234, 'portableArtifactsExcludingManifest': 938, 'exactRawCopies': 937, 'authoredPortableIndex': 1, 'portableBytesExcludingManifest': 21279473, 'sourceTarInstalled': after['sourceTarInstalled'], 'retainedConsumers': 5, 'currentGeneratedCoreFilesEqualTemplate': 9, 'failedHistoricalEvidencePreserved': True, 'emittedOrSourceFilesEditedByJudge': 0, 'providerCalls': 0, 'deployment': False, 'grade': None},
    'visualObservations': visual,
    'publicationFindings': [finding],
    'limits': ['This accepts the bounded deterministic local demo and response-recovery slice, not the complete product. All full visual, responsive, accessibility and performance grades remain null.', 'The source enlarged-text header still overflows by 21 pixels, and source graph labels are visibly crowded/clipped. Those untouched visual owners remain open.', 'The injected adapter faults are labelled browser-memory fixtures after a real partial frame. They are not actual provider outages. Ordinary Stop and late Stop used the unheld adapter.', 'Stop prevents further response display updates; it cannot reverse already-computed results, graph facts, durable work or external actions. The local duplicate guard is not external idempotency.', 'Both browser conversations reset on reload. Durable/SQLite reopen evidence is a separate library demonstration and was not reclassified as browser persistence.', 'Source full audit has nine development advisories including one critical, generated full audit has four (three high/one low). Production-only zero is a narrower recorded result; no fresh audit or dependency-security clearance is claimed here.', 'No React render-error boundary, New Thread, provider/Convex/host-hook activation, external idempotency, production longevity or deployment certification.', 'No new pack/install/build was performed by the judge. Exact archive/installed/source comparison and actual installed browser replay bind the prior normal package/install/build receipts. Typecheck, tests and tours were rerun independently.', 'The 938-artifact packet is exact on disk but not yet safe to commit under current attributes. The publication finding must be closed by a metadata-only refreeze.', 'A checker-only UTF-8 mistake initially compared UTF-8 sidecars using the Windows cp1252 default; the false result was retained and the corrected explicit-UTF-8 comparison passes all 110 captures. A raw-log print similarly hit cp1252 output encoding; raw files were unchanged.'],
    'nextAction': 'Preserve this pre-repair judgment, add only the packet-local raw-byte attributes and refreeze metadata, then request a bounded future-filtered-blob/publication recheck. Keep all runtime, installed-consumer and historical raw bytes unchanged.',
    'artifacts': artifacts
}
out = P / 'E6e_NODEAGENT_CURRENT_CONSUMER_FINAL_JUDGE.json'
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
md = f'''**Builder — the scoped implementation and installed-consumer behavior pass. Publication remains blocked by one evidence-custody issue.**

**Re your request:** Make each repository usable for developer/user handoff, including visual, responsive and interaction standards, using planner, worker and independent judge. A developer can now use the normally installed scripted chat, stop a response, see an explicit failure and retry without losing earlier completed work. This review accepts that bounded slice; it does not certify the entire NodeAgent product.

The actual-source and installed-generated replay passed **105 checks /28 captures** across 390×844 and 1440×960. It used native keyboard/pointer Stop, two labelled adapter failures after a real partial result, two explicit retries, repeated native Enter and pointer double-clicks. Each cell had exactly three distinct SDK response IDs sharing one user-parent ID. No automatic or extra retry occurred; previous cards stayed intact. At 390, each surface also accumulated 12 extra turns to 15 responses/60 cards: 21.123 seconds generated and 29.525 seconds source. Those are bounded observations, not production longevity.

A separate **25-check /6-capture late-Stop proof** waited for the current response's first actual tool result and second running tool. Stop preserved that completed result, the earlier response and the source graph snapshot. The unfinished tool became stopped and explicit Retry recovered. This closes a case that an earliest-frame Stop alone would miss. No iterator hold was used to certify Stop.

Fresh **41 tests, typecheck and three tours/36 steps/11 citations passed**. Browser page errors were exactly the two intentional faults per main cell, with no unexpected page errors, browser console errors or failed requests. Four source WebGL ReadPixels warnings remain recorded; the dev server also reported inherited vendor sourcemap warnings. [Independent replay](E6e-nodeagent-independent-review/browser-01/report.json), [late Stop](E6e-nodeagent-independent-review/late-stop-01/report.json), and [fresh checks](E6e-nodeagent-independent-review/checks.json) preserve the raw observations.

I inspected 11 actual before/after PNGs, including both labelled 3px before boundaries, independent stopped and failed states, source desktop recovery, both enlarged-text focused Retry surfaces, and late Stop. Failure text and Retry are visible and actionable. Pointer target rectangles remain stable. In the doubled-computed-text fixture, both recovery/composer regions have zero internal overflow; generated document overflow is zero. The source header still has **21px overflow**, and its graph labels remain crowded/clipped. This is not OS zoom, screen-reader or complete visual acceptance. All complete UI/accessibility/performance grades remain null.

The source diff stays within six existing UI owners, the compatible template lock, two scenarios, two onboarding/tour files and HANDOFF: 12 authored paths. Existing assistant-ui Cancel/Reload/status owners perform recovery; a synchronous response-ID claim handles immediate duplicate activation before running state reaches the render. The two retries demonstrably receive fresh IDs, so the second failure remains retryable. No adapter, graph, provider, backend, dependency range or historical promotion changes were introduced.

Custody passes on disk: authored digest `{receipt['authoredDigest']}`, all 234 source-proof bindings, 938 portable artifacts (937 exact copies plus the authored index), and all five retained consumers stayed unchanged. The exact tarball `{receipt['package']['sha256']}` contains 242 files that match the installed package. Current source differs from those package bytes only in the later HANDOFF metadata; all implementation files remain exact. The generated app's nine core files match the current template. All 110 worker-final/independent PNG hashes, dimensions, JSON sidecars and before/after DOM pairs check correctly. [Custody after review](E6e-nodeagent-independent-review/custody-after.json).

**P1 publication finding:** The packet inherits root `* text=auto eol=lf` and has no local raw-byte attributes. Git would change **60 files: the manifest and 59 copied CRLF artifacts**. For example, the manifest raw Git blob `dcbd7b1dd0b12fda1db0fb6c10224ceea66b00ec` would become `78a69528eea85b8b25e4921f5d3ee63150b78403`; the normal install receipt is also affected. That would invalidate the recorded hashes in a normal commit. All affected paths are listed in the custody report.

The smallest correction is packet-local raw-byte attributes, followed by a refrozen manifest/receipt that includes that metadata file and verifies future filtered blobs. Preserve every historical artifact byte and this pre-correction judgment. No application edit or repeated browser matrix is needed if the implementation/consumer bindings remain exact.

The handoff accurately separates deterministic fixture confidence, reload-reset browser sessions, library-only durable/SQLite evidence, and unavailable provider capabilities. Stop ends display updates and cannot undo completed/external work. Full dependency audits still have nine source and four generated development findings; production-only zero is narrower. No render-error boundary, New Thread, provider/Convex/host/deployment or complete-readiness claim is accepted.

Reviewer context was reused because all team slots were occupied. I did not author the NodeAgent implementation. The main replay adapts the worker scenario and adds duplicate keyboard observation; late Stop is a separate case. A checker-only Windows encoding mistake was retained, corrected to explicit UTF-8, and all 110 capture bindings then passed. Raw evidence was not rewritten.

[Machine-readable final judgment](E6e_NODEAGENT_CURRENT_CONSUMER_FINAL_JUDGE.json) binds the complete independent evidence and the one required publication correction. HEAD/index/refs and source bytes were preserved; no commit or push was performed.
'''
(P / 'E6e_NODEAGENT_CURRENT_CONSUMER_FINAL_JUDGE.md').write_text(md, encoding='utf-8', newline='\n')
print(json.dumps({'verdict': report['verdict'], 'sha256': sha(out.read_bytes()), 'artifactBindings': len(artifacts), 'independentChecks': 130, 'independentCaptures': 34, 'publicationFindings': 1}, indent=2))
