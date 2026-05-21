from pydantic import BaseModel


class DemoAlertRequest(BaseModel):
    gesture_label: str = "distress_swipe"
    confidence: float = 0.96
    latitude: float = 12.9716
    longitude: float = 77.5946
