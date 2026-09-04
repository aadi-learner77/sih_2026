import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict, Tuple, Optional, Any
from app.stations import BASE_VALUES

SCALES = {
    'temperature': 1.4,
    'pressure': 1.8,
    'humidity': 2.5
}

def extract_features_from_window(
    history: List[Dict[str, float]], 
    base: Dict[str, float]
) -> np.ndarray:
    """
    Engineered features for a rolling window of readings (last N=4 to 6 readings).
    Features per parameter (temp, pressure, humidity):
    1. Normalized difference from base
    2. Rolling standard deviation
    3. Rolling trend/slope
    Returns a 1D array of 9 features.
    """
    if not history:
        return np.zeros(9)
    
    temps = [r['temperature'] for r in history]
    press = [r['pressure'] for r in history]
    hums  = [r['humidity'] for r in history]

    n = len(history)

    def calc_param_features(vals: List[float], base_val: float, scale: float):
        raw_diff = (vals[-1] - base_val) / scale
        std_val = float(np.std(vals)) / scale if n > 1 else 1.0
        if n > 1:
            x = np.arange(n)
            slope = float(np.polyfit(x, vals, 1)[0]) / scale
        else:
            slope = 0.0
        return raw_diff, std_val, slope

    t_diff, t_std, t_trend = calc_param_features(temps, base['temp'], SCALES['temperature'])
    p_diff, p_std, p_trend = calc_param_features(press, base['pressure'], SCALES['pressure'])
    h_diff, h_std, h_trend = calc_param_features(hums, base['humidity'], SCALES['humidity'])

    return np.array([t_diff, t_std, t_trend, p_diff, p_std, p_trend, h_diff, h_std, h_trend])

