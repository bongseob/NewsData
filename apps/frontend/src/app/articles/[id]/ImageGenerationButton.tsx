"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface ImageGenerationButtonProps {
  articleId: number;
  currentThumbnailLocalPath?: string | null;
}

interface ArticleImageStatus {
  thumbnail_local_path?: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function ImageGenerationButton({
  articleId,
  currentThumbnailLocalPath = null
}: ImageGenerationButtonProps): JSX.Element {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const waitForGeneratedImage = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);

      const res = await fetch(`${API_BASE}/articles/${articleId}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        continue;
      }

      const article = (await res.json()) as ArticleImageStatus;
      const nextThumbnail = article.thumbnail_local_path ?? null;
      if (nextThumbnail && nextThumbnail !== currentThumbnailLocalPath) {
        return true;
      }
    }

    return false;
  };

  const requestGeneration = async () => {
    const confirmed = window.confirm(
      "기존 이미지의 저작권 리스크가 있을 때 사용할 대체 이미지를 생성합니다. 생성 작업을 등록할까요?"
    );
    if (!confirmed) return;

    setIsRequesting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}/generate-image`, {
        method: "POST"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`이미지 생성 요청 실패: ${errorText}`);
        return;
      }

      setMessage("대체 이미지 생성 작업을 등록했습니다. 완료 여부를 확인하는 중입니다.");

      const completed = await waitForGeneratedImage();
      if (completed) {
        setMessage("대체 이미지 생성이 완료되었습니다.");
      } else {
        setMessage("대체 이미지 생성 작업을 등록했습니다. 아직 처리 중이면 잠시 후 새로고침해 주세요.");
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
        onClick={() => void requestGeneration()}
        disabled={isRequesting}
        className="rounded-md border border-[#1167b1] bg-white px-4 py-2 text-sm font-semibold text-[#1167b1] shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRequesting ? "이미지 생성 요청 중..." : "저작권 대체 이미지 생성"}
      </button>
      {message && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}
