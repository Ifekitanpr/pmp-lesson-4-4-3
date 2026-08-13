import { useEffect, useRef } from "react";
import { Player } from "@remotion/player";
import { AnimatedIllustration } from "./AnimatedIllustration";

function getSvgSize(svg) {
  const match = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  if (match) return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
  return { width: 1536, height: 1024 };
}

// Some browsers (and headless/automated contexts especially) block autoPlay
// until a real user gesture happens on the page, even for muted players.
// Every mounted IllustrationPlayer registers itself here; the first
// pointerdown/keydown anywhere kicks all of them into playing, so a reveal
// that happened to autoplay-block still starts the instant the learner
// interacts with the lesson at all (which they always do immediately).
const pendingPlayers = new Set();
let gestureListenerAttached = false;

function ensureGestureListener() {
  if (gestureListenerAttached || typeof window === "undefined") return;
  gestureListenerAttached = true;
  const kick = () => {
    pendingPlayers.forEach((ref) => {
      try {
        ref.current?.play();
      } catch {
        // ignore - player may already be playing or unmounted
      }
    });
    window.removeEventListener("pointerdown", kick);
    window.removeEventListener("keydown", kick);
  };
  window.addEventListener("pointerdown", kick);
  window.addEventListener("keydown", kick);
}

// Drop-in replacement for a static <img> illustration: plays the grouped SVG's
// staggered part-by-part reveal once, live, right inside the lesson (no
// separate rendered video). Sized to fill its parent like the <img> did.
// Long enough that nobody sits on one lesson screen long enough to see it
// freeze -- the entrance plays once in the first couple seconds, then gentle
// idle motion (see AnimatedIllustration) keeps going for the rest of this.
const DEFAULT_DURATION_IN_FRAMES = 30 * 60 * 10; // 10 minutes at 30fps

export function IllustrationPlayer({
  svg,
  durationInFrames = DEFAULT_DURATION_IN_FRAMES,
  stagger = 6,
  partDuration = 20,
  className,
  style,
}) {
  const { width, height } = getSvgSize(svg);
  const playerRef = useRef(null);

  useEffect(() => {
    ensureGestureListener();
    pendingPlayers.add(playerRef);
    return () => pendingPlayers.delete(playerRef);
  }, []);

  return (
    <Player
      ref={playerRef}
      component={AnimatedIllustration}
      inputProps={{ svg, stagger, partDuration }}
      durationInFrames={durationInFrames}
      compositionWidth={Math.round(width)}
      compositionHeight={Math.round(height)}
      fps={30}
      autoPlay
      initiallyMuted
      loop={false}
      moveToBeginningWhenEnded={false}
      controls={false}
      clickToPlay={false}
      showVolumeControls={false}
      acknowledgeRemotionLicense
      className={className}
      style={{ width: "100%", ...style }}
    />
  );
}
