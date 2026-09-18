#!/usr/bin/env python3
"""Dry-run a guarded source patch into a COPY of the tiny universal dispatcher.

Does not change or launch Slack. The output intentionally has no matching signed
Info.plist; do not copy it into /Applications.
"""
import hashlib
import json
import pathlib
import struct
from inspect_slack import Asar

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = pathlib.Path('/Applications/Slack.app/Contents/Resources/app.asar')
TARGET = ROOT / '.lab/patched-dispatcher.asar'
archive = Asar(SOURCE)
original_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
anchor = b'require(process._archPath);'
insertion = b'globalThis.__PME_RESEARCH_PATCH__ = true;\n'
body = archive.read('index.js')
if body.count(anchor) != 1 or insertion in body:
    raise RuntimeError('Unexpected dispatcher: ambiguous anchor or already patched; refusing to guess')
patched = body.replace(anchor, insertion + anchor)
header, parts, offset = {'files': {}}, [], 0
for name in archive.header['files']:
    data = patched if name == 'index.js' else archive.read(name)
    block_size = 4 * 1024 * 1024
    header['files'][name] = {
        'size': len(data), 'offset': str(offset),
        'integrity': {'algorithm': 'SHA256', 'hash': hashlib.sha256(data).hexdigest(),
                      'blockSize': block_size,
                      'blocks': [hashlib.sha256(data[i:i + block_size]).hexdigest()
                                 for i in range(0, len(data), block_size)]}
    }
    parts.append(data)
    offset += len(data)
raw = json.dumps(header, separators=(',', ':')).encode()
payload_size = (4 + len(raw) + 3) // 4 * 4
header_pickle = struct.pack('<II', payload_size, len(raw)) + raw + b'\0' * (payload_size - 4 - len(raw))
TARGET.parent.mkdir(exist_ok=True)
TARGET.write_bytes(struct.pack('<II', 4, len(header_pickle)) + header_pickle + b''.join(parts))
copy = Asar(TARGET)
assert copy.read('index.js') == patched
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == original_hash
old_header = hashlib.sha256(archive.raw_header).hexdigest()
new_header = hashlib.sha256(copy.raw_header).hexdigest()
assert old_header != new_header
result = {
    'result': 'pass', 'scope': 'offline source patch and repack only; no patched app was launched',
    'sourceUnchanged': True, 'uniqueAnchorCount': 1, 'insertedCodeBytes': len(insertion),
    'originalHeaderSHA256': old_header, 'patchedHeaderSHA256': new_header,
    'matchesInstalledIntegrityMetadata': False,
    'consequence': 'Would need new integrity metadata and signing to become a runnable patched bundle; not tested here'
}
(ROOT / 'evidence/asar-patch-experiment.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
