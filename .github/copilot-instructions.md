# Weather Along Route - Project Instructions

## Project Overview
A web app that displays weather forecasts along a driving route, showing conditions at hourly intervals based on estimated arrival times. Includes weather scoring, time adjustment to find optimal departure times, and night driving penalties.

## Tech Stack
- **Backend**: Cloudflare Workers with Hono framework
- **Frontend**: Static HTML/CSS/JavaScript served via Cloudflare Assets
- **Map**: Leaflet.js for route visualization
- **APIs**: 
  - OSRM for routing
  - Nominatim for geocoding
  - Open-Meteo for weather forecasts and sunrise/sunset data

## Project Structure
```
/
├── src/
│   └── index.ts          # Hono API server with route and weather endpoints
├── public/
│   ├── index.html        # Main page with form, time slider, map, weather cards
│   ├── styles.css        # Styling including night/alert states
│   └── app.js            # Frontend logic with weather scoring, night detection
├── wrangler.toml         # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Features
- Route display on interactive map
- Hourly weather waypoints along route
- Weather scoring (0-100) based on conditions
- Time adjustment slider (±24 hours) with gradient visualization
- "Best time" marker showing optimal departure
- Night driving penalties using actual sunrise/sunset data
- Imperial/Metric unit toggle
- Weather alerts for poor conditions

## Development
- Run `npm run dev` to start local development server
- Run `npm run deploy` to deploy to Cloudflare Workers

## API Endpoints
- `GET /api/route` - Get driving route between two points (proxies OSRM)
- `POST /api/weather/batch` - Get weather for multiple locations/times (includes sunrise/sunset)