class AnomalyDetector:
    def __init__(self):
        self.clf = IsolationForest(n_estimators=100, contamination=0.03, random_state=42)
        self._fit_initial_model()

    def _fit_initial_model(self):
        """Train IsolationForest on synthetic normal windows at startup."""
        training_samples = []
        dummy_base = {'temp': 30.0, 'pressure': 1000.0, 'humidity': 50.0, 'wind': 5.0}
        
        # Generate 1000 normal history windows
        for _ in range(1000):
            window = []
            for _ in range(6):
                t = dummy_base['temp'] + (np.random.rand() - 0.5) * 2 * 1.4
                p = dummy_base['pressure'] + (np.random.rand() - 0.5) * 2 * 1.8
                h = dummy_base['humidity'] + (np.random.rand() - 0.5) * 2 * 2.5
                window.append({'temperature': t, 'pressure': p, 'humidity': h})
            feats = extract_features_from_window(window, dummy_base)
            training_samples.append(feats)

        self.clf.fit(np.array(training_samples))

    def evaluate_reading(
        self, 
        station_id: str,
        current_raw: Tuple[float, float, float, float],
        history: List[Dict[str, Any]],
        mode: str = 'ai'
    ) -> Dict[str, Any]:
        """
        Evaluate a reading using rule or AI detection mode.
        Returns anomaly metadata:
        {
          isAnomaly, anomalyType, anomalyParameter, confidence, correctedValue, aiOnly
        }
        """
        temp, pres, hum, wind = current_raw
        base = BASE_VALUES.get(station_id, {'temp': 30.0, 'pressure': 1000.0, 'humidity': 50.0, 'wind': 5.0})

        # ── 1. Rule-based checks (Z-score / Thresholding) ────────────────
        rule_anomaly = False
        rule_type = None
        rule_param = None

        if temp == 0.0 and pres == 0.0 and hum == 0.0:
            rule_anomaly = True
            rule_type = 'dropout'
            rule_param = 'temperature'
        else:
            temp_z = abs(temp - base['temp']) / SCALES['temperature']
            pres_z = abs(pres - base['pressure']) / SCALES['pressure']
            hum_z  = abs(hum - base['humidity']) / SCALES['humidity']

            if temp_z > 3.8:
                rule_anomaly = True
                rule_type = 'spike'
                rule_param = 'temperature'
            elif pres_z > 3.8:
                rule_anomaly = True
                rule_type = 'spike'
                rule_param = 'pressure'
            elif hum_z > 3.8:
                rule_anomaly = True
                rule_type = 'spike'
                rule_param = 'humidity'

        if mode == 'rule':
            confidence = 0.88 if rule_anomaly else 0.0
            corrected_val = None
            if rule_anomaly:
                corrected_val = self._impute_value(history, rule_param, base)
            
            return {
                'isAnomaly': rule_anomaly,
                'anomalyType': rule_type,
                'anomalyParameter': rule_param,
                'confidence': confidence,
                'correctedValue': corrected_val,
                'aiOnly': False
            }

        # ── 2. AI Mode (Rule + ML Isolation Forest + Feature Analysis) ──
        window = history + [{'temperature': temp, 'pressure': pres, 'humidity': hum}]
        window = window[-6:] # Keep last 6 for window analysis
        
        feats = extract_features_from_window(window, base)
        decision_score = float(self.clf.decision_function([feats])[0])
        is_if_anomaly = (self.clf.predict([feats])[0] == -1)

        # Feature level analysis (flatline & drift inspection)
        t_diff, t_std, t_trend, p_diff, p_std, p_trend, h_diff, h_std, h_trend = feats

        ai_anomaly = rule_anomaly
        ai_type = rule_type
        ai_param = rule_param
        ai_only = False

        if not rule_anomaly and len(window) >= 4:
            # Check for Flatline (near-zero variance)
            if p_std < 0.15 and temp > 0:
                ai_anomaly = True
                ai_type = 'flatline'
                ai_param = 'pressure'
                ai_only = True
            elif t_std < 0.15 and temp > 0:
                ai_anomaly = True
                ai_type = 'flatline'
                ai_param = 'temperature'
                ai_only = True
            elif h_std < 0.15 and temp > 0:
                ai_anomaly = True
                ai_type = 'flatline'
                ai_param = 'humidity'
                ai_only = True
            # Check for Drift (sustained trend)
            elif abs(t_trend) > 0.5:
                ai_anomaly = True
                ai_type = 'drift'
                ai_param = 'temperature'
                ai_only = True
            elif abs(p_trend) > 0.5:
                ai_anomaly = True
                ai_type = 'drift'
                ai_param = 'pressure'
                ai_only = True
            elif is_if_anomaly:
                ai_anomaly = True
                ai_type = 'spike'
                # Pick parameter with highest deviation
                devs = {'temperature': abs(t_diff), 'pressure': abs(p_diff), 'humidity': abs(h_diff)}
                ai_param = max(devs, key=devs.get)
                ai_only = True

        # Compute confidence from real Isolation Forest decision score
        if ai_anomaly:
            # Map decision score to confidence [0.70, 0.99]
            score_magnitude = abs(decision_score) if decision_score < 0 else 0.1
            confidence = round(min(0.99, max(0.72, 0.75 + score_magnitude * 2.2)), 2)
            corrected_val = self._impute_value(history, ai_param, base)
        else:
            confidence = 0.0
            corrected_val = None

        return {
            'isAnomaly': ai_anomaly,
            'anomalyType': ai_type,
            'anomalyParameter': ai_param,
            'confidence': confidence,
            'correctedValue': corrected_val,
            'aiOnly': ai_only
        }

    def _impute_value(self, history: List[Dict[str, Any]], param: str, base: Dict[str, float]) -> float:
        """Self-healing: interpolate from recent valid non-anomalous readings."""
        if not param:
            return round(base['temp'], 1)
        
        valid_vals = [
            r[param] for r in history 
            if not r.get('isAnomaly') and r.get(param) is not None and r.get(param) > 0
        ]
        if valid_vals:
            return round(float(np.mean(valid_vals[-5:])), 1)
        return round(base.get(param, 30.0), 1)

# Global singleton detector instance
detector_instance = AnomalyDetector()
