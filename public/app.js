// Initialize the map
const map = L.map('map').setView([39.8283, -98.5795], 4); // Center of US

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Temperature unit preference
let temperatureUnit = 'fahrenheit';

// Store route data for time adjustments
let currentWaypoints = [];
let currentWeatherData = [];
let baseStartTime = null;
let timeOffset = 0;

// Toggle button handlers
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        temperatureUnit = btn.dataset.unit;
        // Re-render weather with new unit
        if (currentWaypoints.length > 0) {
            updateWeatherDisplay();
        }
    });
});

// Time slider handler
const timeSlider = document.getElementById('time-slider');
const adjustedTimeDisplay = document.getElementById('adjusted-time');

timeSlider.addEventListener('input', () => {
    timeOffset = parseInt(timeSlider.value);
    updateWeatherDisplay();
});

// Get weather for a specific time from hourly forecast data
function getWeatherForTime(weatherPoint, targetTime) {
    const targetISO = targetTime.toISOString();
    const targetHour = targetTime.getUTCHours();
    const targetDate = targetTime.toISOString().split('T')[0];

    // Find the matching hour in the forecast
    for (const forecast of weatherPoint.hourlyForecast) {
        const forecastDate = forecast.time.split('T')[0];
        const forecastHour = parseInt(forecast.time.split('T')[1].split(':')[0]);

        if (forecastDate === targetDate && forecastHour === targetHour) {
            return forecast;
        }
    }

    // If exact match not found, find closest
    const targetTimestamp = targetTime.getTime();
    let closest = weatherPoint.hourlyForecast[0];
    let closestDiff = Math.abs(new Date(closest.time).getTime() - targetTimestamp);

    for (const forecast of weatherPoint.hourlyForecast) {
        const diff = Math.abs(new Date(forecast.time).getTime() - targetTimestamp);
        if (diff < closestDiff) {
            closest = forecast;
            closestDiff = diff;
        }
    }

    return closest;
}

// Check if weather conditions are poor (returns alert emoji if so)
function getWeatherAlert(weather) {
    // Poor weather conditions:
    // - Heavy rain (codes 65, 67, 82)
    // - Snow (codes 71-77, 85-86)
    // - Thunderstorms (codes 95-99)
    // - Freezing rain/drizzle (codes 56, 57, 66, 67)
    // - High precipitation probability (>70%) with significant precipitation
    // - Very high winds (>50 km/h)
    // - Dense fog (code 48)

    const severeWeatherCodes = [65, 67, 82, 71, 73, 75, 77, 85, 86, 95, 96, 99, 56, 57, 66, 48];
    const moderateWeatherCodes = [63, 81, 55]; // Moderate rain/drizzle

    if (severeWeatherCodes.includes(weather.weatherCode)) {
        return '⚠️';
    }

    if (moderateWeatherCodes.includes(weather.weatherCode)) {
        return '⚠️';
    }

    // High wind warning (over 50 km/h)
    if (weather.windSpeed > 50) {
        return '⚠️';
    }

    // High precipitation probability with actual precipitation expected
    if (weather.precipitationProbability >= 70 && weather.precipitation > 0.5) {
        return '⚠️';
    }

    return '';
}

// Update weather display based on current time offset
function updateWeatherDisplay() {
    if (!baseStartTime || currentWaypoints.length === 0) return;

    const adjustedStart = new Date(baseStartTime.getTime() + timeOffset * 3600000);

    // Update slider display
    const sign = timeOffset >= 0 ? '+' : '';
    adjustedTimeDisplay.textContent = `${formatDateTime(adjustedStart)} (${sign}${timeOffset}h)`;

    // Clear markers
    markersLayer.clearLayers();

    // Update weather cards
    const weatherCards = document.getElementById('weather-cards');
    weatherCards.innerHTML = '';

    currentWaypoints.forEach((wp, index) => {
        const adjustedArrival = new Date(wp.arrivalTime.getTime() + timeOffset * 3600000);
        const weatherPoint = currentWeatherData[index];
        const weather = getWeatherForTime(weatherPoint, adjustedArrival);
        const icon = getWeatherIcon(weather.weatherCode);
        const alert = getWeatherAlert(weather);

        // Create marker with permanent tooltip showing temp and conditions
        const marker = L.marker([wp.lat, wp.lng])
            .bindTooltip(`
                <div class="weather-tooltip ${alert ? 'has-alert' : ''}">
                    ${alert ? `<span class="alert">${alert}</span>` : ''}
                    <span class="weather-icon">${icon}</span>
                    <span class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</span>
                </div>
            `, {
                permanent: true,
                direction: 'top',
                className: `weather-label ${alert ? 'weather-alert' : ''}`,
                offset: [0, -10]
            })
            .bindPopup(`
                <div class="weather-popup">
                    ${alert ? `<div class="alert-banner">${alert} Poor driving conditions</div>` : ''}
                    <div class="time">${formatDateTime(adjustedArrival)}</div>
                    <div class="weather-icon" style="font-size: 2rem;">${icon}</div>
                    <div class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</div>
                    <div>${weather.description}</div>
                </div>
            `);
        markersLayer.addLayer(marker);

        // Create sidebar card
        const card = document.createElement('div');
        card.className = `weather-card ${alert ? 'has-alert' : ''}`;
        card.innerHTML = `
            <div class="time">${wp.label} • ${formatDateTime(adjustedArrival)} ${alert}</div>
            <div class="conditions">
                <span class="weather-icon">${icon}</span>
                <span class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</span>
                <span class="description">${weather.description}</span>
            </div>
            <div class="details">
                <span>💨 ${Math.round(weather.windSpeed)} ${weatherPoint.units.windSpeed}</span>
                <span>🌧️ ${weather.precipitationProbability}% chance</span>
            </div>
        `;

        // Click card to focus on map
        card.addEventListener('click', () => {
            map.setView([wp.lat, wp.lng], 10);
            marker.openPopup();
        });

        weatherCards.appendChild(card);
    });
}

