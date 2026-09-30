# Product website

The product tour lives at <https://sy14r.github.io/PimpMyElectron/>. Source is in
`site/`: dependency-free HTML, CSS, JavaScript, and checked-in visual assets.

## Preview and edit

From the repository root:

```sh
python3 -m http.server 57411 --bind 127.0.0.1 --directory site
```

Open <http://127.0.0.1:57411/>. Edit `site/index.html`, `site/style.css`, or
`site/site.js`, then reload. Check desktop and narrow mobile layouts, all four
walkthrough steps, keyboard tab navigation, FAQ disclosures, and download links.
Keep asset paths relative so the site works under GitHub Pages' project prefix.

## Page structure

`site/index.html` is the landing page. Each mod has a dedicated page under
`site/mods/`: Slack Triage, Quote in Reply, Spotify Menu Player, and Camera Pause.
They share `style.css`, `details.css`, and `details.js`. The landing-page links and
related-mod links should stay within the product site; technical guides remain
linked separately. The quote, player, and camera examples are fictional browser
demos, not connections to the installed apps.

## Product visuals

Inbox, pill, strip, and manager screenshots use the actual checked-in renderers
with synthetic data. They contain no real workspace messages, accounts, or tokens.
The hover preview and native conversation area are explicitly labeled illustrations.

To refresh the screenshots on macOS with Google Chrome installed:

```sh
node scripts/site-assets.mjs
# Or refresh one asset:
node scripts/site-assets.mjs slack-inbox
```

Set `PME_SCREENSHOT_CHROME` to override the Chrome executable path. The script uses
an isolated temporary Chrome profile and offline HTML fixtures in `.lab/site-assets/`.
It does not connect to Slack, Spotify, or a user's browser profile. Review each
result in `site/assets/` before committing: renderer changes may require adjusting
the fixture. Never publish real messages or personal installation data.

## Publishing

`.github/workflows/pages.yml` deploys **only `site/`** when changes to that directory
or workflow land on `main`. GitHub Pages must use **GitHub Actions** as its source.
The workflow can also be started manually from Actions → Deploy website.
It uses the built-in short-lived GitHub token; no deployment secret is needed.
The rest of the repository, including development mockups, is not part of the site.

A website change does not require a client version bump or application release.
Download links use GitHub's latest-release URL. When product capabilities change,
update the copy and screenshots alongside the relevant documentation. The Pages
workflow is not an app test or app release workflow.

The site has no analytics, forms, external fonts, or third-party scripts. Keep its
Content Security Policy and accessible tab controls intact when extending it.
