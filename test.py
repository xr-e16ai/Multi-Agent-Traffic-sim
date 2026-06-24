from agent_backend.agent import root_agent
import asyncio

async def test():
    try:
        async for e in root_agent.run(node_input='hello'):
            print(e)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
