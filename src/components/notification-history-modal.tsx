"use client";

import {
  formatNotificationReadAt,
  loadNotificationHistory,
  type UserNotificationHistoryEntry,
} from "@/src/lib/user-notification-inbox";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  refreshKey?: number;
};

export function NotificationHistoryModal({
  open,
  onClose,
  userId,
  refreshKey = 0,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<UserNotificationHistoryEntry[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !userId.trim()) return;
    setHistory(loadNotificationHistory(userId));
  }, [open, userId, refreshKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-slate-300/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            <h2 id={titleId} className="truncate text-base font-semibold text-slate-900">
              알람 이력
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {history.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-slate-500">
              읽은 알림 이력이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((row) => (
                <li key={`${row.id}:${row.readAt}`}>
                  <Link
                    href={row.href}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-sky-200 hover:bg-sky-50/50"
                    onClick={onClose}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {row.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                          {row.subtitle}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                            {row.kind === "performance" ? "실적" : "VOC"}
                          </span>
                          <span>{formatNotificationReadAt(row.readAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
