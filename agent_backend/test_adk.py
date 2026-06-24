# test_adk_run.py

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent_backend.agent import root_agent

session_service = InMemorySessionService()

runner = Runner(
    agent=root_agent,
    app_name="traffic_app",
    session_service=session_service
)

# create session
session_service.create_session_sync(
    app_name="traffic_app",
    user_id="test_user",
    session_id="test_session"
)

message = types.Content(
    role="user",
    parts=[
        types.Part(text="""
Traffic light is RED.
Vehicle speed is 60 km/h.
Distance is 10 m.
Weather is rainy.

Give traffic decision.
""")
    ]
)

events = runner.run(
    user_id="test_user",
    session_id="test_session",
    new_message=message
)

for event in events:
    print(event)