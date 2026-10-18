// Synthetic MediaPipe skeletons shared by the tests.
// Build 33 fake landmarks for a person standing facing the camera.
// cx = hip centre x, shY = shoulder y (0..1 of the image), sw = shoulder width.
// tilt = upper body leaning sideways (shoulders move over the hips, in
// shoulder widths, + = the person's right = the image's left), the shoulder
// line tilts with it. cross = forearms crossed in front of the chest.
export function pose({ cx = 0.5, shY = 0.4, sw = 0.2, handsUp = false, hipLift = 0, knee = 0, arm = 0, tilt = 0, cross = false } = {}) {
  const sx = cx - tilt * sw;                        // shoulder centre
  // shoulder slope that the interpreter reads back as the same tilt
  // (it multiplies y by the picture's aspect, 0.75 in the tests)
  const s = Math.max(-0.9, Math.min(0.9, tilt / 1.4));
  const drop = ((sw / 2) * (s / Math.sqrt(1 - s * s))) / 0.75;
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: shY, visibility: 0.99 }));
  lm[0] = { x: sx, y: shY - 0.15, visibility: 0.99 };                 // nose
  lm[11] = { x: sx + sw / 2, y: shY - drop, visibility: 0.99 };       // left shoulder (image right)
  lm[12] = { x: sx - sw / 2, y: shY + drop, visibility: 0.99 };
  const wristY = handsUp ? shY - 0.3 : cross ? shY + 0.12 : shY + 0.3;
  const wx = cross ? -sw * 0.25 : sw * 0.7;          // crossed: each wrist on the other side
  lm[15] = { x: sx + wx, y: wristY + arm, visibility: 0.95 };
  lm[16] = { x: sx - wx, y: wristY - arm, visibility: 0.95 };
  lm[23] = { x: cx + sw * 0.35, y: shY + 0.3 - hipLift, visibility: 0.9 };
  lm[24] = { x: cx - sw * 0.35, y: shY + 0.3 - hipLift, visibility: 0.9 };
  lm[25] = { x: cx + sw * 0.35, y: shY + 0.5 + knee, visibility: 0.9 };
  lm[26] = { x: cx - sw * 0.35, y: shY + 0.5 - knee, visibility: 0.9 };
  return lm;
}

/** The same pose with the hips and knees out of the camera picture. */
export function noHips(lm) {
  for (const i of [23, 24, 25, 26]) lm[i].visibility = 0.05;
  return lm;
}
