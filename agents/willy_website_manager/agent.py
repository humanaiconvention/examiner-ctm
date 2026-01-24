import os
from dotenv import load_dotenv
from google_adk import LlmAgent
from instruction import SYSTEM_INSTRUCTION

load_dotenv()

def create_willy_agent():
    # Use Gemini Flash for efficient but capable processing
    agent = LlmAgent(
        name="Willy Website Manager",
        model="gemini-1.5-flash",
        system_instruction=SYSTEM_INSTRUCTION,
    )
    return agent

if __name__ == "__main__":
    willy = create_willy_agent()
    print(f"Agent '{willy.name}' initialized successfully.")
