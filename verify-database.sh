#!/bin/bash
# Verify database structure

export PGPASSWORD="kSYfUUXCRhOPVPwztXwieXmYOGnmSlZD"
HOST="centerbeam.proxy.rlwy.net"
PORT="16594"
DATABASE="railway"
USER="postgres"

echo "🔍 Verifying database structure..."

# Check if tables exist
echo "📋 Checking tables..."
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "\dt"

# Check table structure
echo -e "\n🏢 Table 'empresas' structure:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "\d empresas"

echo -e "\n📝 Table 'questionarios' structure:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "\d questionarios"

# Check indexes
echo -e "\n.CreateIndexes:"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "\di"

# Check view
echo -e "\n👀 View 'vw_dados_dashboard':"
psql -h $HOST -p $PORT -U $USER -d $DATABASE -c "\dv"