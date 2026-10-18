// ---------------------------------------------------------------------------
// Jump cue: when should this runner jump over the next full-width hurdle?
//
// A hurdle is cleared when you take off between ~0.05 and ~0.7 s before
// reaching it (see RUN.jumpSpeed / gravity / clearHeight), whatever your
// speed. So the cue is a TIME, not a fixed spot: the "jump line" painted on
// the road sits `lead` seconds of running before the hurdle and slides with
// your speed. Jump when your unicorn reaches it.
//
// Pure maths: used by the renderer (line + warning) and the tests.
// ---------------------------------------------------------------------------
import { HINTS } from '../config.js';

/**
 * Returns null when there is no hurdle coming, else
 *   { ahead, time, lineDist, warn, now }
 *   ahead    world units to the hurdle
 *   time     s until the hurdle at the current speed
 *   lineDist where the jump line is (same units as runner.dist)
 *   warn     the hurdle is close: show "get ready"
 *   now      the unicorn has reached the line: JUMP!
 */
export function jumpCue(r, track, lead) {
  if (r.finished) return null;
  const ahead = track.hurdleAhead(r.dist);
  if (!Number.isFinite(ahead)) return null;
  const time = r.speed > 1 ? ahead / r.speed : Infinity;
  return {
    ahead,
    time,
    lineDist: r.dist + ahead - r.speed * lead,
    warn: time <= HINTS.jumpWarn,
    now: time <= lead,
  };
}
