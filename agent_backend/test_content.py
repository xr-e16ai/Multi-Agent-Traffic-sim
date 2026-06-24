# test_session_create.py

from google.adk.sessions import InMemorySessionService

service = InMemorySessionService()

print(service)

print(dir(service))