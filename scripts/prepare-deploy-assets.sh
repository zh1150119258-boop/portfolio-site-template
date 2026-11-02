#!/usr/bin/env bash
set -euo pipefail

# Videos are served from the media CDN. Keep the Worker asset bundle to the UI
# files, posters, and images so a deploy cannot mix stale assets with a new app.
rsync -a --delete \
  --exclude='*.mp4' \
  --exclude='*.m4v' \
  --exclude='*.mov' \
  --exclude='*.webm' \
  --exclude='.DS_Store' \
  dist/client/ dist/client-deploy/
