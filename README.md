# HexaSort

A lightweight 3D mobile playable ad built in Cocos Creator 3.8. A six-level
tower of rotating shelves holds colored hex pieces; the player swipes a
level to rotate it, lining a piece up with a fixed drop column running
through the tower. Matching pieces fall in and stack; collect six of the
same color and they clear. Two clears end the ad and show the CTA.

## Gameplay loop

```
swipe a level
      |
piece aligns with the drop column
      |
it falls and stacks
      |
6 matching colors collected
      |
clear + pop animation
      |
repeat once more -> CTA
```

- Each level has 14 ring positions: one (`Slots_00`) is a fixed, always-empty
  anchor aligned with the drop column; the other 13 hold randomly colored
  hex pieces, evenly spaced around the ring.
- Colors: Red, Blue, Green, Yellow, Purple, Orange, Pink.
- A level locks against rotation once the drop column's fill has reached
  its height, and unlocks again once that run clears.
- A short tutorial hand demonstrates the first correct swipe; it dismisses
  on the player's first touch.

## Project structure

```
assets/
  scripts/
    gameplay/
      GameManager.ts     - board setup, puzzle placement, game state, win condition
      TowerLevel.ts       - one rotating tier: ring geometry, snapping, alignment
      BoardSlot.ts         - TowerSlot: a single hex cell (holds at most one piece)
      TowerInput.ts        - touch/mouse swipe handling, tutorial hand
      DropColumn.ts        - the fixed collection column: accept, fall, match, clear
      HexPiece.ts           - color enum + material swapping
    ui/
      CTAController.ts     - end-card overlay and PLAY NOW button
  prefabs/                 - hex piece prefab, board/tower prefab
  materials/                - one material per hex color
  scene.scene                - the tower scene
settings/, package.json, tsconfig.json  - Cocos Creator project config
tools/build_standalone.py  - generates a single self-contained playable HTML file
```

## Opening the project

Requires Cocos Creator **3.8.8**. Open this folder as a project from the
Cocos Dashboard, or launch directly:

```bash
CocosCreator.exe --project <path-to-this-folder>
```

## Building

Standard build: **Project → Build**, platform **Web Mobile**, portrait
orientation. Output goes to `build/web-mobile/` as a folder of files — this
only runs correctly when served over HTTP(S), not opened directly as a
`file://` page.

### Single-file playable build

Ad networks require one self-contained HTML file with no external
requests. After a normal Web Mobile build, run:

```bash
python tools/build_standalone.py
```

This inlines every script and asset (as data URIs) into
`build/web-mobile-standalone/index.html`, which works standalone —
double-click to open, or drop it straight into an ad network's playable
upload.

The default build bundles unused Physics and Spine modules, inflating the
standalone file to ~17 MB. To shrink it for submission: **Project Settings
→ Feature Cropping**, uncheck Physics and Spine, rebuild, then re-run the
script above.
