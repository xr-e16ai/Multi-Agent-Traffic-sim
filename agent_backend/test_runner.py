from dotenv import load_dotenv
load_dotenv()

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part

from agent_backend.agent import root_agent

# Session Service
session_service = InMemorySessionService()

# Create Session
session = session_service.create_session_sync(
    app_name="traffic_app",
    user_id="user1"
)

# Runner
runner = Runner(
    agent=root_agent,
    app_name="traffic_app",
    session_service=session_service
)

# Traffic Input
message = Content(
    role="user",
    parts=[
        Part(
            text="""
Traffic light is RED.
Vehicle speed is 60 km/h.
Distance is 10m.
Weather is rainy.

Give traffic decision.
"""
        )
    ]
)

# Execute Agent
events = runner.run(
    user_id="user1",
    session_id=session.id,
    new_message=message
)

for event in events:
    print("EVENT:")
    print(event)
    print("--------------------------------")