#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Denial Doctor — One-Click GitHub Push + Vercel Deploy
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   ./deploy.sh              # Push to GitHub only
#   ./deploy.sh --vercel     # Push to GitHub + Deploy to Vercel
#   ./deploy.sh --vercel-only # Deploy to Vercel only (skip git push)
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Denial Doctor — Deploy Script                ║"
echo "║   AI-Powered Healthcare Denial Management           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

DEPLOY_VERCEL=false
VERCEL_ONLY=false

for arg in "$@"; do
  case $arg in
    --vercel) DEPLOY_VERCEL=true ;;
    --vercel-only) DEPLOY_VERCEL=true; VERCEL_ONLY=true ;;
  esac
done

# ─── STEP 1: Push to GitHub ─────────────────────────────────────────────────
if [ "$VERCEL_ONLY" = false ]; then
  echo -e "${YELLOW}[1/3] Pushing to GitHub...${NC}"

  # Check if gh CLI is installed
  if command -v gh &> /dev/null; then
    echo -e "  ${GREEN}✓ GitHub CLI found${NC}"

    # Check if authenticated
    if gh auth status &> /dev/null 2>&1; then
      echo -e "  ${GREEN}✓ GitHub CLI authenticated${NC}"
    else
      echo -e "  ${YELLOW}⚠ Not authenticated. Running 'gh auth login'...${NC}"
      gh auth login
    fi
  else
    echo -e "  ${YELLOW}⚠ GitHub CLI not found. Using git push directly.${NC}"
    echo -e "  ${YELLOW}  Make sure you have git credentials configured.${NC}"
    echo -e "  ${YELLOW}  Run: gh auth login  (install gh CLI first)${NC}"
  fi

  # Add all changes
  git add -A

  # Check if there are changes to commit
  if git diff --staged --quiet; then
    echo -e "  ${GREEN}✓ No new changes to commit${NC}"
  else
    # Commit
    git commit -m "deploy: update for production deployment $(date +%Y-%m-%d)"
    echo -e "  ${GREEN}✓ Changes committed${NC}"
  fi

  # Push
  git push origin main
  echo -e "  ${GREEN}✓ Pushed to GitHub${NC}"
  echo -e "  ${GREEN}  Repository: https://github.com/sriraajj-lab/denial-management${NC}"
else
  echo -e "${YELLOW}[1/3] Skipping GitHub push (--vercel-only)${NC}"
fi

# ─── STEP 2: Vercel Setup ──────────────────────────────────────────────────
if [ "$DEPLOY_VERCEL" = true ]; then
  echo -e "${YELLOW}[2/3] Setting up Vercel deployment...${NC}"

  # Check if Vercel CLI is installed
  if ! command -v vercel &> /dev/null && ! npx vercel --version &> /dev/null 2>&1; then
    echo -e "  ${RED}✗ Vercel CLI not found. Installing...${NC}"
    npm install -g vercel
  fi

  # Check if already linked to Vercel project
  if [ -d ".vercel" ] && [ -f ".vercel/project.json" ]; then
    echo -e "  ${GREEN}✓ Vercel project already linked${NC}"
  else
    echo -e "  ${YELLOW}⚠ Linking to Vercel project...${NC}"
    echo -e "  ${YELLOW}  Follow the prompts to create or link a project.${NC}"
    npx vercel link
  fi

  # ─── STEP 3: Deploy ─────────────────────────────────────────────────────
  echo -e "${YELLOW}[3/3] Deploying to Vercel...${NC}"

  # Deploy to production
  npx vercel --prod

  echo -e ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║         Deployment Complete!                        ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo -e ""
  echo -e "  ${GREEN}GitHub:${NC} https://github.com/sriraajj-lab/denial-management"
  echo -e "  ${GREEN}Vercel:${NC} Check your Vercel dashboard for the deployment URL"
  echo -e ""
  echo -e "  ${YELLOW}Important: Set environment variables in Vercel Dashboard → Settings → Environment Variables${NC}"
  echo -e "  See README.md for required environment variables."
else
  echo -e "${YELLOW}[2/3] Skipping Vercel deployment (use --vercel flag)${NC}"
  echo -e "${YELLOW}[3/3] Skipping Vercel deployment (use --vercel flag)${NC}"
  echo -e ""
  echo -e "${GREEN}✓ GitHub push complete!${NC}"
  echo -e "  To deploy to Vercel, run: ${BLUE}./deploy.sh --vercel${NC}"
fi
