import os
from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from instruction import SYSTEM_INSTRUCTION

load_dotenv()

def create_willy_agent():
    # Use Gemini Flash for efficient but capable processing
    agent = LlmAgent(
        name="Willy",  # Use a valid identifier (no spaces)
        model="gemini-1.5-flash",
        instruction=SYSTEM_INSTRUCTION, # The correct field is 'instruction'
    )
    return agent

if __name__ == "__main__":
    willy = create_willy_agent()
    print(f"Agent '{willy.name}' initialized successfully.")
