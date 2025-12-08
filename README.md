# Weather Along Route

A web application that displays weather forecasts along a driving route, showing conditions at hourly intervals based on estimated arrival times.

## Features

- 🗺️ Enter starting and destination locations
- ⏰ Set your departure date and time
- 🛣️ View the driving route on an interactive map
- 🌤️ See weather forecasts at hourly intervals along your route
- 📍 Weather data is based on your estimated arrival time at each point
- ⏱️ Adjust departure time with a slider to find optimal conditions
- 🌙 Night driving indicators with sunrise/sunset awareness
- 📊 Weather scoring to identify best departure times

## Tech Stack

- **Hosting**: Cloudflare Workers (static assets only)
- **Frontend**: Static HTML/CSS/JavaScript
- **Map**: Leaflet.js for route visualization
- **External APIs** (called directly from browser):
  - [OSRM](https://router.project-osrm.org) for routing
  - [Nominatim](https://nominatim.openstreetmap.org) for geocoding
  - [Open-Meteo](https://open-meteo.com) for weather forecasts (free, no API key required)

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8787`

### Deploy

```bash
npm run deploy
```

## License

Apache 2.0
