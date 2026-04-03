#!/bin/bash
# Generate platform-specific icons from icon.svg
# Requires: imagemagick (convert) or inkscape

# PNG for Linux (multiple sizes for best compatibility)
for size in 16 32 48 64 128 256 512; do
  convert icon.svg -resize ${size}x${size} icon_${size}.png 2>/dev/null || \
  inkscape icon.svg -w $size -h $size -o icon_${size}.png 2>/dev/null
done

# Copy 256px as the main Linux icon
cp icon_256.png icon.png

# ICO for Windows (multi-resolution)
convert icon_16.png icon_32.png icon_48.png icon_64.png icon_128.png icon_256.png icon.ico 2>/dev/null

echo "Icons generated. Place icon.png and icon.ico in the build/ directory."
