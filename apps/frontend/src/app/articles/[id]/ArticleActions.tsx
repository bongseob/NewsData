"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface ArticleActionsProps {
  articleId: number;
  status: string;
  reviewState: string;
}

interface ActionButton {
  label: string;
  confirm: string;
  endpoint: "review-state" | "mark-ready" | "unmark-ready";
  reviewState?: string;
  tone?: "primary" | "danger";
}

function buildActions(status: string, reviewState: string): ActionButton[] {
  if (status === "READY_TO_PUBLISH") {
    return [
      {
        label: "선별 단계로 되돌리기",
        confirm: "선별 단계(DRAFT)로 되돌릴까요?",
        endpoint: "unmark-ready"
      }
    ];
  }

  if (reviewState === "EXCLUDED") {
    return [
      {
        label: "복구 (미검토로)",
        confirm: "미검토 상태로 복구할까요?",
        endpoint: "review-state",
        reviewState: "PENDING"
      }
    ];
  }

  const actions: ActionButton[] = [];

  if (reviewState === "PENDING") {
    actions.push({
      label: "선별 채택",
      confirm: "번역·검토 대상으로 채택할까요?",
      endpoint: "review-state",
      reviewState: "SELECTED",
      tone: "primary"
    });
  }

  if (reviewState === "SELECTED") {
    actions.push({
      label: "최종 발행 대상 확정",
      confirm: "최종 발행 대상으로 확정할까요?",
      endpoint: "mark-ready",
      tone: "primary"
    });
  }

  actions.push({
    label: "제외",
    confirm: "제외(숨김)할까요?",
    endpoint: "review-state",
    reviewState: "EXCLUDED",
    tone: "danger"
  });

  return actions;
}

export function ArticleActions({
  articleId,
  status,
  reviewState
}: ArticleActionsProps): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const actions = buildActions(status, reviewState);

  const run = async (action: ActionButton) => {
    if (!window.confirm(action.confirm)) return;

    setBusy(true);
    setMessage(null);

    try {
      const endpoint = `${API_BASE}/articles/${action.endpoint}`;
      const payload =
        action.endpoint === "review-state"
          ? { ids: [articleId], reviewState: action.reviewState }
          : { ids: [articleId] };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        setMessage(`작업 실패: ${text}`);
        return;
      }

      setMessage("처리되었습니다.");
      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <h3 className="mb-3 text-sm font-bold">선별 작업</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={busy}
            onClick={() => void run(action)}
            className={`rounded-md px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              action.tone === "danger"
                ? "border border-line bg-white text-red-600 hover:bg-red-50"
                : "bg-[#1167b1] text-white hover:bg-[#0e5a9b]"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
      {message && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}
