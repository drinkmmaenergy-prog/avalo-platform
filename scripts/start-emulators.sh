#!/bin/bash

# Avalo Firebase Emulator Startup Script
# This script starts Firebase emulators with Docker support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="avalo-demo"
DOCKER_MODE=false
DETACHED=false
IMPORT_DATA=false
EXPORT_DATA=false
DATA_DIR=".firebase-data"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --docker)
      DOCKER_MODE=true
      shift
      ;;
    -d|--detach)
      DETACHED=true
      shift
      ;;
    --import)
      IMPORT_DATA=true
      shift
      ;;
    --export)
      EXPORT_DATA=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --docker       Run emulators in Docker container"
      echo "  -d, --detach   Run in detached mode (background)"
      echo "  --import       Import data from $DATA_DIR"
      echo "  --export       Export data to $DATA_DIR on exit"
      echo "  --help         Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Avalo Firebase Emulator Suite           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker mode is requested
if [ "$DOCKER_MODE" = true ]; then
  echo -e "${YELLOW}Starting emulators in Docker mode...${NC}"
  
  # Check if Docker is installed
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
  fi
  
  # Check if docker-compose is installed
  if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    exit 1
  fi
  
  # Start Docker containers
  if [ "$DETACHED" = true ]; then
    docker-compose -f docker-compose.emulators.yml up -d
  else
    docker-compose -f docker-compose.emulators.yml up
  fi
  
  exit 0
fi

# Native mode (without Docker)
echo -e "${YELLOW}Starting emulators in native mode...${NC}"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
  echo -e "${RED}Error: Firebase CLI is not installed${NC}"
  echo -e "${YELLOW}Install it with: npm install -g firebase-tools${NC}"
  exit 1
fi

# Check if firebase.json exists
if [ ! -f "firebase.json" ]; then
  echo -e "${RED}Error: firebase.json not found${NC}"
  echo -e "${YELLOW}Please run this script from the project root${NC}"
  exit 1
fi

# Build Firebase Functions if needed
if [ -d "functions" ]; then
  echo -e "${YELLOW}Building Firebase Functions...${NC}"
  cd functions
  if [ -f "package.json" ]; then
    npm run build
  fi
  cd ..
fi

# Prepare emulator command
EMULATOR_CMD="firebase emulators:start --project=$PROJECT_NAME"

if [ "$IMPORT_DATA" = true ] && [ -d "$DATA_DIR" ]; then
  EMULATOR_CMD="$EMULATOR_CMD --import=$DATA_DIR"
  echo -e "${GREEN}Importing data from $DATA_DIR${NC}"
fi

if [ "$EXPORT_DATA" = true ]; then
  EMULATOR_CMD="$EMULATOR_CMD --export-on-exit=$DATA_DIR"
  echo -e "${GREEN}Data will be exported to $DATA_DIR on exit${NC}"
fi

echo ""
echo -e "${GREEN}Starting Firebase Emulators...${NC}"
echo ""
echo -e "${BLUE}Emulator UI:${NC}       http://localhost:4000"
echo -e "${BLUE}Auth:${NC}              http://localhost:9099"
echo -e "${BLUE}Firestore:${NC}         http://localhost:8080"
echo -e "${BLUE}Functions:${NC}         http://localhost:5001"
echo -e "${BLUE}Storage:${NC}           http://localhost:9199"
echo -e "${BLUE}PubSub:${NC}            http://localhost:8085"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the emulators${NC}"
echo ""

# Run emulators
if [ "$DETACHED" = true ]; then
  nohup $EMULATOR_CMD > emulators.log 2>&1 &
  EMULATOR_PID=$!
  echo $EMULATOR_PID > .emulator.pid
  echo -e "${GREEN}Emulators started in background (PID: $EMULATOR_PID)${NC}"
  echo -e "${YELLOW}Logs: tail -f emulators.log${NC}"
  echo -e "${YELLOW}Stop: kill \$(cat .emulator.pid)${NC}"
else
  $EMULATOR_CMD
fi