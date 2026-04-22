"use client";

import React, { useRef } from "react";
import Link from "next/link";

type TopNavCurrent = "main" | "dream";

export default function TopNav({
  current,
  titleValue,
  mottoValue,
  onChangeTitle,
  onChangeMotto,
  titleReadOnly = false,
  mottoReadOnly = false,
  sidebarToggle,
  children,
}: {
  current: TopNavCurrent;
  titleValue: string;
  mottoValue: string;
  onChangeTitle: (v: string) => void;
  onChangeMotto: (v: string) => void;
  titleReadOnly?: boolean;
  mottoReadOnly?: boolean;
  sidebarToggle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const onStyle = { background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.26)" } as const;
  const composingRef = useRef(false);

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {sidebarToggle}
        <div className="psv-brand">
          <input
            className="psv-titleText psv-titleInput"
            value={titleValue}
            readOnly={titleReadOnly}
            onChange={(e) => { if (!composingRef.current) onChangeTitle(e.target.value); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(e) => { composingRef.current = false; onChangeTitle((e.target as HTMLInputElement).value); }}
            aria-label="App title"
            style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.03em" }}
          />
          <input
            className="psv-subText psv-titleInput"
            value={mottoValue}
            readOnly={mottoReadOnly}
            onChange={(e) => { if (!composingRef.current) onChangeMotto(e.target.value); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(e) => { composingRef.current = false; onChangeMotto((e.target as HTMLInputElement).value); }}
            placeholder="좌우명 / 오늘 한 줄 메모"
            style={{ fontSize: 12, lineHeight: 1.3 }}
          />
        </div>
      </div>
      <div className="topActions">
        <Link className="iconBtn" href="/" title="Home" style={current === "main" ? onStyle : {}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        {children}
      </div>
    </div>
  );
}
