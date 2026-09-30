'use strict';
// Isolated, fictional demonstrations. No app connection, camera access, or network requests.
const quoteButton = document.querySelector('#quote-demo-button');
if (quoteButton) {
  quoteButton.addEventListener('click', () => {
    const quote = document.querySelector('#demo-quote');
    quote.hidden = !quote.hidden;
    quoteButton.textContent = quote.hidden ? '❞ Quote in reply' : '↶ Reset demo';
    document.querySelector('#quote-demo-status').textContent = quote.hidden
      ? 'Try the quote button. Your existing draft stays in place.'
      : 'Quote added above the draft. Nothing was sent.';
  });
}
const playerTabs = [...document.querySelectorAll('[data-player-tab]')];
const playerViews = {
  library: { title: 'Your library', rows: [['North of Here', 'Album · The Paper Satellites'], ['Slow mornings', 'Playlist · 24 songs'], ['Liked songs', 'Your saved tracks']] },
  search: { title: 'Example search: “daylight”', rows: [['Daylight, slowly', 'Song · The Paper Satellites'], ['Daylight sketches', 'Album · June Fields'], ['First light', 'Playlist · 18 songs']] },
  queue: { title: 'Up next', rows: [['A quieter city', 'The Paper Satellites · 4:12'], ['Window seat', 'June Fields · 3:06'], ['The long way home', 'Moss & Wire · 5:21']] }
};
function selectPlayerTab(id, focus = false) {
  const view = playerViews[id];
  playerTabs.forEach(tab => {
    const active = tab.dataset.playerTab === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  document.querySelector('#player-demo-panel').setAttribute('aria-labelledby', `player-tab-${id}`);
  document.querySelector('#player-list-title').textContent = view.title;
  const rows = view.rows.map(([title, description]) => {
    const row = document.createElement('div'); row.className = 'player-row';
    const cover = document.createElement('div'); cover.className = 'album-art'; cover.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = title;
    const subtitle = document.createElement('small'); subtitle.textContent = description;
    copy.append(name, subtitle); row.append(cover, copy); return row;
  });
  document.querySelector('#player-demo-rows').replaceChildren(...rows);
}
if (playerTabs.length) {
  selectPlayerTab('library');
  playerTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectPlayerTab(tab.dataset.playerTab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % playerTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + playerTabs.length - 1) % playerTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = playerTabs.length - 1;
      else return;
      event.preventDefault(); selectPlayerTab(playerTabs[next].dataset.playerTab, true);
    });
  });
}
const cameraButton = document.querySelector('#camera-demo-button');
if (cameraButton) {
  let phase = 0;
  const phases = [
    ['Music is playing.', 'No selected app is using the camera.', 'Camera off', 'Simulate camera on', 'Demo only. No camera access or Spotify connection.'],
    ['Paused for your camera.', 'A watched app is using the camera. This mod paused playback.', 'Camera on', 'Simulate camera off', 'If Spotify was already paused, the mod would not claim auto-resume.'],
    ['A moment before the music.', 'Camera use ended. Your configured resume delay runs first.', 'Camera off', 'Finish demo delay', 'In the real mod, another camera session cancels this countdown.'],
    ['Back to the music.', 'The delay ended and the paused track was unchanged, so playback resumed.', 'Camera off', 'Reset demo', 'Resumes only when Camera Pause still owns the pause.']
  ];
  cameraButton.addEventListener('click', () => {
    phase = (phase + 1) % phases.length;
    const [title, copy, badge, button, note] = phases[phase];
    document.querySelector('#camera-status-title').textContent = title;
    document.querySelector('#camera-status-copy').textContent = copy;
    document.querySelector('#camera-state-badge').textContent = badge;
    document.querySelector('#camera-demo-note').textContent = note;
    document.querySelector('.camera-demo').dataset.active = String(phase === 1);
    cameraButton.textContent = button;
  });
}
