#!/bin/sh

# Start nginx
nginx -g 'daemon off;' &

# Run migrations explicitly
echo "Running migrations..."
./node_modules/.bin/typeorm migration:run -d ./dist/packages/backend/config/typeorm.js
echo "Migrations completed (exit code $?)"

# Start all applications defined in ecosystem.config.js
pm2-runtime ecosystem.config.js