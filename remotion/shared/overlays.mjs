const within = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;

export function overlayIssues(p, s) {
  const issues = [];
  if (s.annotations != null && (!Array.isArray(s.annotations) || s.annotations.length > 20))
    return ['关键节点注释需要列表，且每镜不超过 20 条'];
  for (const a of s.annotations || []) {
    if (!a || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 24 ||
        !within(a.from, 0, s.seconds) || !within(a.until, a.from + .1, s.seconds) ||
        !within(a.x, 0, 1) || !within(a.y, 0, .82) ||
        (a.dx != null && !within(a.dx, -.4, .4)) || (a.dy != null && !within(a.dy, -.4, .4)))
      issues.push('节点注释须为 24 字以内短语，有有效起止时间，并位于字幕区上方');
    if (a?.points != null && (!Array.isArray(a.points) || a.points.length > 4000 ||
        a.points.some((v, i) => !v || !within(v.time, 0, s.seconds) || !within(v.x, 0, 1) ||
          !within(v.y, 0, 1) || (i && v.time <= a.points[i - 1].time))))
      issues.push('节点注释的跟随轨迹无效');
  }
  for (const [lang, track] of Object.entries(s.subtitleTracks || {})) {
    const voice = p.assets.find(a => a.id === track?.assetId && s.assetIds.includes(a.id) && a.kind === 'audio' && a.role === lang);
    if (!['zh', 'en'].includes(lang) || !voice || track.text !== s[lang]) {
      issues.push('精确字幕对应的旁白或文字已变化，请重新对齐字幕');
      continue;
    }
    const segments = track.segments;
    if (!Array.isArray(segments) || !segments.length || segments.length > 2000 ||
        segments.some((c, i) => !c || typeof c.text !== 'string' || !c.text.trim() ||
          !within(c.from, 0, voice.duration) || !within(c.until, c.from + .01, voice.duration) ||
          (i && c.from < segments[i - 1].until)))
      issues.push('精确字幕需要按旁白时长递增、互不重叠的起止时间');
    else if (segments.map(c => c.text).join('').replace(/\s/g, '') !== track.text.replace(/\s/g, ''))
      issues.push('精确字幕内容须与对应旁白一致');
    for (const c of segments || []) {
      if (c.translation != null && (typeof c.translation !== 'string' || !c.translation.trim()))
        issues.push('字幕对照译文不能为空');
      if (c.display != null && (!Array.isArray(c.display) || !c.display.length || c.display.length > 30 ||
          c.display.some(v => !v || typeof v.text !== 'string' || !v.text.trim() || typeof v.translation !== 'string' || !v.translation.trim()) ||
          c.display.map(v => v.text).join('').replace(/\s/g, '') !== c.text.replace(/\s/g, '')))
        issues.push('字幕短句须完整保留这一句口播及对应译文');
    }
  }
  return issues;
}

export function annotationPosition(a, time) {
  const points = a.points || [];
  if (!points.length) return { x: a.x, y: a.y };
  const i = points.findIndex(p => p.time >= time);
  if (i < 0) return points.at(-1);
  if (!i) return points[0];
  const start = points[i - 1], end = points[i], t = (time - start.time) / (end.time - start.time);
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

export function subtitleLines(cue, language, variant, mode = 'voice') {
  if (!cue) return [];
  return mode === 'bilingual'
    ? [cue.zh, cue.en].filter(Boolean)
    : [cue[cue.lang || variant]].filter(Boolean);
}

// Display-only subdivision. The original measured speech windows continue to
// drive audio mixing and action timing; these are reading intervals, not ASR.
export function displayCaptions(cues = []) {
  return cues.flatMap(c => {
    if (!Number.isFinite(c.until)) return [c];
    const other=c.lang==='en'?'zh':'en';
    let pieces=c.display;
    if(!pieces?.length&&c.short) {
      const source=captionPhrases(c[c.lang]),translation=captionPhrases(c[other]);
      // Do not invent translations or pair unrelated sentence boundaries.
      if(source.length>1&&(!c.bilingual||!c[other]||source.length===translation.length))
        pieces=source.map((text,i)=>({text,translation:translation.length===source.length?translation[i]:undefined}));
    }
    if(!pieces?.length||c.until-c.from<pieces.length)return [c];
    const total = pieces.reduce((n,v) => n + v.text.trim().length, 0);
    let weight = 0;
    return pieces.map((v,i) => {
      const from = c.from + Math.round((c.until-c.from)*weight/total);
      weight += v.text.trim().length;
      const until = i === pieces.length-1 ? c.until : c.from + Math.round((c.until-c.from)*weight/total);
      const {display,short, ...base} = c;
      return {...base, from, until, [c.lang]:v.text.trim(), [other]:v.translation,
        displayTiming:'句内按阅读长度分配，非词级实测'};
    }).filter(v=>v.until>v.from);
  });
}

export function captionPhrases(text) {
  const source=String(text||'').trim();if(!source)return [];
  const parts=source.match(/[^。！？!?；;，,]+[。！？!?；;，,]*[”’"']?|[。！？!?；;，,]+/gu)||[source];
  return parts.flatMap(part=>{
    const chinese=/[\p{Script=Han}]/u.test(part),capacity=chinese?23:32;
    const lines=wrapSubtitle(part.trim(),capacity);
    // A hard line limit must not become a one-character subtitle flash.
    // Rebalance only the display chunks; measured speech windows stay intact.
    if(chinese&&lines.length>1&&textWidth(lines.at(-1))<5){
      const balanced=wrapSubtitle(part.trim(),Math.ceil(textWidth(part.trim())/lines.length));
      if(balanced.length===lines.length&&textWidth(balanced.at(-1))>textWidth(lines.at(-1)))return balanced;
    }
    return lines;
  }).filter(Boolean);
}
export function captionDisplayCues(cues,frames,mode) {
  return cues.map((c,i)=>({...c,until:c.until??cues[i+1]?.from??frames,short:true,bilingual:mode==='bilingual'}));
}

const textWidth = text => [...text].reduce((n,c)=>n+(/\s/u.test(c)?.32:c.codePointAt(0)>255?1:.6),0);
export function wrapSubtitle(text, capacity) {
  const tokens=String(text||'').match(/[\p{Script=Han}]|[^\S\r\n]+|[^\p{Script=Han}\s]+/gu)||[];
  const lines=[];let line='';
  for(const token of tokens) {
    if(line && textWidth(line+token)>capacity) {lines.push(line.trim());line='';}
    // Also protect against long unbroken tokens (URLs, very long words).
    for(const c of token) {
      if(line&&textWidth(line+c)>capacity){lines.push(line.trim());line='';}
      line+=c;
    }
  }
  if(line.trim())lines.push(line.trim());
  return lines;
}
export function subtitleLayout(lines,width,height) {
  const safeWidth=width*.84, bottom=height*.065, maxHeight=height*.19;
  let fontSize=Math.min(height*.03,width*.045), wrapped=[];
  do {
    wrapped=lines.flatMap((s,i)=>wrapSubtitle(s,safeWidth/(fontSize*(i?.9:1))).map(text=>({text,size:fontSize*(i?.9:1)})));
    if(wrapped.reduce((n,l)=>n+l.size*1.3,0)<=maxHeight)break;
    fontSize*=.92;
  }while(fontSize>height*.012);
  return {lines:wrapped,bottom,left:width*.08,width:safeWidth,fontSize,
    height:wrapped.reduce((n,l)=>n+l.size*1.3,0)};
}
