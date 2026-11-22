// Links a legal ground of the open data ("Art. 409, § 2º") to its article in the compiled text of
// LC 214/2025 on the Planalto site. The page anchors most articles as "art<N>", some amended ones
// as "art<N>.0", and gives none to the rest; this map was read from the page's DOM on the day in
// official.sources.ts. Without an anchor the link opens the law at the top, and the screen still
// prints the reference, so the reader searches for it there.

import { readOfficialSource } from "./official.sources.ts";

const VARIANT_ANCHORS: Record<number, string> = {
  28: "art28.0",
  33: "art33.0",
  71: "art71.0",
  146: "art146.0",
  156: "art156.0",
  197: "art197.0",
  212: "art212.0",
  233: "art233.0",
  260: "art260.0",
  472: "art472.0",
  484: "art484.0",
};

const UNANCHORED_RANGES: [number, number][] = [
  [270, 270],
  [366, 383],
  [385, 391],
  [393, 402],
  [404, 443],
  [445, 445],
  [476, 479],
  [487, 490],
];

const LAST_ARTICLE = 544;
const ARTICLE_NUMBER = /^Arts?\.?\s*(\d+)/i;

function linkLegalGround(shortReference: string) {
  const lawUrl = readOfficialSource("lc214").url;
  const article = readArticleNumber(shortReference);
  const anchor = article === null ? null : findArticleAnchor(article);
  const url = anchor ? `${lawUrl}#${anchor}` : lawUrl;
  return url;
}

function readArticleNumber(shortReference: string) {
  const match = ARTICLE_NUMBER.exec(shortReference.trim());
  const article = match?.[1] ? Number(match[1]) : null;
  return article;
}

function findArticleAnchor(article: number) {
  const isOutsideLaw = article < 1 || article > LAST_ARTICLE;
  const isUnanchored = UNANCHORED_RANGES.some(
    ([first, last]) => article >= first && article <= last,
  );

  if (isOutsideLaw || isUnanchored) {
    return null;
  }

  const anchor = VARIANT_ANCHORS[article] ?? `art${article}`;
  return anchor;
}

export { linkLegalGround };
