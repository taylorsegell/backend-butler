# Backend Butler promotion kit

For Home Assistant. Powered by LiveKit.

## Assets

- [Promo video](../media/backend-butler-promo.mp4)
- [Poster](../media/backend-butler-promo.jpg)
- [Wide graphic](../media/backend-butler-promo-wide.png)
- [Square graphic](../media/backend-butler-promo-square.png)
- [Music and media attribution](../media/README.md)

The video shows the current Live interface and an illustrated mobile voice conversation. The kitchen and porch examples are fictional; animated audio bars indicate speaking states. Music is included; spoken dialogue is conveyed visually. Keep the music attribution with any video upload.

## Short post

Talk to the house. Backend Butler puts voice and chat inside Home Assistant: speak naturally, follow live captions, and keep the same conversation going in Transcript or text.

For Home Assistant. Powered by LiveKit.

Try the public beta: https://github.com/taylorsegell/backend-butler#quickstart

#HomeAssistant #LiveKit #SmartHome #OpenSource

## Community post

I’ve updated Backend Butler’s Live interface for Home Assistant. Tap Call to start a continuous voice conversation, follow live captions, and open Transcript to see the exchange or type a follow-up in the same session.

The short demo illustrates “Turn off the kitchen lights” followed by “And the porch light.” The mobile wireframe shows listening and speaking states, with bubbles preserving the conversation history.

For Home Assistant. Powered by LiveKit. Bring your own Home Assistant, LiveKit and inference credentials. The current beta requires Home Assistant 2026.11.1 or newer. Browser voice requires HTTPS or localhost; supported Home Assistant Companion native capture can use local HTTP after enabling the bridge on both HA and the matching worker.

Setup and beta limits: https://github.com/taylorsegell/backend-butler#quickstart

Feedback on voice flows, mobile controls and reconnect behavior is welcome. Include the installed versions and redacted reproduction steps.

## Video upload title and description

**Title:** Backend Butler — talk to your home

**Description:** Voice first. Chat when you want. For Home Assistant. Powered by LiveKit. A look at the current Live interface and an animated mobile conversation. The wireframe uses fictional requests and replies; its speaking states are visual illustrations.

Get started: https://github.com/taylorsegell/backend-butler#quickstart

Music: “Happy Beats / Business Moves Vol. 1” by Sascha Ende (https://ende.app/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Excerpt trimmed, gain adjusted and faded. Sound effects: Kenney, CC0.

See [release preparation status](release-status.md) for the current merge and publication blocker.

## Publication sequence

1. Merge the README/media change and reviewed dependency PRs only after `CI required` passes; verify the resulting default branch.
2. Confirm the selected beta release and its matching worker are available. Keep the withdrawn beta.4 unpublished. If shipping a new software version, follow the release PR, version, tag CI and draft-release gates in [Public beta](public-beta.md).
3. Play the inline promo in the public README; check playback on a phone and confirm the LiveKit closing credit.
4. Upload the video with the attribution above and use the square or wide image where useful. Use the setup URL as the call to action. Review each channel’s posting rules before submission.
5. After publication, monitor installation questions, capture/reconnect failures and history reports through redacted issues. Use [the beta rollback guidance](public-beta.md#monitor-and-roll-back) for deployment regressions.

This file prepares copy and assets. It does not record an announcement as published or certify any new hardware or deployment testing.
