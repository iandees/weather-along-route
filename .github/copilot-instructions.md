# Weather Along Route - Project Instructions

## Project Overview
A web app that displays weather forecasts along a driving route, showing conditions at hourly intervals based on estimated arrival times.

## Tech Stack
- **Backend**: Cloudflare Workers with Hono framework
- **Frontend**: Static HTML/CSS/JavaScript served via Cloudflare Assets
- **Map**: Leaflet.js for route visualization
- **APIs**: 
  - OpenRouteService for routing
  - Open-Meteo for weather forecasts

## Project Structure
```
/
├── src/
│   └── index.ts          # Hono API server
├── public/
│   ├── index.html        # Main page
│   ├── styles.css        # Styling
│   └── app.js            # Frontend logic
├── wrangler.toml         # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Development
- Run `npm run dev` to start local development server
- Run `npm run deploy` to deploy to Cloudflare Workers

## API Endpoints
- `GET /api/route` - Get route between two points
- `GET /api/weather` - Get weather for a location at a specific time