// Convert Celsius to Fahrenheit
function convertTemp(tempCelsius) {
    if (temperatureUnit === 'fahrenheit') {
        return Math.round(tempCelsius * 9/5 + 32);
    }
    return Math.round(tempCelsius);
}

// Get temperature unit symbol
function getTempUnit() {
    return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
}

// Store layers for clearing
let routeLayer = null;
let markersLayer = L.layerGroup().addTo(map);

// Set default datetime to now
const datetimeInput = document.getElementById('start-datetime');
const now = new Date();
now.setMinutes(0);
now.setSeconds(0);
datetimeInput.value = now.toISOString().slice(0, 16);

// Weather icon mapping based on WMO codes
function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 57) return '🌧️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌡️';
}

// Geocode location using Nominatim
async function geocode(query) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
        {
            headers: {
                'User-Agent': 'WeatherAlongRoute/1.0 (https://github.com/weather-along-route)'
            }
        }
    );
    const data = await response.json();

    if (data.length === 0) {
        throw new Error(`Location not found: ${query}`);
    }

    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
    };
}

// Calculate points along the route at hourly intervals
function getHourlyWaypoints(geometry, totalDuration, startTime) {
    const coords = geometry.coordinates;
    const waypoints = [];

    // Start point
    waypoints.push({
        lat: coords[0][1],
        lng: coords[0][0],
        arrivalTime: new Date(startTime),
        label: 'Start'
    });

    // Calculate total route length
    let totalDistance = 0;
    const segmentDistances = [];

    for (let i = 1; i < coords.length; i++) {
        const dist = haversineDistance(
            coords[i - 1][1], coords[i - 1][0],
            coords[i][1], coords[i][0]
        );
        segmentDistances.push(dist);
        totalDistance += dist;
    }

    // Get points at approximately 1-hour intervals
    const hourInSeconds = 3600;
    const numHours = Math.floor(totalDuration / hourInSeconds);

    for (let hour = 1; hour <= numHours; hour++) {
        const targetTime = hour * hourInSeconds;
        const targetRatio = targetTime / totalDuration;
        const targetDistance = targetRatio * totalDistance;

        // Find the segment containing this distance
        let accumulatedDistance = 0;
        let foundPoint = null;

        for (let i = 0; i < segmentDistances.length; i++) {
            if (accumulatedDistance + segmentDistances[i] >= targetDistance) {
                // Interpolate within this segment
                const segmentRatio = (targetDistance - accumulatedDistance) / segmentDistances[i];
                const lat = coords[i][1] + segmentRatio * (coords[i + 1][1] - coords[i][1]);
                const lng = coords[i][0] + segmentRatio * (coords[i + 1][0] - coords[i][0]);

                foundPoint = {
                    lat,
                    lng,
                    arrivalTime: new Date(startTime.getTime() + targetTime * 1000),
                    label: `Hour ${hour}`
                };
                break;
            }
            accumulatedDistance += segmentDistances[i];
        }

        if (foundPoint) {
            waypoints.push(foundPoint);
        }
    }

    // End point
    const lastCoord = coords[coords.length - 1];
    waypoints.push({
        lat: lastCoord[1],
        lng: lastCoord[0],
        arrivalTime: new Date(startTime.getTime() + totalDuration * 1000),
        label: 'Destination'
    });

    return waypoints;
}

// Haversine distance formula
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Format time for display
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Main form handler
document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    const startDatetime = new Date(document.getElementById('start-datetime').value);

    const btn = document.getElementById('plan-trip-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
        // Clear previous route
        if (routeLayer) {
            map.removeLayer(routeLayer);
        }
        markersLayer.clearLayers();

        // Geocode locations
        const [start, end] = await Promise.all([
            geocode(startLocation),
            geocode(endLocation)
        ]);

        // Get route
        const routeResponse = await fetch(
            `/api/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`
        );

        if (!routeResponse.ok) {
            throw new Error('Failed to get route');
        }

        const routeData = await routeResponse.json();

        // Draw route on map
        const routeCoords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
        routeLayer = L.polyline(routeCoords, {
            color: '#667eea',
            weight: 5,
            opacity: 0.8
        }).addTo(map);

        // Fit map to route
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // Calculate hourly waypoints
        const waypoints = getHourlyWaypoints(
            routeData.geometry,
            routeData.duration,
            startDatetime
        );

        // Fetch weather for all waypoints
        const weatherResponse = await fetch('/api/weather/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(waypoints.map(wp => ({
                lat: wp.lat,
                lng: wp.lng,
                datetime: wp.arrivalTime.toISOString()
            })))
        });

        const weatherResults = await weatherResponse.json();

        // Store data for time adjustments
        currentWaypoints = waypoints;
        currentWeatherData = weatherResults;
        baseStartTime = startDatetime;
        timeOffset = 0;

        // Reset slider
        timeSlider.value = 0;

        // Show time adjuster
        document.getElementById('time-adjuster').style.display = 'block';

        // Initial weather display
        updateWeatherDisplay();

        // Show weather summary
        document.getElementById('weather-summary').style.display = 'block';

    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
});
