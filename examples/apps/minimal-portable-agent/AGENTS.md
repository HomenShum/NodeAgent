# Coding Agent Notes

Build the minimal app in this order:

1. Run `npm run nodeagent:durable:smoke`.
2. Add app tools behind `ToolRuntime`.
3. Add one app workflow smoke.
4. Only then add a cloud provider adapter.

Do not ask for cloud credentials until the local durable proof passes.
