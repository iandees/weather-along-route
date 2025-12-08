# Weather Along Route

A web application that displays weather forecasts along a driving route, showing conditions at hourly intervals based on estimated arrival times.

## Features

- 🗺️ Enter starting and destination locations
- ⏰ Set your departure date and time
- 🛣️ View the driving route on an interactive map
- 🌤️ See weather forecasts at hourly intervals along your route
- 📍 Weather data is based on your estimated arrival time at each point

## Tech Stack

- **Backend**: Cloudflare Workers with Hono framework
- **Frontend**: Static HTML/CSS/JavaScript served via Cloudflare Assets
- **Map**: Leaflet.js for route visualization
- **APIs**:
  - OSRM for routing
  - Nominatim for geocoding
  - Open-Meteo for weather forecasts (free, no API key required)

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

## API Endpoints

### GET /api/route

Get driving route between two points.

**Query Parameters:**
- `start` - Starting coordinates as `lng,lat`
- `end` - Ending coordinates as `lng,lat`

**Response:**
```json
{
  "geometry": { "coordinates": [...] },
  "duration": 3600,
  "distance": 50000
}
```

### GET /api/weather

Get weather forecast for a specific location and time.

**Query Parameters:**
- `lat` - Latitude
- `lng` - Longitude
- `datetime` - ISO 8601 datetime string

### POST /api/weather/batch

Get weather for multiple points at once.

**Request Body:**
```json
[
  { "lat": 40.7128, "lng": -74.0060, "datetime": "2024-01-15T14:00:00Z" }
]
```

## License

MIT
