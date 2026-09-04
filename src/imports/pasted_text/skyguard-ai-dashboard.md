1. The actual solution (what to build in 36 hrs)

Core idea: Don't just flag anomalies — show the system degrading gracefully and healing itself, since that's exactly what the evaluators will probe ("what happens when connectivity drops or a sensor fails").

Architecture (3 layers, matches the scorecard):

Data layer: Synthetic AWS data generator (temperature, pressure, humidity + timestamp + station ID) that injects realistic faults — sensor spikes, flatlines, drift, dropped packets, power-loss gaps. This is your "real-time" and "physical sensor input" proof without needing real hardware.
AI/ML layer:
Statistical baseline (Z-score / IQR) for cheap, instant checks — this is your answer to "what could a rule-based system NOT do."
ML model: an Isolation Forest or LSTM Autoencoder trained on normal multivariate sensor sequences, flags anomalies the rule-based layer misses (contextual/collective anomalies, not just point outliers).
"Self-healing": once an anomaly is confirmed, auto-impute the missing/bad value (interpolation, or model-predicted value) so downstream forecasting isn't broken — this is your "self-aware and self-healing" grand-challenge answer.
Interface layer: Real-time dashboard (the frontend below) showing live station health, anomaly alerts, confidence scores, and the "before/after healing" data.

Differentiators to state explicitly in the demo (since 9 other teams will build something similar):

Graceful degradation simulation — kill a station's connectivity live during the demo and show the system flagging + auto-healing it.
Explainability — show why a point was flagged (which model triggered it, confidence).
A network-health view across multiple stations, not just one sensor stream.
2. Frontend prompt (paste into an AI website builder)
Build a real-time, mission-control-style web dashboard called "SkyGuard AI" for 
monitoring Automatic Weather Stations (AWS) and detecting sensor anomalies.

STYLE:
- Dark theme, glassmorphism panels (frosted glass cards, subtle blur, thin glowing borders)
- Accent colors: electric blue (#00D4FF) for normal data, amber (#FFB800) for warnings, 
  red (#FF3B5C) for critical anomalies, green (#00FFA3) for "healed/resolved"
- Smooth, physics-based animations (framer-motion style) on every state change — 
  no static number swaps, values should count up/down and pulse
- Futuristic monospace + clean sans font pairing (e.g. "Space Grotesk" for headers, 
  "Inter" for body)
- Subtle animated background: slow-moving particle grid or radar-sweep effect

LAYOUT:
1. Top bar: "SkyGuard AI" logo, live clock, overall network health % (big animated ring gauge)
2. Left sidebar: list of AWS stations (10-15 mock stations across India) as cards with 
   a live status dot (green/amber/red) and mini sparkline of last 20 readings
3. Center: India map (simple SVG, not Google Maps) with station pins that pulse; pin color 
   = station status; clicking a pin zooms a side panel with that station's live data
4. Right panel (per selected station): three live animated gauges (Temperature, Pressure, 
   Humidity) with min/max bands; when a value goes anomalous, the gauge needle turns red 
   and shakes briefly
5. Below the map: a live scrolling "Event Log" — each anomaly event appears as a card 
   sliding in from the right, showing: timestamp, station, parameter, anomaly type 
   (spike/flatline/drift/dropout), confidence score (progress bar), and a "Self-Healing..." 
   status that animates into "✓ Corrected" with the imputed value shown crossed-out vs corrected
6. Bottom: a live multi-line time-series chart (last 60 mock readings) for the selected 
   station, with anomalous points highlighted as red dots and a shaded "healed" region

INTERACTIVITY / DEMO MODE:
- Add a "Simulate Fault" button that lets the presenter manually trigger a sensor spike, 
  flatline, or connectivity drop on any station live during a demo, and watch the 
  dashboard react in real time (detect → alert → auto-heal) within 2-3 seconds
- Add a toggle: "Rule-based only" vs "AI-enhanced" — flip it live to show anomalies the 
  simple threshold system misses but the ML model catches

DATA / BACKEND HOOKS (mock now, must be swappable later):
- All data currently comes from a local mock generator/state (produce realistic time-series 
  with injectable faults) — but structure every data fetch through a single 
  `dataService.js` (or equivalent) module with clearly named functions like 
  getStationList(), getLiveReading(stationId), getAnomalyEvents(), triggerFault(stationId, type)
- These functions should return data shaped exactly like what a real backend/ML API would 
  return (e.g. { stationId, timestamp, temperature, pressure, humidity, isAnomaly, 
  anomalyType, confidence, correctedValue }), so I can later replace the mock functions 
  with real API calls (WebSocket or REST) without touching any UI component
- Use WebSocket-style polling simulation (setInterval pushing new mock readings every 
  1-2 seconds) so it's structurally identical to a real live feed

OUTPUT: Single-page responsive web app (React preferred), fully self-contained, 
no real backend required to run, but cleanly separated data layer for easy backend/ML 
integration later.
3. Which tool to actually run this on

For a frontend that looks like a slick, animated product-demo video, use one of these (in order of fit):

v0.dev (Vercel) — best for exactly this: polished, animated React/Tailwind dashboards, generates clean component code you can drop a real API into in minutes.
Lovable.dev — great if you want a full app scaffold fast, easy to iterate conversationally, good Supabase hookup if you want a real backend quickly too.
bolt.new — good alternative, runs the whole thing in-browser (StackBlitz), easy to export/download the code.

Paste the prompt above into any of these, then iterate: "make the gauges more dramatic," "add a radar sweep on the map," etc. Once you like the look, swap dataService.js's mock functions for real fetch calls to your Python/ML backend (FastAPI or Flask) — the UI won't need to change at all if you kept the data shape consistent.