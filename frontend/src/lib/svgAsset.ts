export interface SvgAsset {
  viewBox: string;
  innerMarkup: string;
}

export function parseSvgAsset(markup: string): SvgAsset {
  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 48 48';
  const innerMarkup = markup
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/ fill="[^"]*"/g, '')
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();

  return { viewBox, innerMarkup };
}
