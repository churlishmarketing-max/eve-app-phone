# AI Image Prompt Writing — Starfire's Image Desk Doctrine

Distilled from Brandon's prompt library: the Ultimate Prompts Playbook (Seedream/Nano Banana structure), *Making Your Avatar More Realistic* (realism cue stack), *How to Write Prompts* (mini-brief method), the AI Genesis Face Anchor Master Prompt + LUNA templates (character consistency chain), and the vault-wide Churlish standards. When Starfire needs an AI-generated image for a post, she writes the prompt to this doctrine — she never freelances a vague prompt.

**Table of contents:** 1. The Prime Rules · 2. Prompt Anatomy · 3. The Realism Cue Stack · 4. Tool Routing · 5. Character Consistency (Face Anchor Chain) · 6. Copy-Paste Skeletons · 7. The Negative/Exclusion Stack · 8. QC Checklist Before an Image Enters the Approval Batch

---

## 1. The Prime Rules (non-negotiable, vault-wide)

1. **Authenticity realism is law.** Every prompt for a human subject carries explicit anti-smoothing cues: visible pores, skin micro-details, natural imperfections, faint blemishes/freckles, vellus hairs, fabric grain. AI defaults to plastic skin unless told otherwise — telling it otherwise is Starfire's job every single time.
2. **Specificity beats length.** A strong prompt is a mini-brief written as one flowing paragraph with clear hierarchy: what it is → how it looks → how it's shot → where it lives → what energy it carries. Named brands, exact lens/aperture, lighting temperature (e.g., 5800K), and granular environment detail consistently outperform general descriptions.
3. **Ethnic feature lock requires intentional redundancy.** For characters with specific heritage (e.g., Cam Nakamura), the feature lock line appears in EVERY prompt in a session — not just the anchor. One omission = model drift.
4. **No real public figures. Ever.** If a reference image or request includes a recognizable individual, hard pivot: flag it and build/use a fully original character from described attributes only. No celebrity lookalikes, no "in the style of [real person]'s face."
5. **Character prompts come from the bible.** Mari, Khari, Cam (and any future roster member) have `.docx` character bibles with locked physical specs, wardrobe, and anchor chains. Starfire pulls the character's anchor language from the bible — she never re-describes an established character from memory.
6. **The approval gate applies to AI images exactly like Canva designs.** Generated image → thumbnail into the Approval Batch → Brandon signs → then it ships. An AI image is an ASSET in the inbox format, nothing more exempt.
7. **Design law still governs brand graphics.** If the AI image carries Churlish brand elements: red #C41E3A once per composition max, teal #007A87 workhorse, cream #F0EDE8. Client accounts follow the client's brand kit.

---

## 2. Prompt Anatomy — the five-block structure

Every image prompt is built from these blocks, combined into one flowing paragraph (Seedream-style) or clearly labeled sections (Genesis/casting-style):

1. **Main subject** — what the image is about, stated first and unambiguously. "A 28-year-old Afro-Latina fitness creator mid-workout" beats "a woman exercising."
2. **Visual modifiers** — texture, lighting, mood, color. "Golden-hour sidelight, sweat sheen on skin, muted earthy palette, editorial warmth."
3. **Composition details** — camera angle, distance, lens, orientation. "Shot on an 85mm portrait lens at f/2, eye-level, vertical 4:5, subject on the right third with negative space left for caption text."
4. **Context / environment** — the grounding scene. "A sunlit home gym with rubber flooring, a fiddle-leaf fig by the window, chalk dust in the air."
5. **Output tone / stylistic identity** — the energy. "Raw UGC iPhone aesthetic" vs. "high-end campaign editorial, ultra-sharp, hyperreal."

The strength of the output is not in length — it's in **clarity, specificity, and hierarchy**. Structure the prompt so the model reads intent, not chance.

**The mini-brief check** before writing: What's the purpose (which post, which platform, which slot)? What role should the "camera" play (documentary, studio, phone)? What format (aspect ratio per platform: 4:5 IG feed, 9:16 story/reel cover, 1.91:1 LinkedIn/FB link, 1:1 square)? What tone? What constraints (text-safe negative space, brand colors, character lock)?

---

## 3. The Realism Cue Stack — eight layers, every human-subject prompt

Realism comes from prompting, not from better tools. Layer these:

**① Core photorealism triggers** (include 2–3 minimum): photorealistic · ultra-realistic · real-world photography · cinematic realism · lifelike details · natural imperfections · true-to-life textures · realistic skin/materials.

