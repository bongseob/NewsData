"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/api-base";

interface SourceConfig {
  id: number;
  source: string;
  name: string;
  enabled: number;
  auto_fetch_enabled: number;
  auto_publish_enabled: number;
  fetch_interval_minutes: number | null;
  query: unknown | null;
  created_at: string;
  updated_at: string;
}

const sourceLabels: Record<string, string> = {
  NEWSDATA: "NewsData.io"
};

export function SourceConfigManager() {
  const [configs, setConfigs] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // ── Form state ──
  const [formSource, setFormSource] = useState("NEWSDATA");
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formAutoFetch, setFormAutoFetch] = useState(false);
  const [formAutoPublish, setFormAutoPublish] = useState(false);
  const [formInterval, setFormInterval] = useState<string>("");
  const [formQuery, setFormQuery] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/source-configs`, { cache: "no-store" });
      if (res.ok) {
        setConfigs(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const resetForm = () => {
    setFormSource("NEWSDATA");
    setFormName("");
    setFormEnabled(true);
    setFormAutoFetch(false);
    setFormAutoPublish(false);
    setFormInterval("");
    setFormQuery("{}");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert("설정 이름을 입력하세요.");
      return;
    }

    let queryObj: Record<string, unknown> | null = null;
    if (formQuery.trim()) {
      try {
        queryObj = JSON.parse(formQuery);
      } catch {
        alert("Query JSON 형식이 올바르지 않습니다.");
        return;
      }
    }

    setSaving(true);

    const payload = {
      source: formSource,
      name: formName.trim(),
      enabled: formEnabled,
      autoFetchEnabled: formAutoFetch,
      autoPublishEnabled: formAutoPublish,
      fetchIntervalMinutes: formInterval ? Number(formInterval) : null,
      query: queryObj
    };

    try {
      if (editingId) {
        const res = await fetch(`${API_BASE}/source-configs/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          alert("수정 실패");
          return;
        }
      } else {
        const res = await fetch(`${API_BASE}/source-configs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const msg = await res.text();
          alert(`생성 실패: ${msg}`);
          return;
        }
      }

      resetForm();
      setShowForm(false);
      await fetchConfigs();
    } catch {
      alert("서버 연결 오류");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: SourceConfig) => {
    setEditingId(config.id);
    setFormSource(config.source);
    setFormName(config.name);
    setFormEnabled(!!config.enabled);
    setFormAutoFetch(!!config.auto_fetch_enabled);
    setFormAutoPublish(!!config.auto_publish_enabled);
    setFormInterval(
      config.fetch_interval_minutes ? String(config.fetch_interval_minutes) : ""
    );
    setFormQuery(
      config.query ? JSON.stringify(config.query, null, 2) : "{}"
    );
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 설정을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${API_BASE}/source-configs/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchConfigs();
      } else {
        alert("삭제 실패");
      }
    } catch {
      alert("서버 연결 오류");
    }
  };

  const handleToggle = async (
    config: SourceConfig,
    field: "enabled" | "auto_fetch_enabled" | "auto_publish_enabled"
  ) => {
    const newValue = !config[field];
    const body: Record<string, unknown> = {};
    if (field === "enabled") body.enabled = newValue;
    if (field === "auto_fetch_enabled") body.autoFetchEnabled = newValue;
    if (field === "auto_publish_enabled") body.autoPublishEnabled = newValue;

    try {
      const res = await fetch(`${API_BASE}/source-configs/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        await fetchConfigs();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header + Add button ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          총 {configs.length}개 설정
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b]"
          >
            + 새 설정 추가
          </button>
        )}
      </div>

      {/* ── Form ── */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-line bg-white p-6 shadow-panel"
        >
          <h3 className="mb-4 text-base font-bold">
            {editingId ? "설정 수정" : "새 수집 설정"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Source */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-500">
                출처 (Source)
              </label>
              <select
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                disabled={!!editingId}
                className="w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-slate-50"
              >
                <option value="NEWSDATA">NewsData.io</option>
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-500">
                설정 이름
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 뉴스-IT-한국어"
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            {/* Interval */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-500">
                수집 주기 (분)
              </label>
              <input
                type="number"
                value={formInterval}
                onChange={(e) => setFormInterval(e.target.value)}
                placeholder="예: 10"
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">활성화</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formAutoFetch}
                  onChange={(e) => setFormAutoFetch(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">자동 수집</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formAutoPublish}
                  onChange={(e) => setFormAutoPublish(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">자동 발행</span>
              </label>
            </div>

            {/* Query JSON */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-500">
                Query (JSON)
              </label>
              <textarea
                value={formQuery}
                onChange={(e) => setFormQuery(e.target.value)}
                rows={5}
                placeholder='{"q":"technology","language":"ko","category":"technology"}'
                className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-slate-400">
                NewsData.io: q, category, language 등. 뉴스와이어: 사용 안 함.
              </p>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e5a9b] disabled:opacity-50"
            >
              {saving ? "저장 중..." : editingId ? "수정" : "추가"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* ── Config list ── */}
      {loading ? (
        <div className="rounded-lg border border-line bg-white p-10 text-center text-sm text-ink-500 shadow-panel">
          로딩 중...
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-10 text-center text-sm text-ink-500 shadow-panel">
          수집 설정이 없습니다. &quot;새 설정 추가&quot; 버튼을 눌러 생성하세요.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-3 font-semibold">출처</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">활성화</th>
                <th className="px-4 py-3 font-semibold">자동 수집</th>
                <th className="px-4 py-3 font-semibold">자동 발행</th>
                <th className="px-4 py-3 font-semibold">주기(분)</th>
                <th className="px-4 py-3 text-right font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {configs.map((config) => (
                <tr key={config.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                      {sourceLabels[config.source] ?? config.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{config.name}</td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!config.enabled}
                      onChange={() => handleToggle(config, "enabled")}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!config.auto_fetch_enabled}
                      onChange={() => handleToggle(config, "auto_fetch_enabled")}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!config.auto_publish_enabled}
                      onChange={() => handleToggle(config, "auto_publish_enabled")}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {config.fetch_interval_minutes ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleEdit(config)}
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(config.id)}
                      className="ml-1.5 rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
