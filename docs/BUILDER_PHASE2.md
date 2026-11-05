# Scene builder: phase 2 (timeline)

Phase 1 is live at `/builder`. Read the "Scene builder" section of `CLAUDE.md`, then `source/public/builder.html` and `startBuilder()` in `source/public/index.html`.

## Goal
Let the director animate a scene: choose exactly when each pose starts, move things over time, and preview it. Preview only: video export is phase 3.

## What to build
1. **Timeline panel** under the stage: one row per layer, a time ruler, a draggable playhead, and play, pause and stop.
2. **Keyframes** on each layer: at a chosen time, set pose, frame, x, y, zoom, flip, outfit and rain gear. Add one from the current values with a button, and allow selecting, moving and deleting them.
3. **Rules between keyframes:** x and y glide in a straight line, rounded to whole pixels. Everything else changes at the keyframe and holds until the next one.
4. **Animated poses:** an option on a keyframe to loop the pose (walking while moving), with frames taken from the time, against a fixed pose frame.
5. **Duration:** a project setting, default 10 seconds, in steps of 0.1 s to match `FRAME_MS` (100 ms). Keep the 60 frames of phase 1 as they are.
6. **Background timing:** frozen stays the default. Keyframes may change its time, weather and frame; animating it live is optional if it stays smooth.

## Rules to keep
- Square stage, 108 x 108 logical pixels, whole zoom only, no rotation, as the director asked.
- All art comes from `window.__builder`. Never copy drawing code into `builder.html`; add to `PROPS` or `sprite()` instead.
- `paint(ctx, k)` stays the single picture path, so a future export matches the preview pixel for pixel. Add a time argument, or resolve the layers at a time first and paint those.
- PNG export keeps working, and exports the picture at the playhead.
- Project format: `v: 1` has no keyframes. Bump to `v: 2`, and old projects must open unchanged, with their layer values as the first keyframe. Check `use()`, which fills in missing fields.
- The live show must not change. `BUILDER` and `NO_CROWD` are off there, and the drawing functions are shared: no `Math.random()` or per-browser timing in anything the show plays (see "Everyone sees the same thing").
- Text layers (`kind: 'text'`) are made in `builder.html` by `textSprite()`, not by the hidden page. Keyframes may change their position, zoom and colours; wrapping depends on zoom.
- Sprites are cached by value in `spriteOf()`. Playback should reuse that cache; the 400 entry limit may need raising.
- No AI and no KV writes. Fictional brands only. No new npm step: the repo has none (`src/vendor/` holds copied code).

## Test before pushing
There is no test suite. Serve `source/public` with a small local server (`/` is index.html, `/builder` is builder.html, replacing `__BUILD__`) and drive it with Playwright, which is installed. Check these, in a real browser:
- Keyframes play at the right times, a pose changes on the exact frame, and a glide lands on its end position.
- A phase 1 project opens and looks the same.
- PNG export at the playhead equals the stage: 5076 x 5076, every 47 x 47 block one colour, transparent with no background.
- It works at phone width, with no sideways scroll and touch dragging on the timeline.
- No console errors, and the main page still runs.

Then run `cd source && node build.mjs`, bump `VERSION`, update `CLAUDE.md`, commit and push to `main`.

## Later phases (not now)
- Phase 3: video export (WebM through `MediaRecorder` at whole sizes), PNG frame sequences, SVG export. GIF was dropped for now.
- Phase 4: undo, copy and paste, snapping, better phone layout.
