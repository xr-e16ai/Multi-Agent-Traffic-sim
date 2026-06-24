from agent_backend.agent import root_agent
from google.adk import Runner
import traceback

def test():
    try:
        runner = Runner(agent=root_agent)
        # new_message takes a string or types.Content
        for event in runner.run(user_id="test_user", session_id="test_session", new_message="hello"):
            print("Event:", type(event), event)
    except Exception as e:
        traceback.print_exc()

if __name__ == "__main__":
    test()
