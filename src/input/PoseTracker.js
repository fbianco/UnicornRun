// ---------------------------------------------------------------------------
// PoseTracker: webcam -> MediaPipe Pose Landmarker -> up to 2 skeletons.
//
// The MediaPipe library (JavaScript + WebAssembly) ships inside the project
// in vendor/mediapipe, so nothing has to be installed. The neural-network
// model is loaded from models/ if present, otherwise from Google's public
// model storage. Same as Bun Rush, but asks for two people (numPoses: 2).
// It also draws the camera "mirror" with both skeletons and their zones.
// ---------------------------------------------------------------------------
import { GESTURE, PLAYERS } from '../config.js';
import { LM } from './RunnerGestures.js';

const LIB = new URL('../../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;
const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_LOCAL = new URL('../../models/pose_landmarker_lite.task', import.meta.url).href;
const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Skeleton lines to draw (pairs of landmark indices)
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export class PoseTracker {
  constructor(video, overlay) {
    this.video = video;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.status = 'idle';       // idle | camera | model | ready | error
    this.message = 'Camera off';
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.latest = [];
    this.fps = 0;
  }

  get ready() {
    return this.status === 'ready';
  }

  async start() {
    try {
      this.status = 'camera';
      this.message = 'Waiting for camera permission...';
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera API');
      const stream = await navigator.mediaDevices.getUserMedia({
        // a wider picture leaves room for two people side by side;
        // resizeMode 'none' picks a native camera mode instead of letting
        // the browser crop the sensor picture to the requested shape
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user', resizeMode: 'none' },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();

      this.status = 'model';
      this.message = 'Loading body tracking...';
      const vision = await import(LIB);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      const modelAssetPath = await pickModel();
      const options = (delegate) => ({
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      // add ?delegate=CPU to the address to skip the graphics card
      const forced = new URLSearchParams(location.search).get('delegate');
      try {
        this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options(forced === 'CPU' ? 'CPU' : 'GPU'));
      } catch (gpuError) {
        console.warn('GPU delegate failed, using CPU', gpuError);
        this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options('CPU'));
      }
      this.status = 'ready';
      this.message = 'Body control ON';
    } catch (err) {
      console.error(err);
      this.status = 'error';
      this.message = friendlyError(err);
    }
  }

  /**
   * Run the detector on the newest camera frame.
   * Returns an array of skeletons (possibly empty), or undefined if there
   * was no new camera frame since the last call.
   */
  detect(nowMs) {
    if (!this.ready || this.video.readyState < 2) return undefined;
    if (this.video.currentTime === this.lastVideoTime) return undefined;
    this.lastVideoTime = this.video.currentTime;
    const result = this.landmarker.detectForVideo(this.video, nowMs);
    if (this.lastDetectAt) this.fps = this.fps * 0.9 + (1000 / Math.max(1, nowMs - this.lastDetectAt)) * 0.1;
    this.lastDetectAt = nowMs;
    this.latest = result.landmarks ?? [];
    return this.latest;
  }

  /**
   * Draw both skeletons + their gesture zones over the (mirrored) camera
   * picture. `slots[i] = { gest, lm }` for player i.
   */
  drawOverlay(slots) {
    const v = this.video;
    const c = this.overlay;
    const w = v.videoWidth || 960;
    const h = v.videoHeight || 540;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = this.octx;
    g.clearRect(0, 0, w, h);
    const cfg = GESTURE;

    // the middle of the room: P1 stays left of it, P2 right (mirrored view,
    // so in raw image coordinates P1 is on the right half)
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    line(g, w / 2, 0, w / 2, h);
    g.setLineDash([]);

    slots.forEach((slot, i) => {
      const col = PLAYERS[i].color;
      const gest = slot.gest;
      const out = gest.out;
      const b = gest.baseline;
      const P = out.points;
      if (b && !gest.calibrating && out.present && P) {
        // the interpreter works in "width units" (y is scaled by h/w), so
        // one unit = w pixels in both directions here
        const sw = b.sw * w;
        const sx = ((P[LM.L_SHOULDER].x + P[LM.R_SHOULDER].x) / 2) * w;
        const sy = ((P[LM.L_SHOULDER].y + P[LM.R_SHOULDER].y) / 2) * w;
        // steering: the torso line (hips -> shoulders) against straight up
        const hipsSeen = P[LM.L_HIP].v > 0.6 && P[LM.R_HIP].v > 0.6;
        if (hipsSeen) {
          const hx = ((P[LM.L_HIP].x + P[LM.R_HIP].x) / 2) * w;
          const hy = ((P[LM.L_HIP].y + P[LM.R_HIP].y) / 2) * w;
          g.lineWidth = 2;
          g.setLineDash([6, 6]);
          g.strokeStyle = 'rgba(255,255,255,0.5)';
          line(g, hx, hy, hx, sy - sw * 0.4);
          g.setLineDash([]);
          g.lineWidth = 5;
          g.strokeStyle = Math.abs(out.steer) > 0.05 ? '#ffe14d' : 'rgba(255,255,255,0.8)';
          line(g, hx, hy, sx, sy);
        }
        const jy = (b.hy ?? b.y) * w - cfg.jumpRise * sw;
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.strokeStyle = out.jump ? '#ffffff' : hexA(col, 0.6);
        line(g, sx - sw * 1.6, jy, sx + sw * 1.6, jy);
        g.setLineDash([]);
      }

      const lm = slot.lm;
      if (!lm) return;
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.strokeStyle = col;
      for (const [a, bb] of BONES) {
        if ((lm[a].visibility ?? 1) < 0.4 || (lm[bb].visibility ?? 1) < 0.4) continue;
        line(g, lm[a].x * w, lm[a].y * h, lm[bb].x * w, lm[bb].y * h);
      }
      g.fillStyle = '#ffffff';
      for (const k of [LM.NOSE, LM.L_WRIST, LM.R_WRIST, LM.L_SHOULDER, LM.R_SHOULDER]) {
        g.beginPath();
        g.arc(lm[k].x * w, lm[k].y * h, 6, 0, Math.PI * 2);
        g.fill();
      }
      // label above the head (text is drawn mirrored back so it reads correctly)
      const nx = lm[LM.NOSE].x * w;
      const ny = Math.max(30, lm[LM.NOSE].y * h - 50);
      g.save();
      g.translate(nx, ny);
      g.scale(-1, 1);
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(-30, -20, 60, 32, 8);
      g.fill();
      g.fillStyle = '#1b0b2e';
      g.font = 'bold 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(PLAYERS[i].label, 0, 4);
      g.restore();
    });
  }
}

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

async function pickModel() {
  try {
    const r = await fetch(MODEL_LOCAL, { method: 'HEAD' });
    if (r.ok) return MODEL_LOCAL;
  } catch { /* not there */ }
  return MODEL_REMOTE;
}

function friendlyError(err) {
  const name = err?.name ?? '';
  if (name === 'NotAllowedError') return 'Camera blocked - allow it in the browser, then press R';
  if (name === 'NotFoundError') return 'No webcam found - keyboard mode';
  if (name === 'NotReadableError') return 'Webcam busy in another app - close it, then press R';
  if (location.protocol === 'file:') return 'Start the game with start.bat (not by double-clicking index.html)';
  return 'Body tracking unavailable (' + (err?.message ?? err) + ') - keyboard mode';
}
