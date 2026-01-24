import os
import sys

# Ensure we can import from the local directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from agent import create_willy_agent
    print("Step 1: Successfully imported create_willy_agent.")
    
    # Try to instantiate (will fail if google-adk is not installed, but good for structure check)
    try:
        willy = create_willy_agent()
        print(f"Step 2: Successfully created agent instance: {willy.name}")
    except ImportError:
        print("Step 2: Skipping instantiation (google-adk not installed in this environment yet).")
    except Exception as e:
        print(f"Step 2: Error during instantiation: {e}")

except Exception as e:
    print(f"Failed to import/run agent logic: {e}")

print("\nSetup check complete.")
