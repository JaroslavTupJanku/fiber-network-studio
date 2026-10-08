#!/bin/sh
set -eu
if [ "${FNS_DEMO_SEED:-0}" = "1" ]; then
  # This path is the dedicated Compose volume, never a configurable customer data directory.
  if [ -z "$(ls -A /app/App_Data)" ]; then
    echo 'Preparing fictional demo network in the empty demo volume.'
    # A failed first copy is detected on the next start instead of serving an incomplete fixture.
    touch /app/App_Data/.demo-seeding
    cp /app/Demo_Data/*.json /app/App_Data/
    rm /app/App_Data/.demo-seeding
  elif [ -f /app/App_Data/.demo-seeding ]; then
    echo 'Demo initialization was interrupted. Restore the dedicated demo volume using the documented reset command.' >&2
    exit 1
  else
    echo 'Keeping the existing demo data and saved changes.'
  fi
fi
exec dotnet /app/FiberNetworkStudio.Api.dll "$@"
