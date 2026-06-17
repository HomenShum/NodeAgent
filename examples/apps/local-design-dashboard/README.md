# Local Design Dashboard App Map

Goal: use NodeAgent as the runtime behind a local-first agent dashboard, with
Open Design-style frame inspection and artifact review.

Open Design reference: https://open-design.ai/

## Credentials

None for the local-first dashboard.

Optional:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` or other model key | live model synthesis |
| provider adapter vars | cloud persistence after local proof |

## Runtime Mapping

| NodeAgent need | Local design app mapping |
|---|---|
| frames/jobs | SQLite local adapter |
| artifacts | local project artifact directory |
| dashboard | local React/Open Design shell |
| agent runs | local Codex/Claude/Cursor/Gemini CLI process |
| review | verifier receipt viewer and diff panel |

## Spin Up

```bash
npm install
npm run nodeagent:durable:smoke
npm run dev
# after dashboard exists:
npm run app:design-dashboard:smoke
```

## App Tools To Add

| Tool | Purpose |
|---|---|
| `list_frames` | show jobs/frames by status |
| `open_frame_receipt` | inspect evidence and artifacts |
| `approve_artifact` | mark artifact approved through typed tool |
| `request_revision` | enqueue follow-up frame with reviewer notes |

## Done Criteria

- Dashboard can inspect a durable receipt from `nodeagent:durable:smoke`.
- Local app runs with no cloud credentials.
- BYOK model keys are optional and never required for deterministic demo.
