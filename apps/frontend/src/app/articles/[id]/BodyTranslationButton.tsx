"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface BodyTranslationButtonProps {
  articleId: number;
  disabled?: boolean;
}

interface ArticleTranslationStatus {
  translated_body: string | null;
  body_translated_at: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function BodyTranslationButton({
  articleId,
  disabled = false
}: BodyTranslationButtonProps): JSX.Element {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const waitForTranslation = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);

      const res = await fetch(`${API_BASE}/articles/${articleId}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        continue;
      }

      const article = (await res.json()) as ArticleTranslationStatus;
      if (article.body_translated_at && article.translated_body) {
        return true;
      }
    }

    return false;
  };

  const translate = async () => {
    const confirmed = window.confirm(
      "DeepL 사용량이 차감됩니다. 본문 번역 작업을 등록할까요?"
    );
    if (!confirmed) return;

    setIsRequesting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/translate-body`, {
        method: "POST"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`본문 번역 요청 실패: ${errorText}`);
        return;
      }

      setMessage("본문 번역 작업을 등록했습니다. 완료 여부를 확인하는 중입니다.");

      const completed = await waitForTranslation();
      if (completed) {
        setMessage("본문 번역이 완료되었습니다.");
      } else {
        setMessage("본문 번역 작업을 등록했습니다. 아직 처리 중이면 잠시 후 새로고침해 주세요.");
      }

      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void translate()}
        disabled={disabled || isRequesting}
        className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRequesting ? "번역 요청 중..." : "본문 번역 요청"}
      </button>
      {message && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}
