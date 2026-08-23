#!/bin/bash
# Quick Start Script for Schedule Builder

echo "🎉 Schedule Builder - Quick Start"
echo "=================================="
echo ""
echo "This script will guide you through starting the application."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL connection..."
if ! psql -V &> /dev/null; then
    echo "❌ PostgreSQL client not found. Please install PostgreSQL."
    echo "   Visit: https://www.postgresql.org/download/"
    exit 1
fi

echo "✅ PostgreSQL client found: $(psql -V)"
echo ""

# Create database
echo "📊 Setting up database..."
createdb schedule_builder 2>/dev/null || echo "   (Database may already exist)"

# Load schema
echo "📋 Loading database schema..."
psql schedule_builder < backend/db/schema.sql || echo "   (Schema may already be loaded)"

# Load sample data
echo "📚 Loading sample data..."
psql schedule_builder < backend/db/seed.sql || echo "   (Sample data may already be loaded)"

echo ""
echo "=================================="
echo "✅ Database Setup Complete!"
echo "=================================="
echo ""

# Display instructions
echo "🚀 To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  npm start"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:5173"
echo ""
echo "=================================="
echo "📚 Documentation:"
echo "  - README.md (overview)"
echo "  - SETUP.md (detailed setup)"
echo "  - QUICK_REFERENCE.md (commands)"
echo "  - START_HERE.md (quick guide)"
echo "=================================="
