# BRAND — The visual system

The third editor skill, and the one that separates premium from pieced-together. Fifty animations that share one branding system read as a single expensive video. Fifty brilliant but mismatched animations read as a Fiverr collage. Alfred's job is to lock one system and obey it everywhere.

## Where the brand comes from

In priority order:

1. **The client's existing brand bible** (palette, logo, fonts) — if it exists, this is law. Read `avatar-bible-loader` / project knowledge first.
2. **The user's stated direction** — theme, palette, font, motion feel, reference links/images.
3. **Alfred's proposal** — if neither exists, propose a spec *derived from the client's existing brand* and get approval before building. Never invent an off-brand look.

If the user gives a vibe ("modern Apple style, light, orange accents") plus reference images, translate that into a concrete spec — don't leave it as adjectives.

## The branding spec (the deliverable)

Produce this as a `.docx` (Churlish format) and confirm it before any build.

### 1. Theme statement
One sentence describing the world the animations live in. E.g., "Clean editorial light theme — lots of white space, one warm accent, confident type, calm motion. Feels like a premium brand keynote, not a hype reel."

### 2. Color palette (with hex)
- **Background** — the dominant field (usually one color, light or dark; pick one and commit).
- **Primary / brand** — the client's main color.
- **Secondary** — supporting objects, rings, containers.
- **Accent** — the single punctuation color used sparingly for emphasis (numbers, the key word, the winning side of a comparison). One accent. Restraint is the whole point.
- **Text colors** — heading and body, with contrast that passes on the chosen background.

### 3. Type stack
- **Display / headline** font + weight (the big reveal type).
- **Body / label** font + weight.
- Case rules (e.g., headlines in caps, labels sentence case).
- Keep it to two families. Two families, used consistently, look designed; five look chaotic.

### 4. Motion rules
- **Pace** — calm and confident, or punchy and fast? Match the channel's energy.
- **Easing** — default easing curve (e.g., ease-out for reveals, spring for emphasis).
- **Entrances/exits** — the standard way things enter (fade-up, scale-in, draw-on) and leave (cut, fade). Pick defaults so every animation moves the same way.
- **Hold time** — how long an assembled visual sits before exit.

### 5. Recurring motifs
Any element that returns across the video (a logo bug, a section kicker style, the central framework graphic). Lock its look once.

### 6. Do / Don't
A short list that kills off-brand drift before it starts. E.g., "DON'T use more than one accent color in a single frame. DON'T mix font families within one animation. DO leave generous margins."

### 7. Reference board
Links/images the look is based on (Pinterest, the client's site, prior videos). Inspiration makes the direction unambiguous for whoever builds.

## On-screen copy

Any *text* that appears in an animation for a Churlish client follows **churlish-voice-guard** — same banned words, same voice. On-screen text should be tighter than spoken text: pull the 3–6 word core of the line, not the whole sentence. The viewer reads a fraction of what they hear.

## The consistency test

Before approving the spec, imagine animations #3, #27, and #51 side by side. If a stranger could tell they're from the same video without being told — the system holds. If they look like three different brands, tighten the spec until they don't.
