import {segmentHitsBox} from '../shared/layout-geometry.mjs';

// SVG getPointAtLength jumps between M-separated subpaths without adding the
// jump to path length. Connecting those samples invents a non-existent stroke.
// A continuous local chord cannot be longer than the local arc-length step.
export function sampledStrokeHitsBox(from,to,localFrom,localTo,arcStep,box) {
  const chord=Math.hypot(localTo.x-localFrom.x,localTo.y-localFrom.y);
  if(chord<=arcStep*(1+1e-5)+.001)return segmentHitsBox(from,to,box);
  // The endpoints still contain ink, even when the intervening space does not.
  return segmentHitsBox(from,from,box)||segmentHitsBox(to,to,box);
}
