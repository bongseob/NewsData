import axios from "axios";

export interface TranslateToKoreanOptions {
  fallbackToOriginal?: boolean;
}

export async function translateToKorean(
  text: string | null,
  options: TranslateToKoreanOptions = {}
): Promise<string | null> {
  if (!text) return null;

  const deeplApiKey = process.env.DEEPL_API_KEY;
  if (!deeplApiKey) {
    if (options.fallbackToOriginal) {
      console.warn("[Translate] DEEPL_API_KEY is not set. Saving original text.");
      return text;
    }
    throw new Error("DEEPL_API_KEY is not set.");
  }

  try {
    const isPro = !deeplApiKey.endsWith(":fx");
    const apiUrl = isPro
      ? "https://api.deepl.com/v2/translate"
      : "https://api-free.deepl.com/v2/translate";

    const response = await axios.post(
      apiUrl,
      { text: [text], target_lang: "KO" },
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const translated = response.data?.translations?.[0]?.text;
    if (!translated) {
      throw new Error("DeepL response did not include translated text.");
    }

    return translated;
  } catch (error) {
    if (options.fallbackToOriginal) {
      console.error(
        "[Translate] Translation failed, returning original:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return text;
    }
    throw error;
  }
}
