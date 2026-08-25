# Seven Strands — the second entry, 3D

Same legend as The Seventh Color, opposite form. After the light came
back, one braid of it bolted into the hedge labyrinth; the restored
unicorn runs it down. Third-person 3D chase — completely separate code
from game one, sharing only the build/measure/verify toolchain
(`--game=strands` on the same tools, same squeeze chain, so byte numbers
stay comparable across both entries).

## Architecture

```
strands/src/
  gl.js      raw WebGL: one shader (lambert + distance fog), hand-rolled
             mat4 (perspective/lookAt/mul), box mesh builder
  maze.js    recursive-backtracker maze; ONE wall list feeds geometry,
             circle collision, and BFS - what you see is what you hit is
             what the braid reasons about
  uni.js     the unicorn as boxes: gold horn, violet mane, rainbow tail
  ribbon.js  the braid: an agent fleeing via argmax BFS-distance at every
             junction, trailing 7 woven strands along its actual path
  main.js    loop, tank controls, rubber-band chase, camera, HUD (2D
             canvas overlay), tone audio (gallop + 7-note catch arpeggio)
```

No three.js — the whole renderer is ~130 lines and the entire game fits
in ~4.8 KB zipped, a third of the budget, before polish milestones.

## Design notes, S0

- **The braid is honest.** Its ribbon is the trail of where it actually
  ran, so it snakes around the corners it took. It flees by argmax of
  BFS-distance-from-player recomputed every 250 ms, doubles back only
  from dead ends — cornering it is real, luck is not required.
- **Rubber band, both ways.** Panics to 4.2 u/s when the player is close
  (player tops at 5.2, so a committed straight catches it), dawdles at
  1.7 when far. A rainbow beacon pillar rises over the walls when it is
  far — a maze you cannot find the quarry in is hide-and-seek, and this
  game is tag.
- **Catch the tail, not the head** — trail[0], the oldest point, is the
  catch target, which is exactly the fantasy: you close in on the braid
  streaming behind it.
- Rounds grow: each catch rebuilds a maze two cells wider.

## Milestone log

| gate | ceiling | worst-of-5 | notes |
| --- | ---: | ---: | --- |
| S0 first playable | 6,500 | 4,790 | maze+chase+catch+title/win, headless-verified |

Bugs caught by looking at S0 screenshots, not by the harness: the
hand-rolled `lookAt` used `z×up` instead of `up×z` and rendered the world
upside down; the round opened with the camera flying in from outside the
maze (now snapped behind the player, facing an open corridor); headless
WebGL needed `--enable-unsafe-swiftshader` and its driver's *performance*
chatter had to be filtered from the verify harness without loosening real
error detection.
