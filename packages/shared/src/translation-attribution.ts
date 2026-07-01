const TRANSLATION_NOTICE =
  "※ 이 기사는 원문 기사를 한국어로 번역한 기사입니다.";

const ORIGINAL_ARTICLE_LABEL = "원문 기사";

function stripExistingAttribution(body: string): string {
  const markerIndex = body.lastIndexOf(TRANSLATION_NOTICE);
  if (markerIndex === -1) {
    return body.trimEnd();
  }

  return body.slice(0, markerIndex).trimEnd();
}

export function appendTranslationAttribution(
  body: string,
  sourceUrl?: string | null
): string {
  const cleanBody = stripExistingAttribution(body);
  const cleanSourceUrl = sourceUrl?.trim();
  const footerLines = [TRANSLATION_NOTICE];

  if (cleanSourceUrl) {
    footerLines.push(`${ORIGINAL_ARTICLE_LABEL}: ${cleanSourceUrl}`);
  }

  return `${cleanBody}\n\n${footerLines.join("\n")}`;
}
