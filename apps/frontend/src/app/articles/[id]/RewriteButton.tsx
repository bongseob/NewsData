"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface RewriteButtonProps {
  articleId: number;
  disabled?: boolean;
}

interface ArticleRewriteStatus {
  rewritten_body: string | null;
  rewritten_at: string | null;
}

const POLL_INTERVAL_MS = 2000;
// 재작성은 OpenAI 생성이라 30초를 넘기기 쉽다. 넉넉히 대기(약 2분).
const MAX_POLL_ATTEMPTS = 60;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function RewriteButton({
  articleId,
  disabled = false
}: RewriteButtonProps): JSX.Element {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const waitForRewrite = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);

      const res = await fetch(`${API_BASE}/articles/${articleId}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        continue;
      }

      const article = (await res.json()) as ArticleRewriteStatus;
      if (article.rewritten_at && article.rewritten_body) {
        return true;
      }
    }

    return false;
  };

  const rewrite = async () => {
    const confirmed = window.confirm(
      "OpenAI 사용량이 차감됩니다. 번역 본문을 근거로 재작성 기사를 생성할까요?"
    );
    if (!confirmed) return;

    setIsRequesting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/rewrite`, {
        method: "POST"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`재작성 요청 실패: ${errorText}`);
        return;
      }

      setMessage("재작성 작업을 등록했습니다. 완료 여부를 확인하는 중입니다.");

      const completed = await waitForRewrite();
      if (completed) {
        setMessage("재작성 기사가 생성되었습니다. 아래 편집기에서 검토·수정하세요.");
      } else {
        setMessage("재작성 작업을 등록했습니다. 아직 처리 중이면 잠시 후 새로고침해 주세요.");
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
        onClick={() => void rewrite()}
        disabled={disabled || isRequesting}
        className="rounded-md border border-[#1167b1] px-4 py-2 text-sm font-semibold text-[#1167b1] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRequesting ? "재작성 중..." : "재작성 기사 생성"}
      </button>
      {message && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}
