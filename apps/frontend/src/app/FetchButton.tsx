"use client";
import { useState } from "react";

export function FetchButton() {
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:4000/jobs/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "NEWSDATA" }),
      });
      if (res.ok) {
        alert("수집 작업이 큐에 등록되었습니다!");
        window.location.reload();
      } else {
        alert("수집 요청 실패");
      }
    } catch (e) {
      alert("서버 연결 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleFetch}
      disabled={loading}
      className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:opacity-50"
      type="button"
    >
      {loading ? "수집 요청 중..." : "수동 수집"}
    </button>
  );
}
