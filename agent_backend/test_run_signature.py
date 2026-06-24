# test_run_signature.py

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from agent_backend.agent import root_agent

runner = Runner(
    agent=root_agent,
    app_name="traffic_app",
    session_service=InMemorySessionService()
)

import inspect

print(inspect.signature(runner.run))