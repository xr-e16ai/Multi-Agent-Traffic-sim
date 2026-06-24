from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

import json, re, os, time

load_dotenv()

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from agent_backend.agent import root_agent

app = Flask(__name__)
CORS(app)

# ─── ADK Session Setup ────────────────────────────────────────────────────────

session_service = InMemorySessionService()
session = session_service.create_session_sync(app_name="traffic_app", user_id="web_user")
runner  = Runner(agent=root_agent, app_name="traffic_app", session_service=session_service)

# ─── Deterministic Rule Engine ────────────────────────────────────────────────
#
# PEDESTRIAN RULE (final):
#   GREEN                →  CROSS   (weather and density are irrelevant)
#   RED                  →  WAIT
#
# VEHICLE RULE:
#   RED   →  MOVE
#   GREEN →  STOP   (regardless of density)
#
# RISK:
#   HIGH   if density=HIGH
#   MEDIUM if density=MEDIUM
#   LOW    if density=LOW
#   (weather does NOT affect risk or crossing decision)
#
# ─────────────────────────────────────────────────────────────────────────────

def deterministic_decision(traffic_light: str, traffic_density: str, weather: str) -> dict:

    # ── Risk — based solely on density ───────────────────────────────────────
    if traffic_density == "HIGH":
        risk    = "HIGH"
        message = "Heavy traffic. Pedestrian must wait."
    elif traffic_density == "MEDIUM":
        risk    = "MEDIUM"
        message = "Moderate traffic. Pedestrian must wait."
    else:                              # LOW
        risk    = "LOW"
        message = "Low traffic. Safe to cross."

    # ── Pedestrian: GREEN → CROSS (weather and density ignored) ────────────
    if traffic_light == "GREEN":
        pedestrian = "CROSS"
    else:
        pedestrian = "WAIT"

    # ── Vehicles ──────────────────────────────────────────────────────────────
    vehicles = "STOP" if traffic_light == "GREEN" else "MOVE"

    return {
        "pedestrian":    pedestrian,
        "vehicles":      vehicles,
        "traffic_light": traffic_light,
        "risk":          risk,
        "message":       message,
        "source":        "fallback"
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$',         '', text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"No valid JSON in: {text[:200]}")


def map_density(raw: str) -> str:
    return {"Low":"LOW","low":"LOW","Normal":"MEDIUM","normal":"MEDIUM",
            "Medium":"MEDIUM","medium":"MEDIUM","High":"HIGH","high":"HIGH",
            "LOW":"LOW","MEDIUM":"MEDIUM","HIGH":"HIGH"}.get(raw, "MEDIUM")


def map_weather(raw: str) -> str:
    return {"Sunny":"SUNNY","sunny":"SUNNY","SUNNY":"SUNNY",
            "Rain":"RAINY","rain":"RAINY","Rainy":"RAINY","rainy":"RAINY","RAINY":"RAINY",
            "Snow":"SNOWY","snow":"SNOWY","Snowy":"SNOWY","snowy":"SNOWY","SNOWY":"SNOWY",
            "Foggy":"FOGGY","foggy":"FOGGY","FOGGY":"FOGGY"}.get(raw, "SUNNY")


# ─── API Endpoint ─────────────────────────────────────────────────────────────

@app.route("/traffic-decision", methods=["POST"])
def traffic_decision():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON received"}), 400

        traffic_light   = data.get("traffic_light",   "RED").upper()
        traffic_density = map_density(data.get("traffic_density", "MEDIUM"))
        weather         = map_weather(data.get("weather",         "SUNNY"))

        print(f"\n[INPUT] light={traffic_light}  density={traffic_density}  weather={weather}")

        # ── ADK / Gemini prompt — final rule: GREEN + LOW density → CROSS ──────
        prompt = f"""You are the TrafficSupervisor. Analyze and return a traffic decision.

Traffic light:   {traffic_light}
Traffic density: {traffic_density}
Weather:         {weather}

RULES (follow exactly — no exceptions):

1. Risk assessment (based on density only — weather does NOT affect risk):
   - HIGH   if density=HIGH
   - MEDIUM if density=MEDIUM
   - LOW    if density=LOW

2. Pedestrian (weather and density do NOT affect this decision):
   - CROSS  if traffic_light=GREEN
   - WAIT   if traffic_light=RED

3. Vehicles:
   - STOP  if traffic_light=GREEN
   - MOVE  if traffic_light=RED

4. traffic_light in response must always equal the input ({traffic_light}).

Return ONLY this JSON (no markdown, no extra text):
{{"pedestrian": "WAIT or CROSS", "vehicles": "MOVE or STOP", "traffic_light": "{traffic_light}", "risk": "LOW or MEDIUM or HIGH", "message": "brief 1-sentence status"}}
"""

        message_content = Content(role="user", parts=[Part(text=prompt)])
        decision    = None
        adk_error   = None

        try:
            events     = runner.run(user_id="web_user", session_id=session.id, new_message=message_content)
            final_text = None

            for event in events:
                if hasattr(event, "content") and event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            final_text = part.text

            if final_text:
                parsed = extract_json(final_text)
                if "driver" in parsed and "vehicles" not in parsed:
                    parsed["vehicles"] = parsed.pop("driver")
                decision           = parsed
                decision["source"] = "adk"
                print(f"[ADK]  {decision}")
            else:
                adk_error = "No text in ADK response"

        except Exception as e:
            adk_error = str(e)
            print(f"[ADK]  Error: {adk_error[:120]}")

        # ── Spec enforcement — correct any ADK mistakes ────────────────────
        if decision is not None:
            risk = decision.get("risk", "LOW").upper()

            # Spec: Vehicle rule
            if traffic_light == "RED" and decision.get("vehicles","").upper() != "MOVE":
                print("[SPEC FIX] RED→vehicles must be MOVE")
                decision["vehicles"]   = "MOVE"
                decision["pedestrian"] = "WAIT"

            if traffic_light == "GREEN" and decision.get("vehicles","").upper() != "STOP":
                print("[SPEC FIX] GREEN→vehicles must be STOP")
                decision["vehicles"] = "STOP"

            # Spec: Pedestrian rule — GREEN → CROSS, weather and density ignored
            if traffic_light == "GREEN":
                if decision.get("pedestrian","").upper() != "CROSS":
                    print(f"[SPEC FIX] GREEN→pedestrian must be CROSS")
                    decision["pedestrian"] = "CROSS"

            if traffic_light == "RED":
                if decision.get("pedestrian","").upper() != "WAIT":
                    print("[SPEC FIX] RED→pedestrian must be WAIT")
                    decision["pedestrian"] = "WAIT"

        # ── Deterministic fallback if ADK failed ──────────────────────────
        if decision is None:
            print("[FALLBACK] Using deterministic rules")
            decision = deterministic_decision(traffic_light, traffic_density, weather)
            if adk_error:
                decision["adk_error"] = adk_error[:200]

        # ── Ensure required fields & normalise ────────────────────────────
        decision.setdefault("pedestrian",    "WAIT")
        decision.setdefault("vehicles",      "MOVE")
        decision.setdefault("traffic_light", traffic_light)
        decision.setdefault("risk",          "MEDIUM")
        decision.setdefault("message",       "Awaiting assessment.")

        decision["pedestrian"]    = decision["pedestrian"].upper()
        decision["vehicles"]      = decision["vehicles"].upper()
        decision["traffic_light"] = decision["traffic_light"].upper()
        decision["risk"]          = decision["risk"].upper()

        print(f"[FINAL] {decision}\n")
        return jsonify(decision)

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
