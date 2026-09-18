#!/bin/zsh -l
cd -- "${0:A:h}" || exit 1
if [[ ! -f scripts/devctl.mjs && -f ../scripts/devctl.mjs ]]; then
  cd .. || exit 1
fi
node scripts/devctl.mjs stop
result=$?
if (( result != 0 )); then
  print 'Could not reach the development launcher. You can quit the development Slack normally.'
  read '?Press Return to close.'
fi
exit $result
