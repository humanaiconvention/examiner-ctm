import os
import sys
import asyncio
from dotenv import load_dotenv
from google.adk.runners import InMemoryRunner
from google.genai import types

# Ensure we can import the agent logic
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from agent import create_willy_agent
except ImportError as e:
    print(f"Error: Could not import agent. Details: {e}")
    sys.exit(1)

async def run_cli():
    # Load environment variables (API Key)
    load_dotenv()
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY not found in .env file.")
        print("Please copy .env.example to .env and add your key.")
        return

    print("--- Willy Website Manager Launching ---")
    willy = create_willy_agent()
    
    # Initialize the Runner with our agent
    runner = InMemoryRunner(agent=willy)
    
    print("Logged in as Willy. How can I help refine the research impact of our site?")
    print("(Type 'exit' to quit)\n")

    while True:
        try:
            user_input = input("You: ")
            if user_input.lower() in ["exit", "quit"]:
                break
            
            # Use run_debug for a quick and formatted CLI interaction
            # This handles the conversation history internally within the session
            await runner.run_debug(
                user_input,
                quiet=True, # We'll handle the printing to match the requested style
                user_id="researcher",
                session_id="willy_session"
            )
            
            # Since run_debug prints if quiet=False, let's see how we can get the text.
            # Actually, run_debug returns the events. The last event is usually the response.
            events = await runner.session_service.get_events(
                app_name=runner.app_name,
                user_id="researcher",
                session_id="willy_session"
            )
            
            # Filter for the last agent message
            agent_msgs = [e for e in events if e.author == willy.name and e.content]
            if agent_msgs:
                last_msg = agent_msgs[-1]
                response_text = ""
                for part in last_msg.content.parts:
                    if part.text:
                        response_text += part.text
                print(f"\nWilly: {response_text}\n")
            else:
                print("\nWilly: (No response generated)\n")
                
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error communicating with Willy: {e}")

if __name__ == "__main__":
    asyncio.run(run_cli())
