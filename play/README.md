# play/

Built pages, committed so they can be opened straight from GitHub without a
build step — which is the only way to try the **Online** category outside a
local checkout. A sandboxed preview cannot open a WebSocket; a real origin
can, and `htmlpreview.github.io` serves one.

Open `unicorn-fireball.html` through:

    https://htmlpreview.github.io/?https://raw.githubusercontent.com/gamedevpl/seventh-color-js13-2026/<branch>/play/unicorn-fireball.html

Two tabs, press **O** in both, and you are on the same plain.

These files are generated, not written. Refresh them with:

    npm run fireball:play

The zip in `build/` is still the submission; this is only a way to hand
someone a link.
