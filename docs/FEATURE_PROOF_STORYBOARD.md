# NodeAgent Feature Proof Storyboard

This storyboard governs the README walkthrough assets:

- `docs/walkthroughs/nodeagent-local-dashboard-walkthrough.gif`
- `docs/walkthroughs/nodeagent-local-dashboard-walkthrough.mp4`

The clip is a proof artifact, not decoration. It must show the portable NodeAgent adoption path with enough visible state that a viewer can understand what was run, what the agent changed, and which receipts back the claim.

## Proof Contract

The walkthrough should prove four things:

1. **No-key adoption path** - the local dashboard scaffold runs without paid provider keys and keeps provider-specific logic behind adapters.
2. **Frame execution** - a bounded NodeAgent frame gathers room-like context, calls tools, and returns an auditable frame result.
3. **Visible tool surfaces** - chat, search, spreadsheet/modeling, and notebook-style output are represented as user-facing tool UI, not hidden transcript text.
4. **Receipts before claims** - the proof path points to deterministic smoke receipts under `docs/eval/` and keeps optional live-provider behavior separate.

## Story Beats

1. **Runnable entry** - show the local dashboard overview and the command path users can run.
2. **Agent frame** - show an agent run with frame state, tool actions, and a completed receipt.
3. **Locked builder surface** - show the guarded builder state so users see where app code generation is controlled.
4. **Proof handoff** - point viewers to the smoke commands and JSON receipts that back the visual claim.

## Capture Command

```bash
npm run clip:capture
```

The command regenerates both README media files from checked-in source frames. It requires `ffmpeg` on `PATH`.

## Validation Checklist

- `npm run nodeagent:frame:smoke`
- `npm run nodeagent:durable:smoke`
- `npm run nodeagent:sqlite:smoke`
- `npm run nodeagent:local-dashboard:smoke`
- `npm run nodeagent:chat-ui:smoke`
- `npm run clip:capture`
- `npm run typecheck`

Optional live checks remain optional and must be labeled as such:

- `npm run nodeagent:convex:smoke -- --skip-if-missing`
- `npm run nodeagent:live-provider:smoke -- --skip-if-missing`
- `npm run omnigent:nodeagent:smoke`

## Follow-Up Integration

- Publish NodeAgent adoption tasks into NodeTasks so frame, durable, SQLite, Convex, and chat UI checks can be searched as benchmark-style tasks.
- Use NodeGraph for future trace/frame visualizations: frame, context pack, tool call, evidence, mutation, and receipt nodes should be selectable as a semantic neighborhood.
