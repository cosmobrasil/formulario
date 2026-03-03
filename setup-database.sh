#!/bin/bash
# Test PostgreSQL connection and execute schema

echo "🚀 Testing PostgreSQL connection for Questionário 2026..."

# Database credentials
if [ -f "./backend/.env" ]; then
    echo "📄 Loading credentials from backend/.env..."
    export $(grep -v '^#' ./backend/.env | xargs)
    HOST=$PGHOST
    PORT=$PGPORT
    DATABASE=$PGDATABASE
    USER=$PGUSER
else
    # Fallback to hardcoded for testing only if .env is missing
    export PGPASSWORD="kSYfUUXCRhOPVPwztXwieXmYOGnmSlZD"
    HOST="centerbeam.proxy.rlwy.net"
    PORT="16594"
    DATABASE="railway"
    USER="postgres"
fi

# Test connection
echo "🔌 Testing database connection..."
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "SELECT version();" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful!"
    
    # Execute schema
    echo "📋 Executing database schema..."
    psql -h $HOST -p $PORT -U $USER -d $DATABASE -f "./backend/database/schema.sql"
    
    if [ $? -eq 0 ]; then
        echo "✅ Schema executed successfully!"
        echo "🎉 PostgreSQL setup complete for 2026 version"
    else
        echo "❌ Error executing schema"
        exit 1
    fi
else
    echo "❌ Database connection failed"
    echo "Please check your credentials and network connection"
    exit 1
fi