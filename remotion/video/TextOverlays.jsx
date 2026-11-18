import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { annotationPosition, subtitleLines, displayCaptions, subtitleLayout } from '../shared/overlays.mjs';

export function SmallSubtitles({ cues = [], language, variant = 'zh', captionMode = 'voice', backplate = false }) {
  const frame = useCurrentFrame(), { width, height } = useVideoConfig();
  const cue = displayCaptions(cues).findLast(c => c.from <= frame && (c.until == null || frame < c.until));
  const lines = subtitleLines(cue, language, variant, captionMode);
  if (!lines.length) return null;
  const layout=subtitleLayout(lines,width,height);
  return <div data-subtitle style={{ position: 'absolute', left: layout.left, width: layout.width, bottom: layout.bottom,
    textAlign: 'center', color: '#fff', fontFamily: 'Microsoft YaHei, Arial, sans-serif',
    fontSize: layout.fontSize, fontWeight: 500, lineHeight: 1.3,
    textShadow: '0 1px 4px #000, 0 0 7px #000', WebkitTextStroke: `${height * .001}px rgba(0,0,0,.65)`,
    paintOrder: 'stroke fill', pointerEvents: 'none' }}>
    {layout.lines.map((line, i) => <div key={i} style={{ fontSize: line.size, whiteSpace:'pre' }}><span style={backplate?{background:'rgba(10,18,26,.86)',padding:'0.14em 0.4em',borderRadius:'.18em',textShadow:'none',WebkitTextStroke:0}:undefined}>{line.text}</span></div>)}
  </div>;
}

export function NodeAnnotations({ annotations = [] }) {
  const frame = useCurrentFrame(), { width, height, fps } = useVideoConfig(), time = frame / fps;
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {annotations.filter(a => a.from <= time && time < a.until).map((a, i) => {
      const anchor = annotationPosition(a, time);
      const x = Math.min(.85, Math.max(.15, anchor.x + (a.dx ?? .08)));
      const y = Math.min(.76, Math.max(.1, anchor.y + (a.dy ?? -.1)));
      const fade = Math.min(1, (time - a.from) / .22, (a.until - time) / .22);
      return <AbsoluteFill key={a.id || i} data-annotation style={{ opacity: fade }}>
        <svg width={width} height={height} style={{ position: 'absolute' }}>
          <line x1={anchor.x * width} y1={anchor.y * height} x2={x * width} y2={(y + .025) * height}
            stroke="#c1e9ee" strokeOpacity=".7" strokeWidth={height * .0015} />
          <circle cx={anchor.x * width} cy={anchor.y * height} r={height * .003} fill="#c1e9ee" />
        </svg>
        <div style={{ position: 'absolute', left: x * width, top: y * height, transform: 'translate(-50%, -50%)',
          whiteSpace: 'nowrap', padding: `${height * .004}px ${height * .009}px`, borderRadius: height * .006,
          background: 'rgba(6,17,30,.7)', color: '#d5f1f5', fontFamily: 'Microsoft YaHei, Arial, sans-serif',
          fontSize: height * .026, lineHeight: 1.4, fontWeight: 500 }}>{a.text}</div>
      </AbsoluteFill>;
    })}
  </AbsoluteFill>;
}
