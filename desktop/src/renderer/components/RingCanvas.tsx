// The rail's waveform ring — owning stream: S2.
//
// A React reimplementation of design-reference/ring.js. The maths is copied
// spoke for spoke: 200x200 backing buffer displayed at 96x96, 64 spokes, base
// radius w*.30, amplitude (7 + sin(t*.0018 + i*.55)*5) * (w/200*1.3), alpha
// .28 + |s|*.62, 2.4px round caps, and the faint inner circle at base-6.
//
// One deliberate difference: ring.js falls back to its amber default when a
// canvas has no data-color. This surface is teal law (the fused M2 ruling), so
// the colour is #1CB9C8, always — the amber default is never reachable here.

import { useEffect, useRef } from "react";

const TEAL = "#1CB9C8";
const SPOKES = 64;

export default function RingCanvas({ size = 96, buffer = 200 }: { size?: number; buffer?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const w = c.width;
    const cx = w / 2;
    const base = w * 0.3;

    const draw = (t: number): void => {
      ctx.clearRect(0, 0, w, w);
      ctx.beginPath();
      ctx.arc(cx, cx, base - 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(240,237,232,.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2 - Math.PI / 2;
        const s = Math.sin(t * 0.0018 + i * 0.55);
        const amp = (7 + s * 5) * ((w / 200) * 1.3);
        ctx.strokeStyle = TEAL;
        ctx.globalAlpha = 0.28 + Math.abs(s) * 0.62;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * base, cx + Math.sin(a) * base);
        ctx.lineTo(cx + Math.cos(a) * (base + amp), cx + Math.sin(a) * (base + amp));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    // The OS said no motion: draw the ring once, at ring.js's own still frame.
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      draw(40000);
      return;
    }

    let raf = 0;
    const loop = (t: number): void => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [buffer]);

  return (
    <canvas
      ref={ref}
      className="fring"
      width={buffer}
      height={buffer}
      style={{ width: size, height: size }}
    />
  );
}
