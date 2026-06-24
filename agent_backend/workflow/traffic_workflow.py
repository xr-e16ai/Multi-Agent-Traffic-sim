from google.adk.agents import SequentialAgent

from agent_backend.agents.safety_agent import safety_agent
from agent_backend.agents.pedestrian_agent import pedestrian_agent
from agent_backend.agents.driver_agent import driver_agent
from agent_backend.agents.traffic_light_agent import traffic_light_agent

# Order matters: Safety first (others depend on risk level),
# then Pedestrian, then Driver (depends on pedestrian), then TrafficLight (depends on both)
traffic_workflow = SequentialAgent(
    name="TrafficWorkflow",
    description="Sequential pipeline: Safety → Pedestrian → Driver → TrafficLight",
    sub_agents=[
        safety_agent,
        pedestrian_agent,
        driver_agent,
        traffic_light_agent
    ]
)