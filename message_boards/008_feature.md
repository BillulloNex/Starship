I want GrokBot itself to become a phone-first companion when it is opened on a small screen, rather than building and maintaining a separate mobile app.

It should use the same conversations, URLs, authentication, Agent Profiles, backend, and codebase as desktop, but intentionally transform the interface for mobile instead of merely shrinking the desktop layout:

- The home screen should become a session inbox organized around running sessions, sessions that need me, and finished sessions.
- Opening a conversation should show one focused full-screen view at a time.
- Files, previews, changes, terminal output, and other tools should open as secondary full-screen views rather than side-by-side panels.
- The composer should be voice-first, with a prominent tap-and-hold microphone that records speech, creates an editable transcript, and sends it through the existing message flow.
- Important session events such as completion, failure, or needing input should support phone notifications.
- The app should be installable from the phone Home Screen as a PWA with its own icon and standalone app experience.
- Desktop should retain the current multi-panel experience, and tablets should have a manual layout override when useful.

The goal is one GrokBot product with two intentionally designed forms: a powerful desktop workspace and a fast phone remote control for viewing, starting, speaking to, stopping, and continuing agent sessions.
