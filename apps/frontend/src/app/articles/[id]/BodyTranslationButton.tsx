"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface BodyTranslationButtonProps {
  articleId: number;
  disabled?: boolean;
}

export function BodyTranslationButton({
  articleId,
  disabled = false
}: BodyTranslationButtonProps): JSX.Element {
  const router = useRouter();
  const [isTranslating, setIsTranslating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const translate = async () => {
    const confirmed = window.confirm(
      "DeepL 사용량이 차감됩니다. 본문을 번역할까요?"
    );
    if (!confirmed) return;

    setIsTranslating(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/translate-body`, {
        method: "POST"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`본문 번역 실패: ${errorText}`);
        return;
      }

      setMessage("본문 번역이 완료되었습니다.");
      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void translate()}
        disabled={disabled || isTranslating}
        className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isTranslating ? "본문 번역 중..." : "본문 번역하기"}
      </button>
      {message && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}
