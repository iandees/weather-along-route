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

// Weather API - Get weather forecast for a location at a specific time
app.get('/api/weather', async (c) => {
  const lat = c.req.query('lat');
  const lng = c.req.query('lng');
  const datetime = c.req.query('datetime'); // ISO 8601 format

  if (!lat || !lng || !datetime) {
    return c.json({ error: 'Missing lat, lng, or datetime' }, 400);
  }

  try {
    // Parse the datetime to get date and hour
    const date = new Date(datetime);
    const dateStr = date.toISOString().split('T')[0];

    // Using Open-Meteo API (free, no API key required)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

    const response = await fetchWithUserAgent(url);
    const data = await response.json() as {
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        precipitation: number[];
        weather_code: number[];
        wind_speed_10m: number[];
      };
      hourly_units: {
        temperature_2m: string;
        precipitation: string;
        wind_speed_10m: string;
      };
    };

    // Find the closest hour in the forecast
    const targetHour = date.getHours();
    const hourlyData = data.hourly;

    // Get weather for the target hour
    const weather = {
      time: hourlyData.time[targetHour],
      temperature: hourlyData.temperature_2m[targetHour],
      temperatureUnit: data.hourly_units.temperature_2m,
      precipitationProbability: hourlyData.precipitation_probability[targetHour],
      precipitation: hourlyData.precipitation[targetHour],
      precipitationUnit: data.hourly_units.precipitation,
      weatherCode: hourlyData.weather_code[targetHour],
      windSpeed: hourlyData.wind_speed_10m[targetHour],
      windSpeedUnit: data.hourly_units.wind_speed_10m,
      description: getWeatherDescription(hourlyData.weather_code[targetHour])
    };

    return c.json(weather);
  } catch (error) {
    console.error('Weather API error:', error);
    return c.json({ error: 'Failed to fetch weather' }, 500);
  }
});

// Batch weather API - Get weather for multiple points with 48-hour forecast window
app.post('/api/weather/batch', async (c) => {
  const body = await c.req.json() as Array<{ lat: number; lng: number; datetime: string }>;

  if (!Array.isArray(body)) {
    return c.json({ error: 'Request body must be an array' }, 400);
  }

  try {
    const weatherPromises = body.map(async (point) => {
      const date = new Date(point.datetime);
      // Get date range: 1 day before to 2 days after for 48-hour adjustment window
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 2);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=sunrise,sunset&start_date=${startDateStr}&end_date=${endDateStr}&timezone=auto`;

      const response = await fetchWithUserAgent(url);
      const data = await response.json() as {
        hourly: {
          time: string[];
          temperature_2m: number[];
          precipitation_probability: number[];
          precipitation: number[];
          weather_code: number[];
          wind_speed_10m: number[];
        };
        hourly_units: {
          temperature_2m: string;
          precipitation: string;
          wind_speed_10m: string;
        };
        daily: {
          time: string[];
          sunrise: string[];
          sunset: string[];
        };
      };

      // Return the full hourly forecast data for client-side time adjustment
      return {
        lat: point.lat,
        lng: point.lng,
        baseDateTime: point.datetime,
        hourlyForecast: data.hourly.time.map((time, i) => ({
          time,
          temperature: data.hourly.temperature_2m[i],
          precipitationProbability: data.hourly.precipitation_probability[i],
          precipitation: data.hourly.precipitation[i],
          weatherCode: data.hourly.weather_code[i],
          windSpeed: data.hourly.wind_speed_10m[i],
          description: getWeatherDescription(data.hourly.weather_code[i])
        })),
        dailySunTimes: data.daily.time.map((date, i) => ({
          date,
          sunrise: data.daily.sunrise[i],
          sunset: data.daily.sunset[i]
        })),
        units: {
          temperature: data.hourly_units.temperature_2m,
          precipitation: data.hourly_units.precipitation,
          windSpeed: data.hourly_units.wind_speed_10m
        }
      };
    });

    const results = await Promise.all(weatherPromises);
    return c.json(results);
  } catch (error) {
    console.error('Batch weather API error:', error);
    return c.json({ error: 'Failed to fetch weather data' }, 500);
  }
});

// WMO Weather interpretation codes
function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  return descriptions[code] || 'Unknown';
}

export default app;
