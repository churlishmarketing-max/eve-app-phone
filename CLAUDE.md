## Worker seat: Red Tornado
Per Big Barda's routing law, grind work that doesn't need Claude goes to the worker.
Instead of doing it, write a spec to C:/ChurlishOS/worker-inbox/specs/YYYY-MM-DD-slug.md.
Inputs must live in worker-inbox/ or the rls-os repo; the worker can't see anything else.
At session start, judge any new files in worker-inbox/reports/: accept, revise with a
tighter spec naming exactly what fell short, or escalate to Brandon.

Spec template:
# Spec: <slug>
Goal:
Inputs: (worker paths, e.g. /workspace/inbox/in/transcript.txt)
Deliverable: (exact path, e.g. /workspace/inbox/out/clips.md)
Done when: (an observable check the worker can run)
Out of bounds: (always include: code work happens on a branch named worker/<slug>, never main)
Skills to use:
