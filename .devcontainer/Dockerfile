FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0-18-bullseye

# Install Python and tools
RUN sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip build-essential git curl

# Install some global npm tools if desired
RUN npm install -g pnpm

# Create post-create script
