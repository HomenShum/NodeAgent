# Minimal Portable Agent App

Goal: prove NodeAgent can be dropped into another repo and made spinnable with
only app-specific tools and a durable adapter.

## What To Copy

```text
src/features/node-agent/runtime/durableRuntime.ts
src/features/node-agent/runtime/reasoningFrameRunner.ts
src/features/node-agent/runtime/nodeAgentRuntime.ts
src/features/node-agent/types/nodeAgentTypes.ts
examples/adapters/sqlite-local/
```

## Credentials

None for the first local version.

Optional later:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` or app model key | live synthesis/model calls |
| provider adapter vars | durable backend once local proof passes |

## Spin Up

```bash
npm install
npm run nodeagent:frame:smoke
npm run nodeagent:durable:smoke
npm run dev
```

## Add App Tools

Start with three tools:

| Tool | Purpose |
|---|---|
| `read_project_context` | read repo/app facts into a bounded context pack |
| `write_app_artifact` | write generated app artifact through a typed tool |
| `verify_app_workflow` | run the app-specific smoke and return evidence |

Do not write files, database rows, or cloud objects directly from a frame. Put
those writes behind `ToolRuntime`.

## Done Criteria

- A new repo can run the local durable smoke without cloud credentials.
- README says exactly how to add provider credentials later.
- One app workflow runs from prompt to verifier receipt.
- `npm run prepush` passes.

## Coding-Agent Prompt

```text
Create a minimal NodeAgent-powered app using the local durable runtime first.
Keep provider-specific code behind DurableRuntimePorts. Add three app tools:
read_project_context, write_app_artifact, and verify_app_workflow. Add a smoke
that proves prompt -> frame -> tool call -> artifact -> verifier receipt.
```
