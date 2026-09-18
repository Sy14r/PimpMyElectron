#!/bin/zsh -l
cd -- "${0:A:h}" || exit 1
# In a Git checkout these launchers live in pilot/; packaged copies live at root.
if [[ ! -f scripts/dev.mjs && -f ../scripts/dev.mjs ]]; then
  cd .. || exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 22 or newer is required. Install it, then reopen this launcher.'
  read '?Press Return to close.'
  exit 1
fi
node scripts/doctor.mjs && node scripts/dev.mjs
result=$?
if (( result != 0 )); then
  print 'Triage did not start. Review the details above; existing Slack sessions are preserved.'
  read '?Press Return to close.'
fi
exit $result
