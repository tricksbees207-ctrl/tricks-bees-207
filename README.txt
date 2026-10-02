TRICKS BEES 207 — WORKING WEBSITE

This is the cleaned, maintainable project structure.

index.html
    Main homepage structure.

css/style.css
    Colors, typography, layout, cards, weather, dashboard, responsive design.

js/hive-data.js
    Current demo hive values, hive selector, and weight-history chart.
    Later this file can be connected to real sensor data.

js/weather.js
    Live Ellsworth-area weather from the U.S. National Weather Service
    and the weather-based Bee Flight Conditions guide.

images/
    Future logo, photographs, camera stills, and graphics.

research/
    Future research summaries, figures, and downloadable materials.

TEST LOCALLY
From Terminal:
    cd ~/Downloads/tricks-bees-207
    python3 -m http.server 8000

Then open:
    http://localhost:8000

The visual design is intended to match the previously approved current build.

CONTENT UPDATE
- Added a late-September Maine "What's Happening Now" section.
- Expanded Forage Watch with goldenrod, asters, and autumn dandelion.
- Seasonal text is intentionally framed as a guide rather than live hive observation.
