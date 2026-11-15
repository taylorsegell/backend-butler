"""Audio-only test adapter for the Companion bridge's camera-specific protocol."""

from homeassistant.components.camera import (
    Camera,
    CameraEntityCapabilities,
    CameraEntityFeature,
)
from homeassistant.components.camera.webrtc import WebRTCAnswer
from homeassistant.core import callback


class NativeAudioCamera(Camera):
    _attr_name = "Butler native audio POC"
    _attr_supported_features = CameraEntityFeature.STREAM
    _attr_camera_entity_capabilities = CameraEntityCapabilities(two_way_audio=True)

    def __init__(self, session):
        super().__init__()
        self.entity_id = session.entity_id
        self.session = session
        self.receiver = session.receiver

    async def async_handle_async_webrtc_offer(
        self, offer_sdp, session_id, send_message
    ):
        self.session.check_signaling()
        answer = await self.receiver.offer(offer_sdp, session_id)
        send_message(WebRTCAnswer(answer.sdp))

    async def async_on_webrtc_candidate(self, session_id, candidate):
        self.session.check_signaling()
        await self.receiver.candidate(session_id, candidate.to_dict())

    @callback
    def close_webrtc_session(self, session_id):
        if session_id in self.receiver.peers:
            self.hass.async_create_task(self.receiver.close())

    async def async_camera_image(self, width=None, height=None):
        return None
