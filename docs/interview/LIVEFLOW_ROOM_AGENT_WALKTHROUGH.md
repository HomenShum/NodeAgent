# LiveFlow room-agent walkthrough

This branch adds a presentation path for the room-to-agent-to-artifact flow.

Core story: a host creates a room, guests join without accounts, the public NodeAgent works in the center chat, a private NodeAgent can open in the right rail, and shared artifacts open beside the room chat.

The agent proposes changes. Bounded tools apply changes with versioning, idempotency, traces, and review gates.
