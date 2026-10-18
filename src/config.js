// ---------------------------------------------------------------------------
// Unicorn Run - global constants
// Every "magic number" of the game lives here so it can be tuned in one place.
// ---------------------------------------------------------------------------

// Logical resolution. The canvas is scaled to the window, but all drawing
// works in these fixed units. The screen is split into two 640 x 720 views.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const HALF_W = VIEW_W / 2;

export const PLAYERS = [
  { name: 'PINKY', label: 'P1', color: '#ff5fa8', light: '#ffc2e0', body: '#ffffff', shade: '#e9dcff', saddle: '#ff5fa8', pan: -0.6 },
  { name: 'SKY', label: 'P2', color: '#3fd0ff', light: '#b8efff', body: '#efe6ff', shade: '#c6b5f2', saddle: '#2fb8f0', pan: 0.6 },
];

// Pseudo-3D road. World units are arbitrary; x = 0 is the middle of the
// road, which spans x = -ROAD.width .. +ROAD.width.
export const ROAD = {
  segmentLength: 200,     // depth of one road slice
  rumbleLength: 3,        // slices per colour band of the rainbow kerb
  width: 1500,            // half width of the road
  lanes: 3,
  fov: 100,               // camera field of view (degrees)
  cameraHeight: 900,
  horizon: 0.40,          // horizon height as a fraction of the view height
  drawDistance: 200,      // how many slices are drawn ahead
  fogDensity: 4,
};
export const CAMERA_DEPTH = 1 / Math.tan(((ROAD.fov / 2) * Math.PI) / 180);
// the runner stands this far in front of its camera
export const PLAYER_Z = ROAD.cameraHeight * CAMERA_DEPTH;

export const LAPS = 3;

// Running physics. Speeds are in world units per second.
const MAX = ROAD.segmentLength * 55;
export const RUN = {
  maxSpeed: MAX,
  trot: 0.22,             // fraction of max speed when you do not run at all
  accel: MAX / 2.2,
  decel: MAX / 1.6,
  offRoadFactor: 0.55,    // top speed multiplier on the grass
  steerRate: 2.3,         // road half-widths per second at full steer
  centrifugal: 0.2,       // how hard curves push you outwards
  maxX: 2.1,              // how far onto the grass you can go
  jumpSpeed: 3400,        // initial upward speed of a jump
  gravity: 9000,
  clearHeight: 140,       // above this height you fly over obstacles
  stumbleTime: 1.1,       // s of tumbling after hitting an obstacle
  stumbleSpeed: 0.3,      // speed multiplier on impact
  invulnTime: 1.4,        // s of safety after a tumble
  powerMax: 25,           // rainbows needed to fill the RAINBOW DASH meter
  dashTime: 2.5,          // s of rainbow dash
  dashSpeed: 1.45,        // speed multiplier while dashing
  rainbowKick: 0.03,      // small speed boost per rainbow
  halfWidth: 0.13,        // half width of a unicorn in road half-widths
};

export const UNICORN_W = 400;  // world width of a unicorn sprite
export const UNICORN_H = 480;

// Webcam gesture tuning. Distances are expressed in "shoulder widths" so they
// work whether you stand 2 m or 3 m away from the camera.
export const GESTURE = {
  smoothing: 0.6,          // weight of the newest sample in the moving average
  calibrationSeconds: 1.5, // how long to stand still while calibrating
  // steering = tilting the upper body: how far the shoulders sit sideways
  // over the hips, so it does not matter where in the room you stand
  tiltDead: 0.15,          // tilt (shoulder widths) that is still "straight"
  tiltFull: 0.55,          // tilt that steers fully (about 20 degrees)
  torsoRatio: 1.4,         // hips out of view: shoulder slope -> tilt (torso length / shoulder width)
  tiltNeutralMax: 0.2,     // a lean recorded while calibrating is only trusted up to this
  crossHold: 1.0,          // s with the arms crossed (an X) in front of you = skip the training
  jumpRise: 0.35,          // hips this much higher than normal...
  jumpVelocity: 1.4,       // ...while moving up at least this fast (widths / s) = jump
  jumpCooldown: 0.6,       // s between two jumps
  runWindow: 0.6,          // s of history used to measure running in place
  bobMin: 0.05, bobFull: 0.2,     // up-down bounce of the hips (peak to peak)
  kneeMin: 0.18, kneeFull: 0.7,   // alternating knees
  armMin: 0.35, armFull: 1.2,     // alternating arm pumping
  runAttack: 0.35,         // how fast the run meter rises / falls (per frame)
  runRelease: 0.08,
  boostHold: 0.3,          // s with both hands up to fire the rainbow dash
  baselineFollow: 0.02,    // slow re-centring of the standing height
  scaleFollow: 0.01,       // slow adaptation when you walk closer / farther
  minVisibility: 0.5,
  handsUpToJoin: 1.0,      // s with both hands up to join the race
};

// On-screen help during the race.
export const HINTS = {
  jumpWarn: 2.5,           // s before a hurdle the "get ready to jump" warning appears
  // the jump line on the road sits this many seconds of running before the
  // hurdle (it moves with your speed). A body jump is detected later than a
  // key press (crouch + camera), so body players get an earlier line.
  jumpLeadBody: 0.75,
  jumpLeadKeys: 0.45,
};

// The training run before the race (one per new body player).
export const TUTORIAL = {
  steerMin: 0.5,           // steer this much...
  steerHold: 0.7,          // ...for this long (s, added up) to pass "lean left / right"
  runMin: 0.55,            // run meter this full...
  runHold: 1.5,            // ...for this long (s, added up) to pass "run in place"
  jumps: 2,                // jumps to pass "jump"
  praise: 1.1,             // s of "GREAT!" before the next step
  endDelay: 1.6,           // s of "LET'S RACE!" once everybody is done
  dropAfter: 10,           // s out of view before a training seat is given to a CPU
};

// Keyboard: one block of keys per player.
export const KEYS = [
  { left: ['KeyA'], right: ['KeyD'], run: ['KeyW'], jump: ['KeyS'], boost: ['KeyE', 'KeyQ'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], run: ['ArrowUp'], jump: ['ArrowDown'], boost: ['ShiftRight', 'Slash', 'Numpad0'] },
];

export const FONT = '"Press Start 2P", "Courier New", monospace';
export const GAME_TITLE = 'UNICORN RUN';
export const STUDIO = "Bianco's Labs";

export const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4ddb6a', '#3fa9ff', '#a66bff'];
