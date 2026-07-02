#!/bin/bash
set -e

echo "=== Vibe Browser Build Script ==="
echo "Starting at: $(date)"

# System deps
echo "=== Installing system dependencies ==="
sudo apt-get update
sudo apt-get install -y python3 python3-pip yasm nasm build-essential \
  libgtk2.0-dev libpython3-dev m4 uuid libasound2-dev libcurl4-openssl-dev \
  libdbus-1-dev libdrm-dev libdbus-glib-1-dev libgtk-3-dev libpulse-dev \
  libx11-xcb-dev libxt-dev lld llvm clang libclang-dev \
  libc6-dev libstdc++-12-dev dos2unix xvfb

# Git config
git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"

# Env vars
export ZEN_RELEASE=1
export SURFER_COMPAT=x86_64
export SURFER_PLATFORM=linux
export ZEN_GA_DISABLE_PGO=true
export ZEN_RELEASE_BRANCH=release
export CARGO_TERM_COLOR=always
export CARGO_INCREMENTAL=0

# npm deps
echo "=== Installing npm deps ==="
npm ci

# Setup Surfer
echo "=== Setting up Surfer ==="
npm run surfer -- ci --brand release --display-version "1.0.0"

# Download Firefox engine
echo "=== Downloading Firefox engine ==="
npm run download

# Import patches
echo "=== Importing patches ==="
npm run import

# Language packs
echo "=== Building language packs ==="
sh scripts/download-language-packs.sh || true

# Fix Rust version
echo "=== Fixing Rust version ==="
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain $(cat .rust-toolchain)
export PATH="$HOME/.cargo/bin:$PATH"
rustup target add x86_64-unknown-linux-gnu

# Bootstrap via mach
echo "=== Bootstrap ==="
cd engine
./mach --no-interactive bootstrap --application-choice browser
cd ..

# Install cbindgen
echo "=== Installing cbindgen ==="
cargo install cbindgen --locked

# BUILD
echo "=== BUILDING VIBE BROWSER ==="
npm run build

# Package
echo "=== Packaging ==="
npm run package

echo "=== BUILD COMPLETE ==="
echo "Finished at: $(date)"
ls -la dist/
