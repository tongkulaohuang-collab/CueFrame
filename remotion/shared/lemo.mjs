import catalog from './lemo-styles.json' with {type:'json'};

export const lemoStyles = catalog;
export const lemoRepo = 'https://github.com/lemomo-ai/lemo-opuscar';
const revision = 'bebbbe1aa92a3cb4bb6f83500e61b23a17d1aa00';
const byId = new Map(catalog.map(style => [style.slug, style]));

export function lemoStyle(id) {
  return byId.get(id);
}

export function lemoLinks(style) {
  return {
    poster: '/lemo/'+style.slug+'.jpg',
    preview: 'https://lemomo-ai.github.io/lemo-opuscar-films/'+style.slug+'.mp4',
    full: lemoRepo+'/releases/download/films/'+style.slug+'.mp4',
    guide: lemoRepo+'/blob/'+revision+'/styles/'+style.slug+'/STYLE.md',
  };
}

export function hasVisualReference(flow) {
  return Boolean(lemoStyle(flow?.lemoStyleId) || (flow?.style?.trim() && flow?.template?.trim()));
}

export function lemoReference(flow) {
  const style = lemoStyle(flow?.lemoStyleId);
  if (!style) return undefined;
  const links = lemoLinks(style);
  return {name:style.cn, englishName:style.en, visualDirection:style.guide,
    sampleTitle:style.film, sampleUrl:links.preview, styleSource:links.guide};
}
