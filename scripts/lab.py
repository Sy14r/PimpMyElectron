#!/usr/bin/env python3
"""Start/stop a signed-out Slack test profile, with explicit ownership checks."""
import argparse
import json
import os
import pathlib
import signal
import socket
import subprocess
import time
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
LAB = ROOT / '.lab'
SESSION = LAB / 'session.json'
APP = '/Applications/Slack.app/Contents/MacOS/Slack'
PROFILE = pathlib.Path.home() / 'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/SlackIntegrationTest'


def start():
    if subprocess.run(['pgrep', '-x', 'Slack'], capture_output=True).returncode == 0:
        raise RuntimeError('Quit Slack before starting the lab; the lab never quits an existing Slack process.')
    if PROFILE.exists():
        raise RuntimeError(f'Integration-test profile already exists. Preserve or move it first: {PROFILE}')
    LAB.mkdir(exist_ok=True, mode=0o700)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    args = [APP, '--integrationTestMode', '--remote-debugging-address=127.0.0.1', f'--remote-debugging-port={port}']
    with (LAB / 'slack-isolated.log').open('w') as log:
        child = subprocess.Popen(args, stdout=log, stderr=log, start_new_session=True)
    state = {'pid': child.pid, 'profile': str(PROFILE), 'port': port, 'args': args}
    SESSION.write_text(json.dumps(state, indent=2))
    os.chmod(SESSION, 0o600)
    try:
        for _ in range(120):
            if child.poll() is not None:
                raise RuntimeError(f'Slack exited: {child.returncode}')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=1) as response:
                    pages = [t for t in json.load(response) if t['type'] == 'page']
                if any('/client/' in t['url'] for t in pages):
                    raise RuntimeError('Unexpected signed-in page; aborting isolation test')
                if any(t['url'].startswith('https://app.slack.com/ssb/first?') for t in pages):
                    print(f'Signed-out lab ready on 127.0.0.1:{port}; PID {child.pid}')
                    return
            except (OSError, ValueError):
                pass
            time.sleep(.25)
        raise RuntimeError('Signed-out welcome page did not become available')
    except BaseException:
        child.terminate()
        child.wait(timeout=5)
        raise


def stop():
    state = json.loads(SESSION.read_text())
    if state['profile'] != str(PROFILE) or '--integrationTestMode' not in state['args']:
        raise RuntimeError('Not a recognized lab session')
    pid = state['pid']
    command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
    if command.returncode == 0:
        if APP not in command.stdout or '--integrationTestMode' not in command.stdout:
            raise RuntimeError('PID was reused; refusing to stop it')
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if subprocess.run(['ps', '-p', str(pid)], capture_output=True).returncode != 0:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Lab did not stop; profile preserved in place')
    if subprocess.run(['pgrep', '-x', 'Slack'], capture_output=True).returncode == 0:
        raise RuntimeError('Another Slack process is running; will not move profile')
    if PROFILE.exists():
        destination = LAB / f'profile-{uuid.uuid4().hex[:10]}'
        PROFILE.rename(destination)
        print(f'Preserved disposable profile at {destination}')
    print('Lab stopped; normal Slack profile was not moved or deleted.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop'])
    args = parser.parse_args()
    try:
        start() if args.action == 'start' else stop()
    except Exception as error:
        parser.exit(1, f'{error}\n')
