#!/usr/bin/env python3
"""Read Slack's public application bundle; never opens account/profile data."""
import argparse
import hashlib
import json
import pathlib
import plistlib
import struct
import subprocess

FUSES = ["RunAsNode", "EnableCookieEncryption", "EnableNodeOptionsEnvironmentVariable",
         "EnableNodeCliInspectArguments", "EnableEmbeddedAsarIntegrityValidation",
         "OnlyLoadAppFromAsar", "LoadBrowserProcessSpecificV8Snapshot",
         "GrantFileProtocolExtraPrivileges", "WasmTrapHandlers"]


class Asar:
    def __init__(self, path):
        self.path = pathlib.Path(path)
        with self.path.open('rb') as stream:
            size, self.header_size, _, length = struct.unpack('<4I', stream.read(16))
            if size != 4 or length > self.header_size:
                raise ValueError('Invalid ASAR header')
            self.raw_header = stream.read(length)
        self.header = json.loads(self.raw_header)
        self.data_offset = 8 + self.header_size

    def entry(self, name):
        entry = self.header
        for component in pathlib.PurePosixPath(name).parts:
            entry = entry['files'][component]
        return entry

    def read(self, name):
        entry = self.entry(name)
        if entry.get('unpacked'):
            return pathlib.Path(str(self.path) + '.unpacked', name).read_bytes()
        with self.path.open('rb') as stream:
            stream.seek(self.data_offset + int(entry['offset']))
            return stream.read(entry['size'])


def command(*args):
    p = subprocess.run(args, capture_output=True, text=True)
    return {'exitCode': p.returncode, 'output': (p.stdout + p.stderr).strip()}


def inspect(app):
    root = pathlib.Path(app) / 'Contents'
    info = plistlib.loads((root / 'Info.plist').read_bytes())
    framework = root / 'Frameworks/Electron Framework.framework/Versions/A'
    framework_info = plistlib.loads((framework / 'Resources/Info.plist').read_bytes())
    binary = (framework / 'Electron Framework').read_bytes()
    sentinel = b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
    offset, wires = 0, []
    while (offset := binary.find(sentinel, offset)) >= 0:
        start = offset + len(sentinel)
        version, count = binary[start:start + 2]
        wire = binary[start + 2:start + 2 + count]
        wires.append({'offset': offset, 'version': version, 'count': count,
                      'fuses': {FUSES[i] if i < len(FUSES) else f'unknown_{i}':
                                {48: False, 49: True, 114: 'removed'}.get(value, value)
                                for i, value in enumerate(wire)}})
        offset = start + 2 + count
    archives = {}
    for path in sorted((root / 'Resources').glob('*.asar')):
        archive = Asar(path)
        hash_value = hashlib.sha256(archive.raw_header).hexdigest()
        relative = str(path.relative_to(root))
        expected = info.get('ElectronAsarIntegrity', {}).get(relative, {}).get('hash')
        package = json.loads(archive.read('package.json'))
        archives[path.name] = {'bytes': path.stat().st_size, 'headerSHA256': hash_value,
                               'matchesAppPlist': hash_value == expected,
                               'matchesFrameworkPlist': hash_value == framework_info.get('ElectronAsarIntegrity', {}).get(relative, {}).get('hash'),
                               'entryPoint': package.get('main')}
    arm = Asar(root / 'Resources/app-arm64.asar')
    main = arm.read('dist/main.bundle.cjs').decode()
    preload = arm.read('dist/preload.bundle.js').decode()
    return {
        'app': str(pathlib.Path(app).resolve()), 'version': info['CFBundleShortVersionString'],
        'build': info['CFBundleVersion'], 'bundleId': info['CFBundleIdentifier'],
        'electron': framework_info['CFBundleVersion'], 'fuseWires': wires, 'archives': archives,
        'staticCapabilities': {term: term in main + preload for term in [
            'SLACK_DEVELOPER_MENU', 'devToolsEnabled', 'callBrowserWindowMethod',
            'setAlwaysOnTop', 'setBounds', 'setMinimumSize', 'setVisibleOnAllWorkspaces',
            'loadExtension', 'contextIsolation:!0', 'sandbox:!0', 'nodeIntegration:!1']},
        'signature': command('/usr/bin/codesign', '-dv', '--verbose=4', app),
        'signatureVerification': command('/usr/bin/codesign', '--verify', '--deep', '--strict', app),
        'entitlements': command('/usr/bin/codesign', '-d', '--entitlements', ':-', app)
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', default='/Applications/Slack.app')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = inspect(args.app)
    encoded = json.dumps(result, indent=2) + '\n'
    if args.output:
        pathlib.Path(args.output).write_text(encoded)
        print(json.dumps({key: result[key] for key in ['version', 'electron', 'fuseWires', 'archives', 'signatureVerification']}, indent=2))
    else:
        print(encoded)
