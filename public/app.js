// Initialize the map
const map = L.map('map').setView([39.8283, -98.5795], 4); // Center of US

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Unit system preference (imperial or metric)
let unitSystem = 'imperial';

// Create custom Leaflet control for unit toggle
const UnitControl = L.Control.extend({
    options: {
        position: 'topright'
    },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control unit-control');
        container.innerHTML = `
            <button class="unit-btn active" data-unit="imperial">Imperial</button>
            <button class="unit-btn" data-unit="metric">Metric</button>
        `;

        // Prevent map interactions when clicking control
        L.DomEvent.disableClickPropagation(container);

        // Add click handlers
        container.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                unitSystem = btn.dataset.unit;
                if (currentWaypoints.length > 0) {
                    updateWeatherDisplay();
                }
            });
        });

        return container;
    }
});

map.addControl(new UnitControl());

// Store route data for time adjustments
let currentWaypoints = [];
let currentWeatherData = [];
let baseStartTime = null;
let timeOffset = 0;

// WMO Weather interpretation codes
function getWeatherDescription(code) {
    const descriptions = {
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

// Fetch weather from Open-Meteo directly (browser-side)
async function fetchWeatherForWaypoints(waypoints) {
    const weatherPromises = waypoints.map(async (wp) => {
        try {
            const date = new Date(wp.arrivalTime);
            // Get date range: 1 day before to 2 days after for 48-hour adjustment window
            const startDate = new Date(date);
            startDate.setDate(startDate.getDate() - 1);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 2);

            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${wp.lat}&longitude=${wp.lng}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=sunrise,sunset&start_date=${startDateStr}&end_date=${endDateStr}&timezone=auto`;

            const response = await fetch(url);

            if (!response.ok) {
                console.error(`Open-Meteo API error for point (${wp.lat}, ${wp.lng}): ${response.status}`);
                return null;
            }

            const data = await response.json();

            // Validate that required data is present
            if (!data.hourly || !data.hourly.time || !data.daily || !data.daily.time) {
                console.error(`Open-Meteo API returned incomplete data for point (${wp.lat}, ${wp.lng})`);
                return null;
            }

            // Return the full hourly forecast data for client-side time adjustment
            return {
                lat: wp.lat,
                lng: wp.lng,
                baseDateTime: wp.arrivalTime.toISOString(),
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
                    temperature: data.hourly_units?.temperature_2m || '°C',
                    precipitation: data.hourly_units?.precipitation || 'mm',
                    windSpeed: data.hourly_units?.wind_speed_10m || 'km/h'
                }
            };
        } catch (error) {
            console.error(`Error fetching weather for point (${wp.lat}, ${wp.lng}):`, error);
            return null;
        }
    });

    return Promise.all(weatherPromises);
}

// Time slider handler
const timeSlider = document.getElementById('time-slider');
const adjustedTimeDisplay = document.getElementById('adjusted-time');

timeSlider.addEventListener('input', () => {
    timeOffset = parseInt(timeSlider.value);
    // Update URL with new offset, keeping other params
    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    const startDatetimeInput = document.getElementById('start-datetime').value;
    encodeRouteToURL(startLocation, endLocation, startDatetimeInput, timeOffset);
    updateWeatherDisplay();
});

// Get weather for a specific time from hourly forecast data
function getWeatherForTime(weatherPoint, targetTime) {
    // Handle missing weather data
    if (!weatherPoint || !weatherPoint.hourlyForecast || weatherPoint.hourlyForecast.length === 0) {
        return {
            time: targetTime.toISOString(),
            temperature: null,
            weatherCode: 0,
            description: 'Weather data unavailable',
            precipitation: 0,
            precipitationProbability: 0,
            windSpeed: 0
        };
    }

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
function getWeatherAlert(weather, arrivalTime = null, weatherPoint = null) {
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

    // Night driving warning (based on sunrise/sunset)
    if (arrivalTime && isNightTime(arrivalTime, weatherPoint)) {
        return '🌙';
    }

    return '';
}

// Calculate a weather score (0-100, higher is better)
function calculateWeatherScore(weather) {
    let score = 100;

    // Weather code penalties
    const severeWeatherCodes = [65, 67, 82, 71, 73, 75, 77, 85, 86, 95, 96, 99, 56, 57, 66, 48];
    const moderateWeatherCodes = [63, 81, 55, 61, 80];
    const mildWeatherCodes = [51, 53, 45]; // Light drizzle, fog

    if (severeWeatherCodes.includes(weather.weatherCode)) {
        score -= 50;
    } else if (moderateWeatherCodes.includes(weather.weatherCode)) {
        score -= 30;
    } else if (mildWeatherCodes.includes(weather.weatherCode)) {
        score -= 15;
    }

    // Wind penalty (0-20 points)
    if (weather.windSpeed > 50) {
        score -= 20;
    } else if (weather.windSpeed > 30) {
        score -= 10;
    } else if (weather.windSpeed > 20) {
        score -= 5;
    }

    // Precipitation probability penalty (0-20 points)
    if (weather.precipitationProbability >= 80) {
        score -= 20;
    } else if (weather.precipitationProbability >= 60) {
        score -= 15;
    } else if (weather.precipitationProbability >= 40) {
        score -= 10;
    } else if (weather.precipitationProbability >= 20) {
        score -= 5;
    }

    // Actual precipitation penalty (0-10 points)
    if (weather.precipitation > 5) {
        score -= 10;
    } else if (weather.precipitation > 2) {
        score -= 7;
    } else if (weather.precipitation > 0.5) {
        score -= 4;
    }

    return Math.max(0, Math.min(100, score));
}

// Get sunrise/sunset times for a specific date from weather data
function getSunTimesForDate(weatherPoint, targetDate) {
    if (!weatherPoint.dailySunTimes) {
        return null;
    }

    const targetDateStr = targetDate.toISOString().split('T')[0];

    for (const sunTime of weatherPoint.dailySunTimes) {
        if (sunTime.date === targetDateStr) {
            return {
                sunrise: new Date(sunTime.sunrise),
                sunset: new Date(sunTime.sunset)
            };
        }
    }

    return null;
}

// Check if a time is during nighttime based on sunrise/sunset
function isNightTime(date, weatherPoint = null) {
    // If we have sunrise/sunset data, use it
    if (weatherPoint) {
        const sunTimes = getSunTimesForDate(weatherPoint, date);
        if (sunTimes) {
            return date < sunTimes.sunrise || date > sunTimes.sunset;
        }
    }

    // Fallback to fixed hours if no sun data available
    const hour = date.getHours();
    return hour >= 22 || hour < 6;
}

// Calculate night driving penalty for a waypoint using sunrise/sunset
function getNightDrivingPenalty(arrivalTime, weatherPoint = null) {
    const sunTimes = weatherPoint ? getSunTimesForDate(weatherPoint, arrivalTime) : null;

    if (sunTimes) {
        const arrivalMs = arrivalTime.getTime();
        const sunriseMs = sunTimes.sunrise.getTime();
        const sunsetMs = sunTimes.sunset.getTime();

        // Full night (more than 1 hour before sunrise or after sunset)
        const oneHour = 3600000;
        if (arrivalMs < sunriseMs - oneHour || arrivalMs > sunsetMs + oneHour) {
            return 30;
        }

        // Near sunrise/sunset (within 1 hour)
        if (arrivalMs < sunriseMs || arrivalMs > sunsetMs) {
            return 20;
        }

        // Twilight (within 30 minutes after sunrise or before sunset)
        const thirtyMin = 1800000;
        if (arrivalMs < sunriseMs + thirtyMin || arrivalMs > sunsetMs - thirtyMin) {
            return 10;
        }

        return 0;
    }

    // Fallback to hour-based calculation
    const hour = arrivalTime.getHours();

    // Peak penalty during late night (midnight to 4 AM)
    if (hour >= 0 && hour < 4) {
        return 30;
    }
    // Moderate penalty for early morning (4 AM - 6 AM) and late evening (10 PM - midnight)
    if ((hour >= 4 && hour < 6) || hour >= 22) {
        return 20;
    }
    // Small penalty for dusk/dawn (6 AM - 7 AM and 8 PM - 10 PM)
    if ((hour >= 6 && hour < 7) || (hour >= 20 && hour < 22)) {
        return 10;
    }

    return 0;
}

// Calculate average weather score for a given time offset
function getAverageScoreForOffset(offset) {
    if (!baseStartTime || currentWaypoints.length === 0 || currentWeatherData.length === 0) {
        return 50;
    }

    let totalScore = 0;
    let validPoints = 0;
    currentWaypoints.forEach((wp, index) => {
        const adjustedArrival = new Date(wp.arrivalTime.getTime() + offset * 3600000);
        const weatherPoint = currentWeatherData[index];

        // Skip if weather data is missing for this point
        if (!weatherPoint) {
            return;
        }

        const weather = getWeatherForTime(weatherPoint, adjustedArrival);

        // Start with weather score
        let waypointScore = calculateWeatherScore(weather);
        validPoints++;

        // Apply night driving penalty (using sunrise/sunset data)
        waypointScore -= getNightDrivingPenalty(adjustedArrival, weatherPoint);

        totalScore += Math.max(0, waypointScore);
    });

    return validPoints > 0 ? totalScore / validPoints : 50;
}

// Update the slider gradient based on weather scores
function updateSliderGradient() {
    const stops = [];

    for (let offset = -24; offset <= 24; offset++) {
        const score = getAverageScoreForOffset(offset);
        const position = ((offset + 24) / 48) * 100;

        // Interpolate between red (bad) and blue (good)
        // Score 0 = red (#ef4444), Score 100 = blue (#3b82f6)
        const red = Math.round(239 - (score / 100) * (239 - 59));
        const green = Math.round(68 + (score / 100) * (130 - 68));
        const blue = Math.round(68 + (score / 100) * (246 - 68));

        stops.push(`rgb(${red}, ${green}, ${blue}) ${position}%`);
    }

    timeSlider.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
}

// Find the best departure time offset based on weather scores
function findBestTimeOffset() {
    let bestOffset = 0;
    let bestScore = -1;

    for (let offset = -24; offset <= 24; offset++) {
        const score = getAverageScoreForOffset(offset);
        if (score > bestScore) {
            bestScore = score;
            bestOffset = offset;
        }
    }

    return { offset: bestOffset, score: bestScore };
}

// Update the best time marker position
function updateBestTimeMarker() {
    const bestTimeMarker = document.getElementById('best-time-marker');
    if (!bestTimeMarker) return;

    const { offset, score } = findBestTimeOffset();

    // Calculate position (0-100%)
    // Account for the slider labels on each side (roughly 35px each)
    const position = ((offset + 24) / 48) * 100;

    bestTimeMarker.style.left = `calc(${position}% + 35px * (1 - ${position / 50}))`;
    bestTimeMarker.dataset.offset = offset;

    // Update tooltip
    const sign = offset >= 0 ? '+' : '';
    bestTimeMarker.title = `Best time: ${sign}${offset}h (Score: ${Math.round(score)})`;
}

// Best time marker click handler
const bestTimeMarker = document.getElementById('best-time-marker');
if (bestTimeMarker) {
    bestTimeMarker.addEventListener('click', () => {
        const offset = parseInt(bestTimeMarker.dataset.offset || '0');
        timeSlider.value = offset;
        timeOffset = offset;
        // Update URL with new offset
        const startLocation = document.getElementById('start-location').value;
        const endLocation = document.getElementById('end-location').value;
        const startDatetimeInput = document.getElementById('start-datetime').value;
        encodeRouteToURL(startLocation, endLocation, startDatetimeInput, timeOffset);
        updateWeatherDisplay();
    });
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

        // Skip if weather data is missing for this point
        if (!weatherPoint) {
            return;
        }

        const weather = getWeatherForTime(weatherPoint, adjustedArrival);
        const icon = getWeatherIcon(weather.weatherCode);
        const alert = getWeatherAlert(weather, adjustedArrival, weatherPoint);
        const isNight = isNightTime(adjustedArrival, weatherPoint);

        // Create marker with permanent tooltip showing temp and conditions
        const marker = L.marker([wp.lat, wp.lng])
            .bindTooltip(`
                <div class="weather-tooltip ${alert ? 'has-alert' : ''} ${isNight ? 'is-night' : ''}">
                    ${alert ? `<span class="alert">${alert}</span>` : ''}
                    <span class="weather-icon">${icon}</span>
                    <span class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</span>
                </div>
            `, {
                permanent: true,
                direction: 'top',
                className: `weather-label ${alert ? 'weather-alert' : ''} ${isNight ? 'weather-night' : ''}`,
                offset: [0, -10]
            })
            .bindPopup(`
                <div class="weather-popup">
                    ${alert === '⚠️' ? `<div class="alert-banner">${alert} Poor driving conditions</div>` : ''}
                    ${alert === '🌙' ? `<div class="alert-banner night">${alert} Night driving</div>` : ''}
                    <div class="time">${formatDateTime(adjustedArrival)}</div>
                    <div class="weather-icon" style="font-size: 2rem;">${icon}</div>
                    <div class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</div>
                    <div>${weather.description}</div>
                </div>
            `);
        markersLayer.addLayer(marker);

        // Create sidebar card
        const card = document.createElement('div');
        card.className = `weather-card ${alert === '⚠️' ? 'has-alert' : ''} ${isNight ? 'is-night' : ''}`;
        card.innerHTML = `
            <div class="time">${wp.label} • ${formatDateTime(adjustedArrival)} ${alert}</div>
            <div class="conditions">
                <span class="weather-icon">${icon}</span>
                <span class="temp">${convertTemp(weather.temperature)}${getTempUnit()}</span>
                <span class="description">${weather.description}</span>
            </div>
            <div class="details">
                <span>💨 ${convertWindSpeed(weather.windSpeed)} ${getWindSpeedUnit()}</span>
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

    // Update slider gradient to show weather quality
    updateSliderGradient();
    updateBestTimeMarker();
}

// Convert Celsius to Fahrenheit
function convertTemp(tempCelsius) {
    if (unitSystem === 'imperial') {
        return Math.round(tempCelsius * 9/5 + 32);
    }
    return Math.round(tempCelsius);
}

// Get temperature unit symbol
function getTempUnit() {
    return unitSystem === 'imperial' ? '°F' : '°C';
}

// Convert wind speed from km/h to mph if imperial
function convertWindSpeed(speedKmh) {
    if (unitSystem === 'imperial') {
        return Math.round(speedKmh * 0.621371);
    }
    return Math.round(speedKmh);
}

// Get wind speed unit
function getWindSpeedUnit() {
    return unitSystem === 'imperial' ? 'mph' : 'km/h';
}

// Store layers for clearing
let routeLayer = null;
let markersLayer = L.layerGroup().addTo(map);

// Pad month, day, hour, minute for HTML input, since toISOString() gives in UTC
// --- Local datetime input helpers ---
function pad(n) { return n < 10 ? '0' + n : n; }
function toLocalInputValue(date) {
    // Converts a Date to yyyy-MM-ddTHH:mm in local time for input
    return date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + 'T' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes());
}

window.addEventListener('DOMContentLoaded', () => {
    const datetimeInput = document.getElementById('start-datetime');
    if (datetimeInput && !datetimeInput.value) {
        const now = new Date();
        now.setSeconds(0, 0);
        // Round up to next hour
        if (now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0) {
            now.setHours(now.getHours() + 1);
            now.setMinutes(0, 0, 0);
        }
        datetimeInput.value = toLocalInputValue(now);
    }
});

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
                'User-Agent': 'WeatherAlongRoute/1.0 (https://github.com/iandees/weather-along-route)'
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

// Get driving route using OSRM
async function getRoute(start, end) {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found');
    }

    const route = data.routes[0];
    return {
        geometry: route.geometry,
        duration: route.duration, // in seconds
        distance: route.distance, // in meters
        legs: route.legs
    };
}

// Calculate points along the route at hourly intervals
function getHourlyWaypoints(geometry, totalDuration, startTime) {
    const coords = geometry.coordinates;
    const waypoints = [];

    // Start point (include for weather at departure)
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

    // Calculate how close the last hourly point would be to the destination
    // If less than 45 minutes away, skip the last hourly point
    const remainingTimeAfterLastHour = totalDuration - (numHours * hourInSeconds);
    const skipLastHour = remainingTimeAfterLastHour < 2700; // 45 minutes

    for (let hour = 1; hour <= numHours; hour++) {
        // Skip the last hourly point if it's too close to destination
        if (hour === numHours && skipLastHour) {
            continue;
        }

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
// --- Route Sharing via URL ---
function encodeRouteToURL(from, to, time, offset) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (time) {
        // Store time in ISO8601 with timezone
        const d = new Date(time);
        params.set('time', d.toISOString());
    }
    if (typeof offset === 'number' && !isNaN(offset)) params.set('offset', offset);
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', url);
}

function decodeRouteFromURL() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    let time = params.get('time') || '';
    // Convert ISO8601 (possibly with Z) to local input value
    if (time) {
        const d = new Date(time);
        time = toLocalInputValue(d);
    }
    const offset = params.has('offset') ? parseInt(params.get('offset'), 10) : 0;
    return { from, to, time, offset };
}

function isValidTime(timeStr) {
    if (!timeStr) return false;
    const t = new Date(timeStr);
    if (isNaN(t.getTime())) return false;
    const now = new Date();
    const maxFuture = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days
    return t > now && t < maxFuture;
}

function prefillForm(from, to, time) {
    document.getElementById('start-location').value = from || '';
    document.getElementById('end-location').value = to || '';
    if (time) document.getElementById('start-datetime').value = time;
}

// Main form handler
document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    const startDatetimeInput = document.getElementById('start-datetime').value;
    // Convert local input value to UTC ISO string for API
    const localDate = new Date(startDatetimeInput);
    const startDatetime = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);

    // Update URL for sharing (now includes offset)
    const offset = parseInt(timeSlider.value, 10) || 0;
    encodeRouteToURL(startLocation, endLocation, startDatetimeInput, offset);

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

        // Get route directly from OSRM
        const routeData = await getRoute(start, end);

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

        // Fetch weather for all waypoints directly from Open-Meteo
        const weatherResults = await fetchWeatherForWaypoints(waypoints);

        // Store data for time adjustments
        currentWaypoints = waypoints;
        currentWeatherData = weatherResults;
        baseStartTime = startDatetime;
        timeOffset = offset;
        // Set slider to offset
        timeSlider.value = offset;

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

// --- On page load, check for shared route in URL ---
window.addEventListener('DOMContentLoaded', () => {
    const { from, to, time, offset } = decodeRouteFromURL();
    if (from || to || time) {
        prefillForm(from, to, time);
        if (typeof offset === 'number' && !isNaN(offset)) {
            timeSlider.value = offset;
            timeOffset = offset;
        }
        if (from && to && isValidTime(time)) {
            // Auto-submit the form
            document.getElementById('route-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
        // If time is missing/invalid, just prefill and wait for user
    }
});
