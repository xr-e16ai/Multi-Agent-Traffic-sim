from google.adk.agents import Agent

driver_agent = Agent(
    name="DriverAgent",
    model="gemini-2.5-flash",
    description="Vehicle behavior decision agent",

    instruction="""
You are a vehicle driving decision agent.

You receive the following inputs from the conversation context:
- traffic_light: RED or GREEN

CRITICAL SPEC RULES (follow exactly — no exceptions):

1. IF traffic_light is RED → vehicles=MOVE
   (Red light means pedestrians wait, so vehicles move freely)

2. IF traffic_light is GREEN → vehicles=STOP
   (Green light means pedestrians cross, so vehicles must stop)

Return ONLY valid JSON with no extra text, no markdown, no code blocks:

{"vehicles": "MOVE"}

or

{"vehicles": "STOP"}
"""
)
