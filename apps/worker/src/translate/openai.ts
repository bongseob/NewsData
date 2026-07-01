interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface TranslateToKoreanOptions {
  fallbackToOriginal?: boolean;
}

export async function translateToKorean(
  text: string | null,
  options: TranslateToKoreanOptions = {}
): Promise<string | null> {
  if (!text) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (options.fallbackToOriginal) {
      console.warn("[Translate] OPENAI_API_KEY is not set. Saving original text.");
      return text;
    }
    throw new Error("OPENAI_API_KEY is not set.");
  }

  try {
    const model =
      process.env.OPENAI_TRANSLATION_MODEL ||
      process.env.TEXT_GENERATION_MODEL ||
      "gpt-4o-mini";
    const endpoint =
      process.env.OPENAI_CHAT_COMPLETIONS_URL ||
      "https://api.openai.com/v1/chat/completions";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a professional Korean translator for a news website. " +
              "Translate the user's text into natural, fluent Korean. " +
              "Preserve the original meaning, tone, paragraph breaks, and line breaks. " +
              "Do not add explanations, notes, or surrounding quotation marks. " +
              "Output only the translated Korean text. " +
              "If the text is already Korean, return it unchanged."
          },
          { role: "user", content: text }
        ]
      })
    });

    const payload = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) {
      throw new Error(
        payload.error?.message || `Translation failed with status ${res.status}`
      );
    }

    const translated = payload.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      throw new Error("OpenAI response did not include translated text.");
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
