# Simple script to check .env loading for Azure Cognitive Services credentials
import os
from dotenv import load_dotenv

# Load .env from the current directory
load_dotenv()

key = os.getenv('AZURE_TEXT_ANALYTICS_KEY')
endpoint = os.getenv('AZURE_TEXT_ANALYTICS_ENDPOINT')

print(f"AZURE_TEXT_ANALYTICS_KEY loaded: {bool(key)}")
print(f"AZURE_TEXT_ANALYTICS_ENDPOINT: {endpoint}")
