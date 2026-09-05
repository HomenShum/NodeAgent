from pathlib import Path
import datetime, hashlib, json, subprocess, sys, tarfile

P = Path(__file__).resolve().parent
E = P / 'E6e-nodeagent-current-consumer'
R = json.loads((P / 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.json').read_text(encoding='utf-8-sig'))
S = Path(R['sourceRoot'])
D = Path(R['portableRoot'])
O = P / 'E6e-nodeagent-independent-review'
O.mkdir(exist_ok=True)
phase = sys.argv[1]
assert phase in ['before', 'after']
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
git = lambda *args, data=None: subprocess.check_output(['git', '--no-optional-locks', '-C', str(S), *args], input=data)
state = {'head': git('rev-parse', 'HEAD').decode().strip(), 'index': sha(git('ls-files', '--stage', '-z')), 'refs': sha(git('show-ref')), 'status': sha(git('status', '--porcelain=v1', '--untracked-files=all', '-z'))}
assert state['head'] == R['head'] and state['index'] == R['indexSha256']
assert git('diff', '--cached', '--name-only') == b''
assert git('diff', '--check') == b''
assert sha(git('diff', '--text')) == R['trackedDiffSha256']
for group in ['authoredPaths', 'sourceProofBindings']:
    actual = {name: sha((S / name).read_bytes()) for name in R[group]}
    assert actual == R[group], group
    digest = sha(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode())
    assert digest == R['authoredDigest' if group == 'authoredPaths' else 'sourceProofDigest']
manifest = load(D / 'manifest.json')
assert sha((D / 'manifest.json').read_bytes()) == R['portableManifestSha256']
assert len(manifest['artifacts']) == R['portableArtifactCountExcludingManifest'] == 938
assert manifest['sourceBindings'] == R['sourceProofBindings']
portable = {}
copies = 0
for row in manifest['artifacts']:
    path = D / row['path']
    assert path.resolve().is_relative_to(D.resolve())
    data = path.read_bytes()
    assert sha(data) == row['sha256'] and len(data) == row['bytes'], row['path']
    portable[str(path.relative_to(S)).replace('\\', '/')] = {'sha256': sha(data), 'bytes': len(data)}
    origin = row['operatorSource']
    if Path(origin).is_absolute():
        assert data == Path(origin).read_bytes(), origin
        copies += 1
assert sum(row['bytes'] for row in manifest['artifacts']) == R['portableBytesExcludingManifest']
portable[str((D / 'manifest.json').relative_to(S)).replace('\\', '/')] = {'sha256': sha((D / 'manifest.json').read_bytes()), 'bytes': (D / 'manifest.json').stat().st_size}
assert set(portable) == {str(f.relative_to(S)).replace('\\', '/') for f in D.rglob('*') if f.is_file()}
paths = sorted(set(portable) | set(R['authoredPaths']))
filtered_hashes = git('hash-object', '--stdin-paths', data=(''.join(json.dumps(name, ensure_ascii=False) + '\n' for name in paths)).encode()).decode().splitlines()
assert len(filtered_hashes) == len(paths)
normalization = []
for name, filtered in zip(paths, filtered_hashes):
    data = (S / name).read_bytes()
    raw = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if raw != filtered:
        normalization.append({'path': name, 'rawBlob': raw, 'futureFilteredBlob': filtered, 'crlfCount': data.count(b'\r\n')})
package_receipt = load(E / 'd3-installed-consumer-03.json')
tarball = Path(package_receipt['tarball'])
assert sha(tarball.read_bytes()) == package_receipt['tarballSha256'] == R['package']['sha256']
commands = load(E / 'd3-final-03-commands.json')
host = Path(next(row['cwd'] for row in commands if row['name'] == 'd3-host-install-03'))
installed = host / 'node_modules/nodeagent'
source_drift = []
package_bindings = package_receipt['sourceTarInstalledBindings']
assert len(package_bindings) == 242
with tarfile.open(tarball, 'r:gz') as archive:
    file_names = {item.name.removeprefix('package/') for item in archive.getmembers() if item.isfile()}
    assert file_names == {row['path'] for row in package_bindings}
    for row in package_bindings:
        name, digest = row['path'], row['sha256']
        data = archive.extractfile('package/' + name).read()
        assert sha(data) == digest and (installed / name).read_bytes() == data, name
        if (S / name).read_bytes() != data: source_drift.append(name)
assert source_drift == ['HANDOFF.md'], source_drift
consumers = []
for item in load(E / 'd3-consumer-preservation.json'):
    root = tarball.parent.parent / item['consumer']
    for name, digest in item['hashes'].items(): assert sha((root / name).read_bytes()) == digest
    consumers.append({'root': str(root), 'hashes': item['hashes']})
consumer = Path(package_receipt['generatedApp'])
browser = load(E / 'd3-final-browser-03/report.json')
for name, digest in browser['consumerBefore'].items():
    assert sha((consumer / name).read_bytes()) == digest
    assert (consumer / name).read_bytes() == (S / 'examples/apps/chat-ui/template' / name).read_bytes()
assert browser['consumerBefore'] == browser['consumerAfter']
report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': phase, 'state': state, 'receiptSha256': sha((P / 'E6e_NODEAGENT_CURRENT_CONSUMER_RECEIPT.json').read_bytes()), 'authoredDigest': R['authoredDigest'], 'sourceProofDigest': R['sourceProofDigest'], 'authoredPaths': R['authoredPaths'], 'portableManifestSha256': R['portableManifestSha256'], 'portableBindings': portable, 'rawCopiesExact': copies, 'portableArtifactsExcludingManifest': 938, 'portableBytesExcludingManifest': R['portableBytesExcludingManifest'], 'futureFilteredBlobMismatches': normalization, 'sourceTarInstalled': {'files': 242, 'tarSha256': sha(tarball.read_bytes()), 'installedRoot': str(installed), 'currentSourceDifferences': source_drift, 'scope': 'HANDOFF only changed after package capture; all 242 tar/installed bytes exact, 241 current source bytes exact.'}, 'retainedConsumers': consumers, 'currentGeneratedInputsExactSourceTemplate': browser['consumerBefore'], 'candidatePaths': paths, 'noMutations': True}
if phase == 'after':
    before = load(O / 'custody-before.json')
    for key in ['state', 'receiptSha256', 'authoredDigest', 'sourceProofDigest', 'portableManifestSha256', 'portableBindings', 'sourceTarInstalled', 'retainedConsumers', 'currentGeneratedInputsExactSourceTemplate', 'candidatePaths']:
        assert before[key] == report[key], key
(O / ('custody-' + phase + '.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'phase': phase, 'authored': len(R['authoredPaths']), 'sourceBindings': len(R['sourceProofBindings']), 'portable': 938, 'exactCopies': copies, 'futureFilteredMismatches': len(normalization), 'packageFiles': 242, 'postPackageSourceDifferences': source_drift, 'consumers': len(consumers), 'sourcePreserved': True}, indent=2))
