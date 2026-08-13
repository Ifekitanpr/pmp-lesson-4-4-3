import { useId, useMemo } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { parseIllustrationSvg } from "../lib/parseIllustration";

// Picks the "accent" parts that should keep looping forever once settled --
// the small elements (icon badges, status markers, alert glyphs) rather than
// the whole illustration. Most illustrations have 1-2 parts noticeably
// smaller than the rest; those read as focal/status icons and are the ones
// worth keeping alive. Everything else settles and stays fully still, so the
// motion reads as "this specific thing is active" rather than everything
// jittering uniformly.
function selectLoopingParts(iconParts) {
  if (iconParts.length <= 1) return new Set();
  const areas = iconParts.map((p) => p.w * p.h);
  const sorted = [...areas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const loopIndices = new Set();
  areas.forEach((area, i) => {
    if (area < median * 0.55) loopIndices.add(i);
  });
  if (loopIndices.size === 0) {
    let smallest = 0;
    areas.forEach((area, i) => {
      if (area < areas[smallest]) smallest = i;
    });
    loopIndices.add(smallest);
  }
  return loopIndices;
}

// A clearly visible continuous loop (not a subtle wobble) for the parts
// selected above: a breathing scale pulse plus a gentle continuous rotation,
// each part on its own frequency/phase so multiple looping parts in the same
// illustration don't sync up.
function loopMotion(frame, seed) {
  const period = 46 + (seed % 3) * 10; // frames per pulse cycle, varied per part
  const phase = seed * 2.1;
  const t = (frame / period) * Math.PI * 2 + phase;
  return {
    scale: 1 + (Math.sin(t) * 0.5 + 0.5) * 0.1, // 1.0 -> 1.1 -> 1.0, never shrinks below entrance size
    rotate: Math.sin(t * 0.6) * 6,
  };
}

// Renders one of our grouped/vectorized illustrations with each `data-part`
// group animating in on its own staggered delay, instead of popping in as one
// flat image. Each part's motion direction and throw distance come from where
// it actually sits relative to the canvas center, so parts converge inward
// toward their final spot -- meaning every illustration's animation looks
// different, driven by its own layout. Once the entrance settles, most parts
// hold still, but the smaller "accent" parts (see selectLoopingParts) keep a
// clearly visible pulse/rotate loop going indefinitely, so the illustration
// stays visibly alive instead of freezing into a static picture.
export function AnimatedIllustration({ svg, stagger = 6, partDuration = 20 }) {
  const frame = useCurrentFrame();
  const clipId = useId();
  const { width, height, background, connectors, iconParts } = useMemo(
    () => parseIllustrationSvg(svg),
    [svg],
  );
  const loopingParts = useMemo(() => selectLoopingParts(iconParts), [iconParts]);

  const connectorStart = iconParts.length * stagger + 8;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", display: "block" }}>
      {background && <g dangerouslySetInnerHTML={{ __html: background.innerHTML }} />}

      {iconParts.map((part, index) => {
        const partStart = index * stagger;
        const progress = interpolate(
          frame,
          [partStart, partStart + partDuration],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
        );

        // Direction + throw distance: which way is this part offset from the
        // canvas center, and by how much (normalized, clamped so it stays subtle).
        const dx = part.cx - width / 2;
        const dy = part.cy - height / 2;
        const dominant = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        const distanceRatio = Math.min(
          1.5,
          Math.max(0.6, Math.hypot(dx, dy) / (Math.min(width, height) / 2 || 1)),
        );
        const throwDistance = 42 * distanceRatio;

        const entranceOffset = interpolate(progress, [0, 1], [throwDistance, 0]);
        const entranceX = dominant === "x" ? (dx < 0 ? -entranceOffset : entranceOffset) : 0;
        const entranceY = dominant === "y" ? (dy < 0 ? -entranceOffset : entranceOffset) : 0;

        // Small alternating rotation wobble and a slight scale overshoot give
        // each part a bit of snap instead of a flat linear settle.
        const rotateSign = index % 2 === 0 ? -1 : 1;
        const entranceRotate = interpolate(progress, [0, 1], [rotateSign * 5, 0]);
        const entranceScale = interpolate(progress, [0, 0.7, 1], [0.82, 1.045, 1]);

        // Only the selected accent parts keep moving after they settle;
        // everything else holds its final entrance position and stays put.
        let loopScale = 1;
        let loopRotate = 0;
        if (loopingParts.has(index)) {
          const loop = loopMotion(frame, index + 1);
          loopScale = interpolate(progress, [0, 1], [1, loop.scale]);
          loopRotate = loop.rotate * progress;
        }

        return (
          <g
            key={part.id}
            style={{
              opacity: interpolate(progress, [0, 0.6, 1], [0, 1, 1]),
              transformOrigin: `${part.cx}px ${part.cy}px`,
              transform: `translate(${entranceX}px, ${entranceY}px) rotate(${entranceRotate + loopRotate}deg) scale(${entranceScale * loopScale})`,
            }}
            dangerouslySetInnerHTML={{ __html: part.innerHTML }}
          />
        );
      })}

      {connectors && (
        <ConnectorReveal
          connectors={connectors}
          clipId={clipId}
          startFrame={connectorStart}
          duration={partDuration}
          frame={frame}
        />
      )}
    </svg>
  );
}

function ConnectorReveal({ connectors, clipId, startFrame, duration, frame }) {
  const progress = interpolate(frame, [startFrame, startFrame + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const clipX = connectors.cx - connectors.w / 2;
  const clipY = connectors.cy - connectors.h / 2;
  const clipWidth = interpolate(progress, [0, 1], [0, connectors.w]);

  return (
    <>
      <clipPath id={clipId}>
        <rect x={clipX - 4} y={clipY - 8} width={Math.max(clipWidth, 0)} height={connectors.h + 16} />
      </clipPath>
      <g
        clipPath={`url(#${clipId})`}
        style={{ opacity: interpolate(progress, [0, 0.15, 1], [0, 1, 1]) }}
        dangerouslySetInnerHTML={{ __html: connectors.innerHTML }}
      />
    </>
  );
}
