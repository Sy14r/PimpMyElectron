# Slack Reply Tools

In PME → Slack, enable **Reply Tools**, then launch Slack. This mod is optional
and independent: enable it by itself for the normal Slack interface, or alongside
**Slack Triage**. Changing mods requires stopping and relaunching the managed app.
Existing launcher shortcuts need **Update selection** to include the new mod.

Hover over a text message and choose the quotation-mark button, **Quote in reply**,
just before More actions and mirrors both commands into the message's native
More actions menu when Slack exposes its Copy link entry. PME inserts the rendered text as a blockquote above your
existing draft and focuses Slack’s composer. It does not send anything or start a
thread. In an already-open thread, it uses that thread’s existing composer. In a
channel or DM, it uses the main conversation composer.

The native rich-text editor receives blockquote formatting (the equivalent of
Markdown `> ` quoting). If the editor only supports plain text, each line receives
a `> ` prefix. Quotes preserve line breaks and readable emoji/mention labels;
embedded files, rich cards, and the original message’s inline styling are not
copied. Existing draft formatting and attachments stay intact. Native Undo can
remove the inserted quote.

Choose **Reply with preview** to insert the message's validated Slack permalink at
the start of the same composer. Slack's native paste handling renders it as a
quoted-message preview when available; otherwise the safe permalink remains as
text. Press bare **Q** while hovering a message, or while its preview action has
keyboard focus, for the same operation. The shortcut never captures Q from a
non-empty editor. Quote, preview, and shortcut controls can each be toggled from
PME or the live Slack Settings window.

Reply Tools also owns the independent **Compact message-preview cards** setting.
It limits forwarded/native preview cards to three text lines and smaller media;
Message Polish is not required for this treatment.

The mod checks the workspace, channel, and thread before inserting. Search and
Activity previews without their own matching editable conversation composer are
not destinations: open the conversation first. Empty or excessively long quotes
are refused with an explanation. It depends on Slack’s private UI structure and
Quill editor; future Slack updates may require compatibility adjustments.

The standalone launch uses the ordinary Slack window and no triage helper or
background message observer. Reply Tools makes no API requests and stores no
message history. It reads only the clicked rendered message or its existing
permalink and edits its local draft. This first packaged version is qualified for macOS, like the PME Slack
launcher; the renderer itself does not require macOS APIs.

Implementation: `src/renderer/quote-reply.js`; catalog ID `slack-quote-reply`.
Native editor integration uses Quill’s [Delta update API](https://quilljs.com/docs/api#updatecontents)
and [history boundaries](https://quilljs.com/docs/modules/history#cutoff).
