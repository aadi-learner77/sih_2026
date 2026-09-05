import os
import logging
from typing import Dict, Any, Optional
from anthropic import Anthropic, APITimeoutError, APIConnectionError, APIError

# Setup basic logger
logger = logging.getLogger(__name__)

# Very simple caching layer to avoid duplicate identical explanations
_EXPLANATION_CACHE: Dict[str, str] = {}

def get_anthropic_client() -> Optional[Anthropic]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        return Anthropic(api_key=api_key, timeout=3.0)
    except Exception as e:
        logger.warning(f"Failed to initialize Anthropic client: {e}")
        return None

def generate_explanation(reading: Any, anomaly_event: Any) -> str:
    """
    Generate a plain-English explanation of why a reading was flagged as an anomaly.
    Uses Anthropic Claude API if available, falls back to a template if not.
    Uses a cache based on the event ID to avoid duplicate API calls for the same event.
    """

    # 1. Simple templated fallback
    # anomaly_event is an object/model, we access its attributes
    event_id = anomaly_event.id
    station_name = anomaly_event.stationName
    param = anomaly_event.parameter
    anomaly_type = anomaly_event.anomalyType
    layer = "AI model" if anomaly_event.aiOnly else "rule-based threshold"
    conf = int(anomaly_event.confidence * 100)

    fallback_text = f"{anomaly_type.capitalize()} detected on {param} at {station_name} via {layer} (confidence {conf}%)."

    # 2. Check cache
    if event_id in _EXPLANATION_CACHE:
        return _EXPLANATION_CACHE[event_id]

    # 3. Setup client
    client = get_anthropic_client()
    if not client:
        return fallback_text

    # 4. Prepare the prompt
    # Safely get current and expected values
    raw_val = anomaly_event.rawValue
    expected = anomaly_event.correctedValue
    expected_text = f" (expected around {expected})" if expected is not None else ""

    prompt = f"""
    Explain this weather sensor anomaly detection in ONE short, plain-English sentence (under 30 words).

    Context:
    - Station: {station_name}
    - Parameter: {param}
    - Reported value: {raw_val}{expected_text}
    - Detection type: {anomaly_type} (e.g. spike, flatline, dropout, drift)
    - Caught by: {layer}
    - Confidence: {conf}%

    Constraint: You are explaining a detection that has already been made by a statistical/ML model.
    DO NOT question or change the classification, only explain the reasoning in plain language for a live dashboard.
    """

    # 5. Call API
    try:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=60,
            temperature=0.3,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Extract response text safely
        if response.content and getattr(response.content[0], "text", None):
            explanation = response.content[0].text.strip()
            # Cache and return
            _EXPLANATION_CACHE[event_id] = explanation
            return explanation

    except (APITimeoutError, APIConnectionError) as e:
        logger.warning(f"Anthropic API connection/timeout error: {e}")
    except APIError as e:
        logger.warning(f"Anthropic API returned an error: {e}")
    except Exception as e:
        logger.warning(f"Unexpected error in explain generation: {e}")

    # 6. Fallback path if API failed
    return fallback_text
