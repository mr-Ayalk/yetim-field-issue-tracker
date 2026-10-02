"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain/constants";
import { useYetim } from "@/components/provider";

const LINKS = [
  { href: "/", label: "Dashboard", id: "nav-dashboard" },
  { href: "/reports", label: "Reports", id: "nav-reports" },
  { href: "/reports/new", label: "New report", id: "nav-new" },
  { href: "/sync", label: "Sync", id: "nav-sync" },
  { href: "/board", label: "Workbench", id: "nav-board" },
  { href: "/analytics", label: "Analytics", id: "nav-analytics" },
  { href: "/settings", label: "Settings", id: "nav-settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const yetim = useYetim();
  const [open, setOpen] = useState(false);
  const pending = yetim.outbox.filter((op) => op.status === "PENDING" || op.status === "FAILED" || op.status === "CONFLICT").length;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className={`${open ? "block" : "hidden"} border-b border-line bg-teal-deep text-paper md:block md:min-h-screen md:border-b-0`}>
        <div className="flex items-start justify-between px-5 py-6">
          <Link href="/" className="block" onClick={() => setOpen(false)}>
            <p className="font-[family-name:var(--font-ethiopic)] text-3xl font-bold leading-none">የትም</p>
            <p className="mt-2 text-sm tracking-[0.18em] text-sky uppercase">Yetim</p>
            <p className="mt-3 max-w-[14rem] text-sm text-sky/90">Report from anywhere.</p>
          </Link>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-6" aria-label="Primary">
          {LINKS.map((link) => {
            const active = path === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={link.id}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-white/15" : "hover:bg-white/10"}`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
                {link.href === "/sync" && pending > 0 ? <span className="ml-2 rounded-full bg-amber px-2 py-0.5 text-xs text-white">{pending}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-8">
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm md:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              Menu
            </button>
            <p className="font-[family-name:var(--font-ethiopic)] text-lg font-bold md:hidden">የትም</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-muted" htmlFor="role-switcher">
                Role
              </label>
              <select
                id="role-switcher"
                data-testid="role-switcher"
                className="rounded-lg border border-line bg-card px-2 py-2 text-sm"
                value={yetim.role}
                onChange={(event) => yetim.setRole(event.target.value as Role)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <span
                data-testid="connection-status"
                className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium"
                role="status"
              >
                {yetim.simulatedOffline ? "Simulated offline" : yetim.online ? "Online" : "Offline"}
              </span>
              {yetim.simulatedOffline ? (
                <button
                  type="button"
                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium"
                  onClick={() => yetim.setSimulatedOffline(false)}
                >
                  Use network
                </button>
              ) : null}
            </div>
          </div>
          {!yetim.online || yetim.simulatedOffline ? (
            <div className="bg-teal-deep px-4 py-2 text-sm text-paper md:px-8" role="status">
              You&apos;re offline. Yetim keeps working.
              {yetim.simulatedOffline ? <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">Simulated</span> : null}
            </div>
          ) : null}
          {yetim.notice ? (
            <div className={`px-4 py-2 text-sm md:px-8 ${yetim.notice.tone === "error" ? "bg-clay/10 text-clay" : "bg-ok/10 text-ok"}`} role="status">
              {yetim.notice.text}
              <button type="button" className="ml-3 underline" onClick={yetim.dismissNotice}>
                Dismiss
              </button>
            </div>
          ) : null}
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
