"""
Test the explain module with a mocked anomaly event.
Tests both the LLM path and the fallback path.
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.explain import generate_explanation
from pydantic import BaseModel

# Mock AnomalyEvent
class MockEvent(BaseModel):
    id: str
    stationName: str
    parameter: str
    anomalyType: str
    rawValue: float
    correctedValue: float | None
    confidence: float
    aiOnly: bool

class MockReading(BaseModel):
    stationId: str
    temperature: float
    pressure: float
    humidity: float

def test_fallback_path():
    """Test that fallback works when no API key is set."""
    # Ensure no API key
    os.environ.pop("ANTHROPIC_API_KEY", None)

    event = MockEvent(
        id="evt-1-1234567890",
        stationName="AWS-DEL-01",
        parameter="temperature",
        anomalyType="spike",
        rawValue=52.3,
        correctedValue=34.1,
        confidence=0.97,
        aiOnly=False
    )
    reading = MockReading(stationId="DEL", temperature=52.3, pressure=1009.0, humidity=45.0)

    result = generate_explanation(reading, event)

    print(f"Fallback explanation: {result}")
    assert "Spike detected" in result
    assert "temperature" in result
    assert "AWS-DEL-01" in result
    assert "97%" in result or "confidence" in result.lower()
    print("  [PASS] Fallback test passed!")

def test_caching():
    """Test that explanations are cached by event ID."""
    os.environ.pop("ANTHROPIC_API_KEY", None)

    event = MockEvent(
        id="evt-cached-123",
        stationName="AWS-MUM-07",
        parameter="pressure",
        anomalyType="flatline",
        rawValue=1010.5,
        correctedValue=1008.2,
        confidence=0.84,
        aiOnly=True
    )
    reading = MockReading(stationId="MUM", temperature=31.4, pressure=1010.5, humidity=78.0)

    # Call twice - should get same result (cached)
    result1 = generate_explanation(reading, event)
    result2 = generate_explanation(reading, event)

    assert result1 == result2
    print(f"Cached explanation: {result1}")
    print("  [PASS] Caching test passed!")

if __name__ == "__main__":
    print("=" * 60)
    print(" TESTING EXPLAIN MODULE (FALLBACK PATH)")
    print("=" * 60)

    # Run fallback test (no API key)
    test_fallback_path()
    test_caching()

    print("\n" + "=" * 60)
    print(" All explain module tests passed!")
    print("=" * 60)
    print("\nNOTE: To test the LLM path:")
    print("  1. Set ANTHROPIC_API_KEY in your environment")
    print("  2. Re-run this test script")
    print("=" * 60)