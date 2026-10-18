# UNICORN RUN

A two-player, split-screen kart-style race for unicorns, played with your
whole body in front of one webcam. Collect rainbows, jump the hurdles, fill
the meter and fire a RAINBOW DASH. Made by Bianco's Labs.

Built on the architecture and body detection of Bun Rush (`../burgertime`).

## Play

1. Double-click **start.bat**. A small window opens (the local game server) and
   your browser shows the game at http://localhost:8080. Keep that window open.
2. Click **CLICK TO START** and allow the camera.
3. Stand side by side about 2.5 m from the webcam: **player 1 on the left,
   player 2 on the right** (as seen in the camera mirror).
4. Each player raises both hands for a second to join, then stands up
   straight with arms down for a second and a half (calibration).
   An empty seat is taken by a CPU unicorn.
5. **Training**: every new body player gets a short lesson in their half of
   the screen: lean left, lean right, run in place, jump twice, rainbow dash.
   **Cross your arms in front of you (an X) for a second to skip it.** When
   everybody is done, the race starts on the start line. A rematch skips the
   training; new players get it again.

| Your body                       | In the game                         |
|---------------------------------|-------------------------------------|
| Lean your upper body left/right | steer (the further, the sharper)    |
| Run in place                    | gallop faster - stop and you trot   |
| Jump                            | jump over hurdles, rocks and logs   |
| Both hands up                   | join; RAINBOW DASH when the meter is full |
| Arms crossed in front (X)       | skip the training                   |

Steering is measured on your body (shoulders over hips, like a surfer), not
against a spot in the room: walking or drifting while you run does not steer.
At the bottom of each half, a **slider** shows your lean: the dot is you, the
grey middle part is "straight", the arrows light up when the unicorn turns.

Before each hurdle, **HURDLE AHEAD!** appears and a **striped yellow and pink
line** is painted on the road: jump when your unicorn reaches it. The line
moves with your speed, so it is always at the right moment (a bit earlier for
body players than for keyboard players, because a real jump takes longer).

Keyboard works at any time:

| Player 1 | Player 2 | |
|---|---|---|
| W | Up | run |
| A / D | Left / Right | steer |
| S | Down | jump |
| E | Right Shift | rainbow dash |

Enter start now (also skips the training), P pause, C recalibrate, M mute,
V hide the camera panel, R retry the camera, Esc back to the menu.

Three laps. Each rainbow fills the dash meter; 25 rainbows = one dash (fast and
unstoppable for 2.5 s). Floating rainbows above the hurdles need a jump.
Grass slows you down, obstacles make you tumble.

## Troubleshooting

- **Black camera / "Camera blocked"**: allow the camera for localhost in the
  browser's address bar, close other apps using the webcam, then press R.
- **Players swap**: stay on your own half of the camera picture (the dashed
  line in the camera panel).
- **Slow tracking**: open http://localhost:8080/?delegate=CPU to skip the
  graphics card, or close other heavy tabs.
- **Steers when you stand straight**: press C during the race (or Esc and
  rejoin) to recalibrate, standing up straight. Thresholds live in
  `src/config.js` (`GESTURE.tiltDead` / `tiltFull`).
- **Hard to steer**: lower `GESTURE.tiltFull` (less lean needed for a full
  turn). Jump line timing: `HINTS`, training steps: `TUTORIAL`.
- **Opening index.html directly does not work**: browsers block the webcam
  and JavaScript modules for files. Always use start.bat.

## Project layout

```
index.html, css/style.css   page + camera side panel
src/main.js                  wiring, lobby, fixed-timestep loop
src/config.js                every tuning constant
src/input/                   Keyboard, PoseTracker (webcam + MediaPipe, 2 people),
                             PlayerAssigner (who is P1 / P2), RunnerGestures, InputManager
src/game/                    Track (road slices, items), Runner (physics), Cpu, Race (rules),
                             Tutorial (training run), hints (jump line timing)
src/render/                  Renderer (screens, HUD), RoadView (pseudo-3D road),
                             SpriteCache (baked sprites), sprites (vector art), Particles
src/audio/Sound.js           synthesised sound effects and music, panned per player
vendor/mediapipe/            Google MediaPipe Tasks Vision 0.10.14 (Apache-2.0)
models/                      pose_landmarker_lite.task (Apache-2.0)
tests/                       automated tests + gallery.html (all sprites)
serve.ps1, start.bat         local web server for Windows, nothing to install
```

Debug addresses: `/?demo` watch two CPU unicorns race, `/?lobby` skip the
start card, `/tests/gallery.html` every sprite on one page.

## Tests

With Node.js installed: `npm test`. The tests check the gesture rules with
synthetic skeletons (tilt steering, drifting while running, jumping, dash,
crossed arms), the assignment of skeletons to players, the track, the jump
line timing at every speed, the training steps, and full simulated races.

## License

Copyright (C) 2026 François Bianco, Bianco's Labs.

The game's own code (everything except `vendor/` and `models/`) is free
software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version.
It is distributed WITHOUT ANY WARRANTY; see [LICENSE](LICENSE) for details.

Third-party parts keep their own license:

- `vendor/mediapipe/` - Google MediaPipe Tasks Vision 0.10.14, Apache-2.0
  ([vendor/mediapipe/LICENSE](vendor/mediapipe/LICENSE))
- `models/pose_landmarker_lite.task` - Google MediaPipe Pose Landmarker
  model, Apache-2.0
