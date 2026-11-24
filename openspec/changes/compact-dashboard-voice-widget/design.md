## Context

The existing voice card uses the conversation workspace. Browser and Companion calls already use the shared call lifecycle with different audio transports.

## Decisions

- Use a dedicated widget for the voice layout with compact sizing and one primary call control. Honor the configured title and use content height for existing configurations.
- Start the widget in hands-free mode on an explicit tap. Use the selected browser or Companion transport for the live session and keep the workspace's saved turn-mode preference.
- Reuse call teardown, including conversation save and lease release on Companion. Show the next available call action after cancellation, a normal end, or a retryable failure.
- Preserve the workspace for transcripts, text entry, settings, and approval review.
