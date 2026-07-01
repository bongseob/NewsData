"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface TranslationEditorProps {
  articleId: number;
  initialTitle: string;
  initialSubtitle: string;
  initialBody: string;
  initialKeywords: string[];
}

export function TranslationEditor({
  articleId,
  initialTitle,
  initialSubtitle,
  initialBody,
  initialKeywords
}: TranslationEditorProps): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [body, setBody] = useState(initialBody);
  const [keywords, setKeywords] = useState(initialKeywords.join(", "));
  const [subtitleSuggestions, setSubtitleSuggestions] = useState<string[]>([]);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingSubtitle, setGeneratingSubtitle] = useState(false);
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setSubtitle(initialSubtitle);
    setBody(initialBody);
    setKeywords(initialKeywords.join(", "));
  }, [initialTitle, initialSubtitle, initialBody, initialKeywords]);

  const parseKeywords = (): string[] =>
    keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .slice(0, 20);

  const copyText = async (label: string, value: string) => {
    const text = value.trim();
    if (!text) {
      setMessage(`${label} 복사할 내용이 없습니다.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} 클립보드에 복사했습니다.`);
    } catch {
      setMessage("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  const waitForSuggestions = async (
    jobId: string
  ): Promise<string[] | null> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      const res = await fetch(
        `${API_BASE}/articles/${articleId}/generate-content/${jobId}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        continue;
      }

      const status = (await res.json()) as {
        status: string;
        suggestions: string[] | null;
        failedReason: string | null;
      };
      if (status.status === "completed" && status.suggestions) {
        return status.suggestions;
      }
      if (status.status === "failed") {
        setMessage(`생성 실패: ${status.failedReason ?? "알 수 없는 오류"}`);
        return null;
      }
    }

    setMessage("생성 작업이 아직 처리 중입니다. 잠시 후 다시 확인해 주세요.");
    return null;
  };

  const generateContent = async (target: "subtitle" | "keywords") => {
    const isSubtitle = target === "subtitle";
    if (isSubtitle) {
      setGeneratingSubtitle(true);
      setSubtitleSuggestions([]);
    } else {
      setGeneratingKeywords(true);
      setKeywordSuggestions([]);
    }
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });

      if (!res.ok) {
        const text = await res.text();
        setMessage(`생성 요청 실패: ${text}`);
        return;
      }

      const data = (await res.json()) as { queueJobId?: string };
      if (!data.queueJobId) {
        setMessage("생성 작업 id가 응답에 없습니다.");
        return;
      }

      setMessage("생성 작업을 등록했습니다. 결과를 확인하는 중입니다.");
      const suggestions = await waitForSuggestions(data.queueJobId);
      if (!suggestions) return;

      if (isSubtitle) {
        setSubtitleSuggestions(suggestions);
      } else {
        setKeywordSuggestions(suggestions);
        setKeywords(suggestions.join(", "));
      }
      setMessage("생성 결과가 준비되었습니다.");
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setGeneratingSubtitle(false);
      setGeneratingKeywords(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/translations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translatedTitle: title,
          translatedSubtitle: subtitle,
          translatedBody: body,
          keywords: parseKeywords()
        })
      });

      if (!res.ok) {
        const text = await res.text();
        setMessage(`저장 실패: ${text}`);
        return;
      }

      setMessage("번역문을 저장했습니다.");
      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const copyButtonClass =
    "rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-50";

  return (
    <section className="mt-6 rounded-md border border-line p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">번역문 편집</h3>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-[#1167b1] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중..." : "번역문 저장"}
        </button>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          <span className="flex items-center justify-between gap-2">
            번역 제목
            <button
              type="button"
              onClick={() => void copyText("번역 제목을", title)}
              className={copyButtonClass}
            >
              복사
            </button>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm font-normal text-ink-900"
          />
        </label>

        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          <span className="flex items-center justify-between gap-2">
            번역 부제목
            <button
              type="button"
              onClick={() => void copyText("번역 부제목을", subtitle)}
              className={copyButtonClass}
            >
              복사
            </button>
          </span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm font-normal text-ink-900"
          />
        </label>

        {!initialSubtitle && (
          <div className="grid gap-2 rounded-md border border-dashed border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-500">
                번역 부제목 후보
              </span>
              <button
                type="button"
                onClick={() => void generateContent("subtitle")}
                disabled={generatingSubtitle}
                className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingSubtitle ? "생성 중..." : "부제목 3개 생성"}
              </button>
            </div>
            {subtitleSuggestions.length > 0 && (
              <div className="grid gap-1">
                {subtitleSuggestions.map((suggestion) => (
                  <div
                    key={suggestion}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"
                  >
                    <span className="text-xs font-medium text-ink-700">
                      {suggestion}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setSubtitle(suggestion)}
                        className={copyButtonClass}
                      >
                        적용
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyText("부제목 후보를", suggestion)}
                        className={copyButtonClass}
                      >
                        복사
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          <span className="flex items-center justify-between gap-2">
            키워드
            <button
              type="button"
              onClick={() => void copyText("키워드를", keywords)}
              className={copyButtonClass}
            >
              복사
            </button>
          </span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="쉼표로 구분해 입력"
            className="rounded-md border border-line px-3 py-2 text-sm font-normal text-ink-900"
          />
        </label>

        {initialKeywords.length === 0 && (
          <div className="grid gap-2 rounded-md border border-dashed border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-500">
                키워드 후보
              </span>
              <div className="flex flex-wrap gap-1">
                {keywordSuggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void copyText("키워드 후보 전체를", keywordSuggestions.join(", "))
                    }
                    className={copyButtonClass}
                  >
                    후보 전체 복사
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void generateContent("keywords")}
                  disabled={generatingKeywords}
                  className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingKeywords ? "생성 중..." : "키워드 3개 생성"}
                </button>
              </div>
            </div>
            {keywordSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {keywordSuggestions.map((suggestion) => (
                  <span
                    key={suggestion}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-ink-700"
                  >
                    {suggestion}
                    <button
                      type="button"
                      onClick={() => setKeywords(suggestion)}
                      className="rounded-full bg-white px-1.5 py-0.5 font-semibold hover:bg-blue-50"
                    >
                      적용
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText("키워드 후보를", suggestion)}
                      className="rounded-full bg-white px-1.5 py-0.5 font-semibold hover:bg-blue-50"
                    >
                      복사
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          <span className="flex items-center justify-between gap-2">
            번역 본문
            <button
              type="button"
              onClick={() => void copyText("번역 본문을", body)}
              className={copyButtonClass}
            >
              복사
            </button>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="rounded-md border border-line px-3 py-2 text-sm font-normal leading-relaxed text-ink-900"
          />
        </label>
      </div>

      {message && (
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </section>
  );
}
