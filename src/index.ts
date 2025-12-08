import { Hono } from 'hono';
import { cors } from 'hono/cors';

const USER_AGENT = 'WeatherAlongRoute/1.0 (https://github.com/iandees/weather-along-route)';

// Helper function to make fetch requests with proper User-Agent
function fetchWithUserAgent(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers,
    },
  });
}

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS - only allow requests from our custom domain
app.use('/api/*', cors({
  origin: 'https://weatheralongroute.mapki.com',
}));

// Route API - Get driving route between two points
app.get('/api/route', async (c) => {
  const start = c.req.query('start'); // "lng,lat"
  const end = c.req.query('end'); // "lng,lat"

  if (!start || !end) {
    return c.json({ error: 'Missing start or end coordinates' }, 400);
  }

  try {
    // Using OpenRouteService API (free, no API key required for limited use)
    const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;

    const response = await fetchWithUserAgent(url);
    const data = await response.json() as {
      code: string;
      routes: Array<{
        geometry: { coordinates: number[][] };
        duration: number;
        distance: number;
        legs: Array<{
          steps: Array<{
            distance: number;
            duration: number;
            geometry: { coordinates: number[][] };
          }>;
        }>;
      }>;
    };

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return c.json({ error: 'No route found' }, 404);
    }

    const route = data.routes[0];

    return c.json({
      geometry: route.geometry,
      duration: route.duration, // in seconds
      distance: route.distance, // in meters
      legs: route.legs
    });
  } catch (error) {
    console.error('Route API error:', error);
    return c.json({ error: 'Failed to fetch route' }, 500);
  }
});

export default app;
