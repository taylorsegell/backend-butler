## Context

The worker's system prompt, asynchronous update guidance, and configuration tools all provide wording to the conversation model. Each can influence whether Butler speaks as one assistant.

## Decisions

- Identify Backend Butler in the default runtime prompt and use first person for its work. Treat LiveKit as the voice transport.
- Describe MCP tools and callback fallbacks by their operation and result. Keep the existing identifiers, payload structure, caller scope, and stored conversation identifiers.
- A trusted automation update provides status for a reply. Tool execution remains gated to the person's request or exact approval answer.
- A Companion call reads the existing callback feed for its authenticated owner. It starts at the live cursor and releases the reader when the call ends. While a voice lease is active, the text handler records the update for voice delivery.

## Risks / Trade-offs

- A product-identity instruction could lead the model to claim a change too early. State what evidence supports each status and distinguish approval from completion.
- User-configured prompt files are operator-owned. The updated default takes effect in new sessions that load it.