**② Camera & lens language** (this makes or breaks it — it tells the model this is a *photo*): DSLR/mirrorless photography · cinematic film still · documentary-style · studio portrait. Lenses: 35mm (most natural realism), 50mm (human-eye look), 85mm (faces/portraits), shallow depth of field, natural bokeh. For casting digitals: 70–85mm at f/8, everything sharp, ISO 100.

**③ Lighting words** (real-world terms only): natural light · soft window light · golden hour · overcast daylight · practical lighting · studio softbox · subtle rim light · realistic shadows. "Soft natural daylight with realistic shadows" is the workhorse phrase — daylight exposes the imperfections that sell realism. Avoid fantasy lighting (neon glow, magical light) unless deliberately stylized. For the raw-flash look: direct on-camera flash, 5800K, shadows falling directly behind subject, slightly hot highlights on forehead/nose/cheeks.

**④ Texture & detail words** (the anti-plastic layer): visible pores · skin micro-details · high-detail textures · fabric grain · dust, scratches, wear · slight imperfections · tactile materials. For characters: healing blemishes, tan lines, natural teeth, character-specific marks per the bible.

**⑤ Color & tone restraint** (realism = restraint): natural color grading · muted tones · earthy palette · cinematic color balance · realistic contrast · soft highlights, deep shadows. Never hyper-saturated, neon, or cartoon color language.

**⑥ Composition words** (think like a photographer): rule of thirds · eye-level shot · candid moment · unstaged composition · natural framing · foreground/background separation.

**⑦ Grain & image quality** (the final 10%): subtle film grain · sensor noise in the shadows · sharp focus · clean but not overly polished · highlights roll off smoothly, blacks retain detail.

**⑧ Negatives** (see Section 7) — protect the realism you built.

---

## 4. Tool Routing — which engine gets the prompt

| Engine | Send it when | Notes |
|---|---|---|
| **Nanobanana PRO** | UGC avatars, lifestyle imagery, anything needing legible in-image text; feature-level EDITS on an existing image | Best model for realistic avatars. Edit mode = surgical directives on a base image: "change the dress fabric to matte satin," "replace the background with pale stone," "soften white highlights." Transformations, not regeneration. |
| **Seedream** | Cinematic skin/lighting, editorial-quality renders, ethnic feature retention | Holds Cam's heritage features more reliably than other tools. One flowing paragraph, five-block structure. |
| **GPT Image 2.0** | Hyper-detailed lifestyle, scene, and product shots with named brands | Feed it granular environmental detail and brand names. |
| **Higgsfield** (connected MCP) | In-chat generation, Soul Character video from trained reference photos, Marketing Studio ads from a product URL | The live pipe — Starfire can generate here directly. Character video runs through the trained Soul Character, never a fresh face. |

If the target engine isn't stated, Starfire routes by this table and names the routing in the approval item ("Prompt written for Nanobanana PRO — in-image text required").

---

## 5. Character Consistency — the Face Anchor Chain

For roster characters (Mari, Khari, Cam) and any new synthetic character, consistency comes from the **AI Genesis chain**: headshot → portrait → mid shot → full body → Higgsfield Soul Character video. Each step uses ALL previous outputs as identity references.

**Anchor-referencing language (use verbatim structure):** "Generate ONE SINGLE standalone ultra-realistic image using the attached face anchor [+ portrait anchor, + mid shot] as the absolute reference for identity likeness. Maintain 1:1 fidelity for all facial geometry, bone structure, face shape, jawline, cheekbones, nose shape, lips shape and size, eye shape/hue, and skin tone/texture. Transfer every scar, freckle, and mole exactly. Skin complexion must be seamless across face, neck, and body. Logically extrapolate skeletal cues (neck, shoulders, build) from the anchors for precise character consistency."

**The casting-digital spec** (the neutral baseline every anchor is shot against):
- Framing: straight-on, shoulders square, zero cropping of skull (or hands/feet at wider framings), slightly-below-eye-level camera, subject 6–10 ft from background.
- Lighting: massive diffused frontal window source, 100% even, zero harshness, bright rectangular window catchlights, plus background light for even seamless coverage. (Alt: on-camera flash spec from §3③.)
- Background: bright light-grey seamless paper, #F7F7F7 — no texture, gradient, props, or room corners.
- Color: neutral daylight 5800K, no stylized grade, no film filters/halation/flares/bokeh.
- Camera: full-frame DSLR look, 70–85mm equivalent, ~f/8 (whole face sharp), 3:4 vertical, ISO 100, very subtle sensor noise — never noiseless.
- Directive: "IMG model agency digital for a casting director, not a beauty campaign, not an AI illustration, not a 3D render."

