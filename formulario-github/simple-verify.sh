#!/bin/bash
# Simple verification for our specific tables

if [ -f "./backend/.env" ]; then
    echo "📄 Loading credentials from backend/.env..."
    export $(grep -v '^#' ./backend/.env | xargs)
    HOST=$PGHOST
    PORT=$PGPORT
    DATABASE=$PGDATABASE
    USER=$PGUSER
else
    export PGPASSWORD="kSYfUUXCRhOPVPwztXwieXmYOGnmSlZD"
    HOST="centerbeam.proxy.rlwy.net"
    PORT="16594"
    DATABASE="railway"
    USER="postgres"
fi

echo "🔍 Checking if our tables exist..."

# Check for our specific tables
echo "📋 Looking for 'empresas' table:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "SELECT tablename FROM pg_tables WHERE tablename = 'empresas';"

echo -e "\n📋 Looking for 'questionarios' table:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "SELECT tablename FROM pg_tables WHERE tablename = 'questionarios';"

echo -e "\n📋 Looking for 'vw_dados_dashboard' view:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "SELECT viewname FROM pg_views WHERE viewname = 'vw_dados_dashboard';"

echo -e "\n📋 Count of records in our tables:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "SELECT 'empresas' as table_name, COUNT(*) as count FROM empresas UNION ALL SELECT 'questionarios' as table_name, COUNT(*) as count FROM questionarios;"