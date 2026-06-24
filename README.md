# Multi-Agent Traffic Simulation

> A real-time 3D traffic safety simulation powered by **Google ADK (Agent Development Kit)** and **Gemini 2.5 Flash**. Four AI agents collaborate to make live traffic decisions, driving a Three.js 3D scene with vehicles, a pedestrian, weather effects, and an emergency ambulance response.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [How to Run](#4-how-to-run)
5. [Agent Architecture](#5-agent-architecture)
6. [Scenarios](#6-scenarios)
7. [API Reference](#7-api-reference)
8. [Decision Rules](#8-decision-rules)
9. [UI Guide](#9-ui-guide)
10. [Troubleshooting](#10-troubleshooting)
11. [Changelog — Vehicle Merge/Overlap Fix](#11-changelog--vehicle-mergeoverlap-fix)

---

## 1. Project Overview

This simulation teaches pedestrian road safety through two interactive scenarios:

| Scenario | Description |
|----------|-------------|
| **Safety Scenario** | Pedestrian crosses safely when the signal is GREEN and traffic density is LOW |
| **Hazardous Scenario** | Pedestrian stops mid-crossing to use a phone, a countdown timer runs, and a vehicle causes a collision — followed by ambulance response |

Every time the user changes the traffic light, weather, or density, the system calls the Flask backend which runs the Google ADK agent pipeline and returns a live decision. The 3D scene reacts immediately.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| AI Agents | Google ADK + Gemini 2.5 Flash | Multi-agent decision system |
| Backend | Python 3 + Flask + Flask-CORS | REST API |
| Frontend | Three.js r182 + Vite 7 | 3D rendering |
| Build | Node.js 18+ + npm | Frontend bundler |
| Config | python-dotenv | API key management |

---

## 3. Project Structure

```
final_project/
├── agent_backend/
│   ├── agent.py                  # Root agent: TrafficSupervisor
│   ├── server.py                 # Flask API + spec enforcement
│   ├── requirements.txt          # Python dependencies
│   ├── .env                      # GOOGLE_API_KEY goes here
│   ├── agents/
│   │   ├── safety_agent.py       # Calculates risk level
│   │   ├── pedestrian_agent.py   # CROSS or WAIT decision
│   │   ├── driver_agent.py       # MOVE or STOP decision
│   │   └── traffic_light_agent.py# Reports signal state
│   └── workflow/
│       └── traffic_workflow.py   # SequentialAgent pipeline
│
└── traffic-sim/
    ├── main.js                   # App entry point, UI wiring
    ├── index.html                # Layout and HTML elements
    ├── style.css                 # All styles
    ├── api_key.js                # Gemini key for AI chat
    ├── package.json
    └── src/
        ├── simulation.js         # Core simulation logic (vehicle queueing fix lives here)
        └── entities.js           # Car, Student, TrafficLight, Confetti
```

---

## 4. How to Run

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- A Google Gemini API key — get one free at https://aistudio.google.com

### Step 1 — Set your API keys

Open `agent_backend/.env` and add:
```
GOOGLE_API_KEY=your_gemini_api_key_here
```

Open `traffic-sim/api_key.js` and add:
```js
export const GEMINI_API_KEY = "your_gemini_api_key_here";
```

### Step 2 — Start the Backend (Terminal 1)

```bash
cd final_project/agent_backend
pip install -r requirements.txt
cd ..
python -m flask --app agent_backend.server run --host=0.0.0.0 --port=5000
```

> **Important:** Run from `final_project/` (one level above `agent_backend/`), not from inside `agent_backend/`.

### Step 3 — Start the Frontend (Terminal 2)

```bash
cd final_project/traffic-sim
npm install
npm run dev
```

### Step 4 — Open in Browser

```
http://localhost:5173
```

Keep both terminals open while using the simulation.

---

## 5. Agent Architecture

The system uses a **Sequential Agent Pipeline** — each agent runs in order and passes context to the next.

```
User Input
    │
    ▼
TrafficSupervisor  (Root Agent — Gemini 2.5 Flash)
    │
    ▼
TrafficWorkflow  (SequentialAgent)
    │
    ├─ 1. SafetyAgent         → risk: LOW | MEDIUM | HIGH
    │
    ├─ 2. PedestrianAgent     → pedestrian: CROSS | WAIT
    │
    ├─ 3. DriverAgent         → vehicles: MOVE | STOP
    │
    └─ 4. TrafficLightAgent   → traffic_light: RED | GREEN
    │
    ▼
JSON Response → Frontend → 3D Scene Updates
```

### Agent Responsibilities

| Agent | Input | Output | Rule |
|-------|-------|--------|------|
| SafetyAgent | density, weather | risk level | HIGH if density=HIGH |
| PedestrianAgent | light, density, risk | CROSS or WAIT | GREEN + LOW → CROSS |
| DriverAgent | traffic_light | MOVE or STOP | GREEN → STOP |
| TrafficLightAgent | traffic_light | reports state | Echoes input |

---

## 6. Scenarios

### Safety Scenario

```
Signal: GREEN
Density: LOW
Weather: Any

→ Pedestrian: CROSS
→ Vehicles:   STOP
→ Risk:       LOW
→ Pedestrian walks straight across safely
→ Confetti + success screen
```

### Hazardous Scenario

```
Step 1: Signal GREEN → Vehicles STOP → Pedestrian walks
Step 2: Pedestrian reaches 60% of road → stops, looks at phone
Step 3: 30-second countdown starts
Step 4: Timer = 0 → Signal turns RED → One vehicle starts moving
Step 5: Vehicle reaches pedestrian → Collision occurs
Step 6: Pedestrian falls (stays visible on road)
Step 7: All vehicles stop
Step 8: Ambulance arrives on dedicated emergency lane (x=11.5)
Step 9: Paramedic attends pedestrian → loads into ambulance
Step 10: Learning report shown
```

### Lane Layout

```
x = -4.5   →  Southbound traffic lane  (direction +Z)
x =  4.5   →  Northbound traffic lane  (direction -Z)
x = 11.5   →  AMBULANCE ONLY — reserved emergency lane
```

Each lane is single-file (one car-width). Vehicles never change `laneX` during normal driving — only the active collision car in the Hazardous scenario steers laterally toward the pedestrian.

---

## 7. API Reference

### `POST /traffic-decision`

Standard traffic decision endpoint (unchanged from original).

**Request:**
```json
{
  "traffic_light": "GREEN",
  "traffic_density": "Low",
  "weather": "Sunny"
}
```

**Response:**
```json
{
  "pedestrian": "CROSS",
  "vehicles": "STOP",
  "traffic_light": "GREEN",
  "risk": "LOW",
  "message": "Low traffic. Safe to cross.",
  "source": "adk"
}
```

`source` is `"adk"` when Gemini responded, or `"fallback"` when the deterministic rule engine was used.

---

## 8. Decision Rules

| Traffic Light | Density | Pedestrian | Vehicles | Risk |
|--------------|---------|-----------|---------|------|
| GREEN | LOW | CROSS | STOP | LOW |
| GREEN | MEDIUM | WAIT | STOP | MEDIUM |
| GREEN | HIGH | WAIT | STOP | HIGH |
| RED | ANY | WAIT | MOVE | varies |

**Key rule:** Only `GREEN` signal + `LOW` density allows crossing. Weather does not block crossing.

---

## 9. UI Guide

### Setup Screen

Select before starting:
- **Scenario** — Safety or Hazardous
- **Weather** — Sunny / Rainy / Snowy / Foggy
- **Traffic Density** — Low / Medium / High

### Simulation HUD (top-right)

| Element | Function |
|---------|----------|
| 🏠 Home | Return to setup screen |
| ⟳ Restart | Reset current simulation |
| Score | Live score (starts at 100) |
| Scenario badge | Shows SAFETY or HAZARDOUS |

### AI Decision Panel (bottom-left of 3D view)

Shows live output from each agent:
- 🚦 Light state
- 🛡️ Safety risk level
- 🚗 Vehicle decision
- 🚶 Pedestrian decision
- 🎭 Current scenario

### Traffic Signal Controls (left panel)

- **🔴 RED** — Vehicles move, pedestrian waits
- **🟢 GREEN** — Vehicles stop, pedestrian may cross

### Scoring

| Event | Points |
|-------|--------|
| Start | 100 |
| Safe crossing | +50 |
| Phone distraction | -20 |
| Collision | -100 |

---

## 10. Troubleshooting

**`No module named 'agent_backend'`**
```bash
# You are inside agent_backend/ — go one level up
cd final_project
python -m flask --app agent_backend.server run --port=5000
```

**`three` not found / Vite errors**
```bash
cd final_project/traffic-sim
npm install
```

**Flask packages missing**
```bash
pip install flask flask-cors python-dotenv google-adk google-genai
```

**Agent panel shows dashes `—`**
- Check that the Flask backend is running on port 5000
- The simulation works with a built-in fallback even if the backend is offline

**Ambulance not appearing**
- The ambulance only spawns after the fall animation completes (~1.2 seconds after collision)
- It travels from z=-140 to z=4 — takes ~6 seconds to arrive

**Vehicles overlapping/merging into each other in a queue**
- Fixed — see [§11 Changelog](#11-changelog--vehicle-mergeoverlap-fix) below. If you still see this after pulling the latest `simulation.js`, do a hard refresh (`Ctrl+Shift+R`) to clear the cached Vite bundle.

---

## 11. Changelog — Vehicle Merge/Overlap Fix

**Symptom:** When several vehicles queued up at a red light or stop line (especially under **High** traffic density), trailing vehicles would visually clip into / overlap the car directly ahead instead of stacking neatly behind it — vehicles appeared to "merge" into one mass at the front of the queue.

**Root cause:** The old `_applyFollowingDistance()` logic in `src/simulation.js` only throttled vehicle **speed** based on the gap to the car ahead, and it re-checked that gap *after* every vehicle had already moved for the frame. Because several braking vehicles could close their gaps in the same frame (especially with bigger frame-time deltas or many cars queued under High density), a trailing vehicle's position could jump past the "hard stop" gap threshold before the check ever caught it — resulting in overlapping geometry.

**Fix (in `src/simulation.js`, function `_applyFollowingDistance`):**
1. Vehicles are now grouped **by lane** (`laneX` + `direction`) instead of being checked against every other car in the scene.
2. Each lane's vehicles are sorted **front-to-back** in travel order every frame, so each car is resolved relative to a lead vehicle whose position has already been finalized for that frame (no stale data, no order-of-evaluation bugs).
3. In addition to the existing smooth speed-based deceleration as a vehicle approaches the gap threshold, a **hard position clamp** was added: if the gap to the lead vehicle ever drops below `HARD_GAP` (2.0 units), the trailing vehicle's `z` position is snapped to exactly `HARD_GAP` behind the lead vehicle and its speed is forced to 0.
4. This guarantees **zero overlap** between queued vehicles regardless of frame rate, traffic density, deceleration rate, or how many vehicles are braking simultaneously — while preserving the existing exemption for the active collision vehicle in the Hazardous scenario (which still needs to drive freely toward the pedestrian).

**Result:** Vehicles now queue up cleanly, single-file, with consistent visible spacing in both the Safe and Hazardous scenarios, at any traffic density setting.

---

## Safety Education Messages

Displayed during the Hazardous Scenario countdown:

- *"Do not use mobile phones while crossing."*
- *"Always cross within the allotted time."*
- *"Stay alert and watch for traffic."*
- *"Only cross when the signal says WALK."*
- *"Distractions on roads can be fatal."*
- *"Cross quickly — never stop in the middle."*

---

## License

Educational demonstration project. Built with Google ADK, Gemini 2.5 Flash, Three.js, and Flask.
