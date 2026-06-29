"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "../../../lib/api-base";

interface TranslationEditorProps {
  articleId: number;
  initialTitle: string;
  initialSubtitle: string;
  initialBody: string;
}

export function TranslationEditor({
  articleId,
  initialTitle,
  initialSubtitle,
  initialBody
}: TranslationEditorProps): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
          translatedBody: body
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
          번역 제목
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm font-normal text-ink-900"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          번역 부제목
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm font-normal text-ink-900"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-500">
          번역 본문
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
