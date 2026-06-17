# Sample App Blueprints

These folders are app-level maps for turning NodeAgent into a spinnable product.
They are intentionally explicit for coding agents: what to copy, what tools to
add, what credentials to request, and what smoke proves the app works.

## App Folders

| Folder | Use when |
|---|---|
| `minimal-portable-agent` | you want the smallest app that proves NodeAgent can be dropped into another repo |
| `aws-hackathon-visual-labs` | you want AWS-native durable runtime plus media/artifact workflows |
| `local-design-dashboard` | you want Open Design-style local dashboard and frame review workflow |
| `local-dashboard` | you want a fully scaffolded no-key dashboard with SQLite and Trace Lens tabs |
| `video-agent-pipeline` | you want timeline/edit/render tools around the durable runtime |

Scaffold the runnable local dashboard:

```bash
npm run nodeagent -- apps scaffold local-dashboard --dir nodeagent-local-dashboard
cd nodeagent-local-dashboard
npm install
npm run agent:demo
npm run dev
```

## Coding Agent Done Criteria

A sample app is spinnable only when:

- `.env.example` lists every required credential
- README includes spin-up commands from clone to local run
- durable runtime adapter is behind `DurableRuntimePorts`
- app tools are typed and do not mutate provider state outside `ToolRuntime`
- smoke proves at least one full user workflow
- secrets do not appear in git diff, test output, logs, eval JSON, or docs

## Human Credential Handoff

Use this template:

```text
To spin this app locally I need:
- CREDENTIAL_NAME: provider and why it is needed
- CREDENTIAL_NAME_2: provider and why it is needed

Please put them in .env.local or the provider secret manager. I will verify
with the provider CLI and will not echo secret values back to the console.
```
