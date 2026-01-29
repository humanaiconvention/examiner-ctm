import os
import sys
from dotenv import load_dotenv

# Ensure we can import the agent logic
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from agent import create_willy_agent
except ImportError:
    print("Error: Could not import agent. Make sure google-adk is installed.")
    sys.exit(1)

def run_cli():
    # Load environment variables (API Key)
    load_dotenv()
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY not found in .env file.")
        print("Please copy .env.example to .env and add your key.")
        return

    print("--- Willy Website Manager Launching ---")
    willy = create_willy_agent()
    print("Logged in as Willy. How can I help refine the research impact of our site?")
    print("(Type 'exit' to quit)\n")

    while True:
        user_input = input("You: ")
        if user_input.lower() in ["exit", "quit"]:
            break
        
        # In a real ADK setup, you'd use agent.run() or equivalent
        # For this CLI, we'll simulate the interaction loop
        try:
            # Assuming standard ADK agent behavior for response generation
            response = willy.run(user_input) # Note: Actual method may vary based on exact ADK version
            print(f"\nWilly: {response}\n")
        except Exception as e:
            print(f"Error communicating with Willy: {e}")

if __name__ == "__main__":
    run_cli()
