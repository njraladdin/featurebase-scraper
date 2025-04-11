@echo off
echo Starting local server for Featurebase Scraper website...
cd website
start "" http://localhost:8000
python -m http.server 8000 