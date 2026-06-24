from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import json
import os

from google import genai

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

# Import agents ONLY ONCE
from agent import root_agent
from agent_backend.agents.pedestrian_agent import pedestrian_agent
from agent_backend.agents.driver_agent import driver_agent
from agent_backend.agents.traffic_light_agent import traffic_light_agent
from agent_backend.agents.safety_agent import safety_agent

app = Flask(__name__)
CORS(app)

@app.route('/traffic-decision', methods=['POST'])
def traffic_decision():

    data = request.json

    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    prompt = f"""
    Current Traffic Situation:
    - Traffic Light: {data.get('light', 'UNKNOWN')}
    - Vehicle Speed: {data.get('speed', 0)} km/h
    - Distance to Crossing: {data.get('distance', 0)} m
    - Weather: {data.get('weather', 'UNKNOWN')}
    - Temperature: {data.get('temperature', 0)} C
    """

    try:

        client = genai.Client()

        full_instruction = f"""
        {root_agent.instruction}

        Pedestrian Agent:
        {pedestrian_agent.instruction}

        Driver Agent:
        {driver_agent.instruction}

        Traffic Light Agent:
        {traffic_light_agent.instruction}

        Safety Agent:
        {safety_agent.instruction}
        """

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=full_instruction
            )
        )

        text = response.text.strip()

        if text.startswith("```json"):
            text = text[7:]

        if text.startswith("```"):
            text = text[3:]

        if text.endswith("```"):
            text = text[:-3]

        decision = json.loads(text.strip())

        return jsonify(decision)

    except json.JSONDecodeError:

        print("RAW RESPONSE:")
        print(response.text)

        return jsonify({
            "error": "Invalid JSON returned",
            "raw": response.text
        }), 500

    except Exception as e:

        import traceback
        traceback.print_exc()

        return jsonify({
            "error": str(e)
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)