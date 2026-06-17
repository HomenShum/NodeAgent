# Video Agent Pipeline App Map

Goal: use NodeAgent as the durable planner/verifier around video import,
analysis, timeline edit, and render tools.

Recommended components:

- Twick for timeline/editor workflows if its license fits the product.
- FreeCut or Clypra for more permissive editor starting points.
- Remotion, editly, and FFmpeg for render backends.
- yt-dlp only for content the user is authorized to access.
- Auto-Editor, PySceneDetect, and faster-whisper for local analysis.

## Credentials

Local analysis can run without cloud credentials.

Optional:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` or model key | captions/summaries/planning |
| provider adapter vars | durable cloud backend |
| storage bucket vars | source media and render outputs |

Do not expose raw browser cookies to prompts, logs, traces, or eval receipts.
If using browser-authenticated imports, keep cookie handling inside the import
tool process.

## Runtime Mapping

| NodeAgent need | Video app mapping |
|---|---|
| jobs/frames | durable adapter |
| source media | artifact store bucket/local directory |
| scene/silence/transcript analysis | typed tools |
| edit plan | frame result and journaled tool receipt |
| render output | artifact store reference |
| verification | probe output file, duration, tracks, and expected markers |

## Spin Up

```bash
npm install
npm run nodeagent:durable:smoke
# after tools exist:
npm run app:video:analyze-smoke
npm run app:video:render-smoke
```

## App Tools To Add

| Tool | Purpose |
|---|---|
| `import_authorized_media` | import only user-authorized media |
| `analyze_media` | run silence/scene/transcript analysis |
| `propose_timeline_edits` | create structured edit decision list |
| `render_timeline` | render via chosen backend |
| `verify_render` | inspect output and return evidence |

## Done Criteria

- App can analyze a local sample file with no cloud credentials.
- Render smoke writes an output artifact and verifier receipt.
- Import tool refuses unauthorized or unsupported sources.
- Durable journal prevents duplicate render side effects on retry.
