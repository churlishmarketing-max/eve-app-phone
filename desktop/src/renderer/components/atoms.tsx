// Shared visual atoms — owning stream: S2.
//
// Every one of these is a thin wrapper over a class that already exists in
// src/styles/eve-desktop.css (the design law). They carry no layout opinions of
// their own: if a board wants different spacing it passes `style`. Kept in one
// file because each is 3-8 lines — RingCanvas, which owns a canvas and a rAF
// loop, lives on its own.

import type { CSSProperties, ReactNode } from "react";

/* ---- card ---------------------------------------------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

/* ---- eyebrow row: "▸ LABEL" left, dim right slot ------------------------- */

export function Eyeb({ left, right }: { left: string; right?: string }) {
  return (
    <div className="eyeb">
      <span>{left}</span>
      {right ? <span className="r">{right}</span> : null}
    </div>
  );
}

/* ---- section divider: mono label + hairline + right counter -------------- */

export function Divrow({ label, right }: { label: string; right?: string }) {
  return (
    <div className="divrow">
      <span className="l">{label}</span>
      <span className="rule" />
      {right ? <span className="r">{right}</span> : null}
    </div>
  );
}

/* ---- chip (.chipv6). `on` = pressed/latched, not hover ------------------- */

export function Chip({
  label,
  onClick,
  disabled,
  on,
  style,
  title,
}: {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  on?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`chipv6${on ? " on" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={title}
    >
      {label}
    </button>
  );
}

/* ---- small action button (.cbtn ok/gh) ----------------------------------- */

export function Cbtn({
  label,
  tone = "gh",
  onClick,
  disabled,
  title,
}: {
  label: ReactNode;
  tone?: "ok" | "gh";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={`cbtn ${tone}`} onClick={onClick} disabled={disabled} title={title}>
      {label}
    </button>
  );
}

/* ---- ops row ------------------------------------------------------------- */

export function OpRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="oprow" style={style}>
      {children}
    </div>
  );
}

/* ---- status chip (.stat run/gold/dim) ------------------------------------ */

export function StatLine({
  text,
  tone,
  style,
}: {
  text: string;
  tone: "run" | "gold" | "dim";
  style?: CSSProperties;
}) {
  return (
    <span className={`stat ${tone}`} style={style}>
      {text}
    </span>
  );
}

/* ---- TODAY'S THREE row --------------------------------------------------- */

export function T3Row({
  idx,
  title,
  right,
  due,
}: {
  idx: string;
  title: string;
  right: string;
  due?: boolean;
}) {
  return (
    <div className={`t3row${due ? " due" : ""}`}>
      <span className="idx">{idx}</span>
      <span className="tt">{title}</span>
      <span className={`tm${due ? " due" : ""}`}>{right}</span>
    </div>
  );
}
