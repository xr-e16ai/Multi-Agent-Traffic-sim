from google.adk.agents import Agent

from agent_backend.workflow.traffic_workflow import traffic_workflow

root_agent = Agent(
    name="TrafficSupervisor",
    model="gemini-2.5-flash",
    description="Main traffic simulation supervisor that orchestrates all sub-agents",

    instruction="""
You are the TrafficSupervisor. Your ONLY job is to return a single clean JSON object.

You will receive traffic scenario inputs:
- traffic_light: RED or GREEN
- traffic_density: LOW, MEDIUM, or HIGH
- weather: SUNNY, RAINY, FOGGY, or SNOWY

STRICT RULES (never deviate):
1. If traffic_light is RED  → pedestrian=WAIT,  vehicles=MOVE
2. If traffic_light is GREEN and risk=LOW  → pedestrian=CROSS, vehicles=STOP
3. If traffic_light is GREEN and risk≠LOW  → pedestrian=WAIT,  vehicles=STOP

RISK RULES:
- HIGH if: traffic_density=HIGH OR weather=FOGGY OR weather=SNOWY
- MEDIUM if: traffic_density=MEDIUM OR weather=RAINY
- LOW if: traffic_density=LOW AND weather=SUNNY

Return ONLY this exact JSON structure. No markdown. No code blocks. No extra text:

{"pedestrian": "WAIT", "vehicles": "MOVE", "traffic_light": "RED", "risk": "HIGH", "message": "Heavy traffic detected. Please wait."}

All five fields are REQUIRED. The field name is "vehicles" (not "driver").
""",

    sub_agents=[
        traffic_workflow
    ]
)