**For social shoots** (the images Starfire actually posts): pull the character's anchor + feature-lock lines from the bible, then swap the casting-digital environment for the shoot scene using the five-block anatomy. The identity language stays; the scene changes.

**Feature-lock redundancy rule:** heritage/feature lock lines (e.g., Cam's Chinese-Japanese-Filipino heritage with subtle European trace) get restated in every prompt of the session AND flagged in production notes handed to anyone else generating.

---

## 6. Copy-Paste Skeletons

**A. Social lifestyle post (Seedream / GPT Image 2.0):**
> Ultra-realistic [documentary-style / editorial] photograph of [CHARACTER anchor description or subject], [action/pose] in [environment with 3+ granular details], [lighting: e.g., soft natural daylight through sheer curtains with realistic shadows], shot on a [35/50/85]mm lens at [aperture], [angle + framing + aspect ratio], [negative space note if caption text overlays]. Skin shows true-to-life texture including visible pores, faint blemishes, and natural [glow/matte finish]; [wardrobe with fabric detail — visible fibers, folds, tension]. Natural color grading, muted tones, subtle film grain, unstaged composition. [Feature-lock line if roster character.] [Negative stack.]

**B. UGC / phone-camera post (Nanobanana PRO):**
> Ultra-realistic [close-up selfie / front-facing phone shot / product-demo framing] of [subject], captured as if on a real iPhone Pro front camera, [natural pose detail — fingers and phone edge visible, arm's length, mirror glare], [environment: bedroom/bathroom/car with real-world props], [lighting: warm LED strips / morning window light], hyper-realistic skin pores and hair strands, faint blemishes, slight redness, natural oiliness — nothing airbrushed. Raw unfiltered UGC TikTok/IG Stories aesthetic, natural phone-camera sharpness, slight digital noise, zero beauty retouching, unstaged composition. [Negative stack.]

**C. Product shot (GPT Image 2.0 / Nanobanana PRO if text-in-image):**
> Ultra-realistic product photograph of [NAMED product/brand] on/in [surface + environment with texture words], [lighting with direction + temperature], shot on [lens] at [aperture] with [focus behavior], [composition: negative space position for headline/CTA], realistic surface detail — [material-specific cues: condensation, brushed metal grain, fabric weave, fingerprint-free glass], natural color grading, high clarity. [In-image text spec if any: exact wording, placement, style.] [Negative stack.]

**D. Feature-level edit on an existing image (Nanobanana PRO edit mode):**
> Using the attached image as the canvas, preserve the composition and identity exactly. [One surgical directive per line: "Replace the background with…", "Change the top to…", "Shift lighting to golden hour from camera-left."] Do not regenerate the face; maintain 1:1 facial fidelity and all skin texture.

---

## 7. The Negative / Exclusion Stack

Append to every human-subject prompt (trim to fit the engine's tolerance):

> No cartoon style, no CGI, no 3D render, no game-engine look, no plastic skin, no airbrushing or smoothing, no painterly softness, no overly symmetrical fake face, no unrealistic lighting, no artificial HDR or oversaturation, no text/logo/watermark [unless the design requires in-image text — then specify it precisely instead].

Casting/anchor shots additionally exclude: tired eyes, eye bags, acne, blotchy skin, dry chapped lips, dull expression, shadows under neck/eyes. Male: no makeup/eyeliner/feminine lashes. Female: no cakey foundation, heavy contour, or dramatic eyeshadow.

Note the deliberate tension: the *realism* stack ASKS for pores, faint blemishes, and imperfections; the *exclusion* stack blocks unhealthy/unattractive artifacts. Both run together — healthy, hydrated, real skin.

---

## 8. QC Checklist — before an AI image enters the Approval Batch

- [ ] Realism cue stack present (≥2 photorealism triggers, camera+lens, real-world lighting, texture layer, negatives)?
- [ ] Roster character → anchor language pulled from the bible + feature lock restated in THIS prompt?
- [ ] No real public figure, celebrity likeness, or copyrighted character/IP anywhere in the prompt?
- [ ] Correct engine routing named, with reason?
- [ ] Platform-correct aspect ratio + negative space if copy overlays?
- [ ] Brand/design law honored if brand graphics present (red once, teal workhorse, cream; or client kit)?
- [ ] The prompt itself attached to the approval item, so an approved look can be regenerated and varied?
- [ ] Approval state honored — generated ≠ approved ≠ shipped?

The prompt is an asset too: file winning prompts back to the Prompt Vault (UGC Avatar Vault / Prompt Bank 1 / Prompt Bank 2 lanes) so the machine compounds.
