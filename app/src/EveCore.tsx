// Ported verbatim from the approved demo. The state-reactive entity: rings,
// core, listening ripples, thinking ring, speaking waveform. Mode drives which
// animations run via the eve-<mode> class.

export type EveMode = "idle" | "listening" | "thinking" | "speaking" | "alert";

export function EveCore({
  mode,
  size = 230,
  glow = ["#1CB9C8", "#007A87"],
}: {
  mode: EveMode;
  size?: number;
  glow?: [string, string] | string[];
}) {
  return (
    <div className="glitchwrap">
      <svg
        className={`eve-ent eve-${mode}`}
        width={size}
        height={size}
        viewBox="0 0 240 240"
        role="img"
        aria-label={`EVE — ${mode}`}
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor={glow[0]} stopOpacity="0.95" />
            <stop offset="45%" stopColor={glow[1]} stopOpacity="0.5" />
            <stop offset="100%" stopColor={glow[1]} stopOpacity="0" />
          </radialGradient>
          <clipPath id="coreClip">
            <circle cx="120" cy="120" r="52" />
          </clipPath>
        </defs>

        {/* orbit rings */}
        <circle className="st ring-slow" cx="120" cy="120" r="102" fill="none"
          strokeWidth="1" strokeDasharray="2 7" opacity="0.5" />
        <circle className="st ring-rev" cx="120" cy="120" r="86" fill="none"
          strokeWidth="1.4" strokeDasharray="110 70" opacity="0.55" strokeLinecap="round" />
        <circle className="st-hi think-ring" cx="120" cy="120" r="66" fill="none"
          strokeWidth="1.6" strokeDasharray="12 16" strokeLinecap="round" />

        {/* listening ripples */}
        <circle className="st-hi rip" cx="120" cy="120" r="58" fill="none" strokeWidth="1.2" />
        <circle className="st-hi rip rip2" cx="120" cy="120" r="58" fill="none" strokeWidth="1.2" />

        {/* core */}
        <g className="core">
          <circle cx="120" cy="120" r="52" fill="url(#coreGlow)" />
          <circle className="coreflash" cx="120" cy="120" r="52" fill="#C41E3A" />
          <circle className="st-hi" cx="120" cy="120" r="57" fill="none" strokeWidth="1" opacity="0.65" />
          <g clipPath="url(#coreClip)">
            <line className="st-hi scan" x1="70" y1="120" x2="170" y2="120" strokeWidth="1.4" />
          </g>
        </g>

        {/* speaking waveform */}
        <g className="bars" fill="#F0EDE8" opacity="0.9">
          <rect x="98" y="104" width="4" height="32" rx="2" />
          <rect x="108" y="104" width="4" height="32" rx="2" />
          <rect x="118" y="104" width="4" height="32" rx="2" />
          <rect x="128" y="104" width="4" height="32" rx="2" />
          <rect x="138" y="104" width="4" height="32" rx="2" />
        </g>
      </svg>
    </div>
  );
}
