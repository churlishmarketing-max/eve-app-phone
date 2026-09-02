---
name: editor-brief-generator
description: "Generates standardized project briefs and instruction forms for editors, VAs, and production team members working on Churlish Media client content. Trigger this skill whenever the user asks to create an editor brief, editing instructions, project description for an editor, VA assignment form, editing notes, or any handoff document for a team member who will be editing or producing content. Also trigger when the user says 'fill this out for my editor', 'brief for [editor/VA name]', 'project form for', 'editing instructions for', 'hand this off to', or references delegating editing or production work to a team member. This skill produces clean, actionable briefs that give editors everything they need without requiring a follow-up conversation."
---

# Editor Brief Generator

Generates complete, actionable project briefs for editors and VAs working on Churlish Media client content. Every brief follows a standardized format that eliminates back-and-forth by including all context, specs, and style notes upfront.

## Dependencies

- **churlish-voice-guard skill** — Reference visual-identity.md for style notes relevant to the client

## Required inputs

Gather from the user (ask if not provided):

1. **Client name** — Which client is this for?
2. **Deliverable type** — Social clips, long-form edit, carousel graphics, captions, full video, etc.
3. **Platform(s)** — Where will this content be published?
4. **Source material** — What raw assets exist? (video footage, transcripts, photos, prior content)
5. **Style/tone notes** — Anything specific about how this client's content should feel
6. **Reference links** — Any example videos, posts, or styles to match (optional)
7. **Deadline** — When does this need to be delivered?

## Output format

A clean, scannable brief that can be sent directly to the editor/VA. Deliver inline in the conversation for quick handoffs, or as a .docx for larger projects.

### Brief template:

```
PROJECT BRIEF — [Client Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Client:          [Business name]
Contact:         [Client contact name if relevant]
Editor:          [Editor/VA name if known]
Due date:        [Date]
Priority:        [Standard / Rush / Flexible]

PROJECT DESCRIPTION:
[2–4 sentences describing what the editor is producing, for whom, and the purpose of the content]

DELIVERABLES:
• [Specific deliverable 1 with quantity — e.g., "6 short-form vertical clips (9:16), 30–60 seconds each"]
• [Specific deliverable 2]
• [Specific deliverable 3]

PLATFORM SPECS:
• Format: [9:16 / 16:9 / 1:1 / 4:5]
• Resolution: [1080x1920 / 1920x1080 / etc.]
• Max length: [Per clip or per piece]
• Captions: [Burned in / SRT file / None]

STYLE & TONE:
[Description of the feel — warm and community-focused, bold and authoritative, cinematic and premium, etc. Include specific guidance like "avoid corporate feel" or "match the energy of [reference]"]

EDITING NOTES:
[Specific technical instructions — color grade preferences, music direction, pacing notes, text overlay style, transition preferences, anything the editor needs to know about how to cut this]

SOURCE MATERIAL:
[Where to find the raw files — drive link, folder name, file names. Or note if assets will be provided separately]

REFERENCE:
[Link to reference video/post/style, or "None — use standard Churlish treatment"]

CAPTION/COPY NOTES:
[If the editor is also writing captions: tone guidance, hashtag rules, CTA to include. If captions are handled separately, note that]

DELIVERY:
[Where to deliver finished files — Google Drive folder, Dropbox link, email, etc.]
[File naming convention if applicable]
```

## Adapting by deliverable type

### Social content clips
- Emphasize platform specs (vertical, captions burned in)
- Include guidance on hook identification if clips are being pulled from longer footage
- Note posting cadence context (these are for the next 2 weeks of content, etc.)

### Long-form video edit
- Include detailed pacing notes
- Reference the video's purpose (YouTube authority video, client testimonial, event recap)
- Include chapter/section markers if the editor should structure the video in segments
- Music direction (mood, energy level, licensed vs. royalty-free)

### Carousel graphics
- Include text content for each card
- Reference the visual template or brand guide
- Note the font, color, and layout preferences
- Card count and flow (what story the carousel tells)

### Captions / copy only
- Include the video or post the captions are for
- Note the platform and character limits
- Include CTA guidance and hashtag rules
- Tone calibration for this specific client

## Quality checks

- [ ] Every field is filled — no "TBD" or "will send later" (if info is genuinely pending, flag it explicitly and note the expected delivery)
- [ ] Platform specs are correct for the stated platforms
- [ ] Style notes are specific enough that the editor won't need to ask clarifying questions
- [ ] Delivery location and file naming are specified
- [ ] The brief could be understood by someone who has never worked on this client before
