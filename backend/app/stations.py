from typing import Dict, List, Any

STATIONS: List[Dict[str, Any]] = [
  {"id": 'DEL', "name": 'AWS-DEL-01', "location": 'New Delhi',           "state": 'Delhi',          "lat": 28.6,  "lon": 77.2,  "elevation": 216},
  {"id": 'MUM', "name": 'AWS-MUM-07', "location": 'Mumbai',              "state": 'Maharashtra',    "lat": 19.1,  "lon": 72.9,  "elevation": 14},
  {"id": 'CHN', "name": 'AWS-CHN-03', "location": 'Chennai',             "state": 'Tamil Nadu',     "lat": 13.1,  "lon": 80.3,  "elevation": 6},
  {"id": 'KOL', "name": 'AWS-KOL-05', "location": 'Kolkata',             "state": 'West Bengal',    "lat": 22.6,  "lon": 88.4,  "elevation": 9},
  {"id": 'BLR', "name": 'AWS-BLR-09', "location": 'Bengaluru',           "state": 'Karnataka',      "lat": 12.97, "lon": 77.6,  "elevation": 920},
  {"id": 'HYD', "name": 'AWS-HYD-04', "location": 'Hyderabad',           "state": 'Telangana',      "lat": 17.4,  "lon": 78.5,  "elevation": 542},
  {"id": 'AMD', "name": 'AWS-AMD-11', "location": 'Ahmedabad',           "state": 'Gujarat',        "lat": 23.0,  "lon": 72.6,  "elevation": 52},
  {"id": 'JAI', "name": 'AWS-JAI-06', "location": 'Jaipur',              "state": 'Rajasthan',      "lat": 26.9,  "lon": 75.8,  "elevation": 431},
  {"id": 'LKO', "name": 'AWS-LKO-08', "location": 'Lucknow',             "state": 'Uttar Pradesh',  "lat": 26.8,  "lon": 80.9,  "elevation": 111},
  {"id": 'BHO', "name": 'AWS-BHO-12', "location": 'Bhopal',              "state": 'Madhya Pradesh', "lat": 23.3,  "lon": 77.4,  "elevation": 527},
  {"id": 'PAT', "name": 'AWS-PAT-02', "location": 'Patna',               "state": 'Bihar',          "lat": 25.6,  "lon": 85.1,  "elevation": 54},
  {"id": 'GUW', "name": 'AWS-GUW-13', "location": 'Guwahati',            "state": 'Assam',          "lat": 26.2,  "lon": 91.7,  "elevation": 55},
  {"id": 'PUN', "name": 'AWS-PUN-10', "location": 'Pune',                "state": 'Maharashtra',    "lat": 18.5,  "lon": 73.9,  "elevation": 560},
  {"id": 'TVM', "name": 'AWS-TVM-15', "location": 'Thiruvananthapuram',  "state": 'Kerala',         "lat": 8.5,   "lon": 77.0,  "elevation": 64},
  {"id": 'SXR', "name": 'AWS-SXR-14', "location": 'Srinagar',            "state": 'J&K',            "lat": 34.1,  "lon": 74.8,  "elevation": 1587},
]

BASE_VALUES: Dict[str, Dict[str, float]] = {
  'DEL': {'temp': 34.2, 'pressure': 1009.0, 'humidity': 45.0, 'wind': 4.2},
  'MUM': {'temp': 31.4, 'pressure': 1013.0, 'humidity': 78.0, 'wind': 6.8},
  'CHN': {'temp': 33.1, 'pressure': 1011.0, 'humidity': 72.0, 'wind': 5.1},
  'KOL': {'temp': 30.6, 'pressure': 1010.0, 'humidity': 80.0, 'wind': 3.7},
  'BLR': {'temp': 26.3, 'pressure': 921.0,  'humidity': 60.0, 'wind': 3.2},
  'HYD': {'temp': 29.8, 'pressure': 960.0,  'humidity': 55.0, 'wind': 4.5},
  'AMD': {'temp': 35.7, 'pressure': 1007.0, 'humidity': 35.0, 'wind': 7.3},
  'JAI': {'temp': 36.4, 'pressure': 992.0,  'humidity': 30.0, 'wind': 8.1},
  'LKO': {'temp': 32.5, 'pressure': 1005.0, 'humidity': 50.0, 'wind': 3.9},
  'BHO': {'temp': 30.1, 'pressure': 965.0,  'humidity': 52.0, 'wind': 4.0},
  'PAT': {'temp': 31.2, 'pressure': 1008.0, 'humidity': 68.0, 'wind': 3.4},
  'GUW': {'temp': 28.4, 'pressure': 1012.0, 'humidity': 85.0, 'wind': 5.5},
  'PUN': {'temp': 28.9, 'pressure': 956.0,  'humidity': 58.0, 'wind': 4.7},
  'TVM': {'temp': 30.5, 'pressure': 1014.0, 'humidity': 82.0, 'wind': 7.2},
  'SXR': {'temp': 18.2, 'pressure': 852.0,  'humidity': 40.0, 'wind': 6.5},
}
