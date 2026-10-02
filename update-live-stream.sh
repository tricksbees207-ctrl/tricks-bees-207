#!/bin/bash

cd "$HOME/Downloads/tricks-bees-207" || exit 1

CHANNEL_ID="UCD-mzqK0CLHLfCUwJZPh5jg"

NEW_ID=$(curl -s "https://www.youtube.com/feeds/videos.xml?channel_id=$CHANNEL_ID" \
  | grep -m1 '<yt:videoId>' \
  | sed 's/.*<yt:videoId>\(.*\)<\/yt:videoId>.*/\1/')

if [ -z "$NEW_ID" ]; then
  echo "Could not get a YouTube video ID. Website was not changed."
  exit 1
fi

CURRENT_ID=$(grep -o 'data-video-id="[^"]*"' index.html \
  | head -1 \
  | cut -d'"' -f2)

echo "Current website video: $CURRENT_ID"
echo "Newest YouTube video:  $NEW_ID"

if [ "$CURRENT_ID" = "$NEW_ID" ]; then
  echo "Already current. Nothing to change."
  exit 0
fi

cp index.html index-before-live-update.html

sed -i '' "s/$CURRENT_ID/$NEW_ID/g" index.html

echo "Updated Tricks Bees 207 to video: $NEW_ID"
