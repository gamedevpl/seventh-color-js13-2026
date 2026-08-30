# On-device test build

`unicorn-snap.html` is a **self-contained, unpacked build of Unicorn Snap**,
committed so the game can be opened on a real phone without a local server.

It exists for one question the desktop cannot answer: whether the phone's
orientation sensors reach the page. A cross-origin iframe without an
`allow="gyroscope"` permissions policy delivers no orientation events, no
error and no permission prompt — indistinguishable from broken code — so the
game has to be loaded as a **top-level page** to tell the two apart.

Two ways to open it on a phone, neither needing a server:

- **htmlpreview** — renders the file into a top-level document:
  `https://htmlpreview.github.io/?https://raw.githubusercontent.com/gamedevpl/seventh-color-js13-2026/claude/unicorn-photo-game-js13k-e27twr/docs/unicorn-snap.html`
- **GitHub Pages** — enable Pages for the branch in the repository settings
  and the file is served at `/<repo>/docs/unicorn-snap.html`.

Raw githubusercontent will NOT work: it is served as `text/plain` and the
browser shows the source rather than running it.

This is a convenience artifact, not the submission. The submission is built
from source by `npm run snap` and is packed; this one is unpacked so it
loads instantly and is easy to read.
