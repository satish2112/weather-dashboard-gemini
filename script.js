// Get references to the DOM elements
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const weatherInfoDiv = document.getElementById('weather-info');
const errorMessageDiv = document.getElementById('error-message');
const cityDataList = document.getElementById('city-list');
const locationBtn = document.getElementById('location-btn');
const voiceSearchBtn = document.getElementById('voice-search-btn');
const favoriteBtn = document.getElementById('favorite-btn');
const favoritesContainer = document.getElementById('favorites-container');
const forecastSection = document.getElementById('forecast-section');
const unitToggleCheckbox = document.getElementById('unit-toggle-checkbox');

// API configuration
const apiKey = '531fa0df445606206bc52c0d35c1d844'; // IMPORTANT: Replace with your own OpenWeatherMap API key

// Global state
let currentUnit = 'metric'; // 'metric' or 'imperial'
let favorites = [];
let currentCityName = '';
let countdownInterval;

// A list of major cities for the autosuggest feature
const MAJOR_CITIES = [
    "London", "New York", "Tokyo", "Paris", "Sydney", "Dubai", "Singapore", "Los Angeles",
    "Chicago", "Toronto", "Berlin", "Moscow", "Beijing", "Shanghai", "Mumbai", "Delhi",
    "Cairo", "Rio de Janeiro", "Mexico City", "Buenos Aires"
];

/**
 * Loads unit preference from localStorage and updates the toggle.
 */
function loadUnitPreference() {
    const savedUnit = localStorage.getItem('weatherAppUnit');
    if (savedUnit) {
        currentUnit = savedUnit;
    }
    unitToggleCheckbox.checked = currentUnit === 'imperial';
}

/**
 * Handles the unit toggle change.
 */
function handleUnitToggle() {
    currentUnit = unitToggleCheckbox.checked ? 'imperial' : 'metric';
    localStorage.setItem('weatherAppUnit', currentUnit);
    // Re-fetch weather for the last known city with the new unit, if one exists
    if (currentCityName) {
        getCoordsForCity(currentCityName);
    }
}

/**
 * Loads favorite cities from localStorage.
 */
function loadFavorites() {
    const storedFavorites = localStorage.getItem('weatherAppFavorites');
    if (storedFavorites) {
        favorites = JSON.parse(storedFavorites);
    }
}

/**
 * Saves favorite cities to localStorage.
 */
function saveFavorites() {
    localStorage.setItem('weatherAppFavorites', JSON.stringify(favorites));
}

/**
 * Renders the favorite cities buttons in the UI.
 */
function displayFavorites() {
    favoritesContainer.innerHTML = '';
    if (favorites.length > 0) {
        document.getElementById('favorites-section').style.display = 'block';
        favorites.forEach(city => {
            const favBtn = document.createElement('button');
            favBtn.className = 'favorite-city';
            favBtn.textContent = city;
            favBtn.onclick = () => {
                cityInput.value = city;
                handleSearch();
            };
            favoritesContainer.appendChild(favBtn);
        });
    } else {
        document.getElementById('favorites-section').style.display = 'none';
    }
}

/**
 * Toggles a city in the favorites list.
 */
function handleFavoriteToggle() {
    const index = favorites.indexOf(currentCityName);
    if (index > -1) {
        favorites.splice(index, 1); // Remove from favorites
    } else {
        favorites.push(currentCityName); // Add to favorites
    }
    saveFavorites();
    updateFavoriteButton();
    displayFavorites();
}

/**
 * Populates the datalist with major city names for autosuggest.
 */
function populateCityList() {
    MAJOR_CITIES.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        cityDataList.appendChild(option);
    });
}

/**
 * Updates the body background based on the weather condition.
 * @param {string} weatherCondition - The main weather condition (e.g., "Clear", "Clouds").
 */
function updateBackground(weatherCondition) {
    const body = document.body;
    body.className = ''; // Remove any existing weather-related classes

    if (!weatherCondition) {
        body.classList.add('default-bg');
        return;
    }

    const condition = weatherCondition.toLowerCase();
    if (condition.includes('clear')) body.classList.add('clear-bg');
    else if (condition.includes('cloud')) body.classList.add('clouds-bg');
    else if (condition.includes('rain') || condition.includes('drizzle')) body.classList.add('rain-bg');
    else if (condition.includes('snow')) body.classList.add('snow-bg');
    else if (condition.includes('thunderstorm')) body.classList.add('thunderstorm-bg');
    else body.classList.add('default-bg'); // A fallback for mist, fog, etc.
}

/**
 * Fetches and displays all weather data based on latitude and longitude.
 * This is the core function for updating the UI.
 * @param {number} lat The latitude.
 * @param {number} lon The longitude.
 * @param {string|null} originalCity The city name the user originally searched for.
 */
async function fetchAndDisplayWeather(lat, lon, originalCity = null) {
    searchBtn.disabled = true;
    locationBtn.disabled = true;
    voiceSearchBtn.disabled = true;
    if (countdownInterval) clearInterval(countdownInterval); // Clear previous countdown
    weatherInfoDiv.style.display = 'none';
    forecastSection.style.display = 'none';
    errorMessageDiv.style.display = 'none';
    document.getElementById('aqi-item').style.display = 'none';

    try {
        const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${currentUnit}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${currentUnit}`;
        const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;

        const [currentWeatherResponse, forecastResponse, aqiResponse] = await Promise.all([
            fetch(currentWeatherUrl),
            fetch(forecastUrl),
            fetch(aqiUrl)
        ]);

        if (!currentWeatherResponse.ok || !forecastResponse.ok || !aqiResponse.ok) {
            const errorData = !currentWeatherResponse.ok ? await currentWeatherResponse.json() : await forecastResponse.json();
            throw new Error(errorData.message || 'Could not fetch weather data.');
        }

        const currentWeatherData = await currentWeatherResponse.json();
        const forecastData = await forecastResponse.json();
        const aqiData = await aqiResponse.json();

        // Prioritize the user's search term for the display name, otherwise use what the API returns.
        displayWeatherData(currentWeatherData, originalCity || currentWeatherData.name);
        displayAqi(aqiData);
        displayHourlyForecast(forecastData.list);
        displayDailyForecast(forecastData.list, currentWeatherData.dt);

    } catch (error) {
        console.error('Error fetching weather data:', error);
        displayError(error.message);
    } finally {
        searchBtn.disabled = false;
        locationBtn.disabled = false;
        voiceSearchBtn.disabled = false;
        cityInput.value = ''; // Clear input after search
    }
}

/**
 * Gets coordinates for a given city name and then fetches the weather.
 * @param {string} city The name of the city.
 */
async function getCoordsForCity(city) {
    // Disable buttons during the API call
    searchBtn.disabled = true;
    locationBtn.disabled = true;
    voiceSearchBtn.disabled = true;
    if (countdownInterval) clearInterval(countdownInterval);

    try {
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${apiKey}`;
        const geoResponse = await fetch(geoUrl);
        const geoData = await geoResponse.json();

        if (!geoData || geoData.length === 0) {
            throw new Error('City not found. Please check the spelling.');
        }

        const { lat, lon } = geoData[0];
        await fetchAndDisplayWeather(lat, lon, city);

    } catch (error) {
        console.error('Error in getCoordsForCity:', error);
        displayError(error.message);
        // Re-enable buttons if geocoding fails
        searchBtn.disabled = false;
        locationBtn.disabled = false;
        voiceSearchBtn.disabled = false;
        cityInput.value = '';
    }
}

/**
 * Updates the favorite button's appearance (filled or empty star).
 */
function updateFavoriteButton() {
    if (favorites.includes(currentCityName)) {
        favoriteBtn.classList.add('is-favorite');
        favoriteBtn.textContent = '★'; // Filled star
        favoriteBtn.title = 'Remove from favorites';
    } else {
        favoriteBtn.classList.remove('is-favorite');
        favoriteBtn.textContent = '☆'; // Empty star
        favoriteBtn.title = 'Add to favorites';
    }
}

/**
 * Starts a live countdown to the next sunrise or sunset.
 * @param {number} sunriseTs - Sunrise timestamp (in seconds).
 * @param {number} sunsetTs - Sunset timestamp (in seconds).
 */
function startCountdown(sunriseTs, sunsetTs) {
    if (countdownInterval) clearInterval(countdownInterval);

    const countdownLabel = document.getElementById('countdown-label');
    const countdownTimer = document.getElementById('countdown-timer');

    countdownInterval = setInterval(() => {
        const now = new Date();
        const sunrise = new Date(sunriseTs * 1000);
        const sunset = new Date(sunsetTs * 1000);

        let targetEvent, eventLabel;

        if (now < sunrise) {
            targetEvent = sunrise;
            eventLabel = 'Sunrise in';
        } else if (now < sunset) {
            targetEvent = sunset;
            eventLabel = 'Sunset in';
        } else {
            // Next day's sunrise
            const nextSunrise = new Date(sunrise);
            nextSunrise.setDate(sunrise.getDate() + 1);
            targetEvent = nextSunrise;
            eventLabel = 'Sunrise in';
        }

        const diff = targetEvent - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        countdownLabel.textContent = eventLabel;
        countdownTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

/**
 * Updates the DOM to display the current weather information.
 * @param {object} data - The weather data object from the /weather API.
 * @param {string} resolvedCityName - The name of the city from the API.
 */
function displayWeatherData(data, resolvedCityName) {
    const tempUnit = currentUnit === 'metric' ? '°C' : '°F';
    const speedUnit = currentUnit === 'metric' ? 'km/h' : 'mph';

    updateBackground(data.weather[0].main);

    currentCityName = resolvedCityName; // Update global state
    document.getElementById('city-name').textContent = currentCityName;
    document.getElementById('temperature').textContent = `${Math.round(data.main.temp)}${tempUnit}`;
    document.getElementById('description').textContent = data.weather[0].description;
    document.getElementById('weather-icon').src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;

    document.getElementById('feels-like').textContent = `${Math.round(data.main.feels_like)}${tempUnit}`;
    document.getElementById('humidity').textContent = `${data.main.humidity}%`;
    const windSpeed = currentUnit === 'metric' ? (data.wind.speed * 3.6).toFixed(1) : data.wind.speed.toFixed(1);
    document.getElementById('wind-speed').textContent = `${windSpeed} ${speedUnit}`;

    // Display wind direction with a rotating arrow
    const windArrow = document.getElementById('wind-arrow');
    windArrow.style.transform = `rotate(${data.wind.deg}deg)`;

    // Display sunrise and sunset times
    const formatTime = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleTimeString([], 
            { hour: '2-digit', minute: '2-digit', hour12: true }
        );
    };
    document.getElementById('sunrise-time').textContent = formatTime(data.sys.sunrise);
    document.getElementById('sunset-time').textContent = formatTime(data.sys.sunset);

    updateFavoriteButton();
    startCountdown(data.sys.sunrise, data.sys.sunset);

    weatherInfoDiv.style.display = 'block';
    forecastSection.style.display = 'block';
}

/**
 * Displays the Air Quality Index (AQI).
 * @param {object} aqiData - The AQI data from the API.
 */
function displayAqi(aqiData) {
    const aqiValue = aqiData.list[0].main.aqi;
    const aqiItem = document.getElementById('aqi-item');
    const aqiValueSpan = document.getElementById('aqi-value');

    const aqiLevels = {
        1: { text: 'Good', className: 'good' },
        2: { text: 'Fair', className: 'fair' },
        3: { text: 'Moderate', className: 'moderate' },
        4: { text: 'Poor', className: 'poor' },
        5: { text: 'Very Poor', className: 'very-poor' }
    };

    const level = aqiLevels[aqiValue] || { text: 'Unknown', className: '' };

    aqiValueSpan.textContent = `${level.text} (${aqiValue})`;
    aqiItem.className = 'detail-item aqi-item'; // Reset classes
    aqiItem.classList.add(level.className);
    aqiItem.style.display = 'block';
}

/**
 * Displays the hourly forecast for the next 24 hours.
 * @param {Array} forecastList - The list of 3-hour forecast objects from the /forecast API.
 */
function displayHourlyForecast(forecastList) {
    const container = document.getElementById('hourly-forecast');
    container.innerHTML = '';

    const tempUnit = currentUnit === 'metric' ? '°C' : '°F';
    const next24Hours = forecastList.slice(0, 8); // The next 8 * 3-hour intervals = 24 hours

    next24Hours.forEach(hour => {
        const date = new Date(hour.dt * 1000);
        const timeString = date.toLocaleTimeString([], { hour: 'numeric', hour12: true }).toLowerCase();

        const item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = `
            <span>${timeString}</span>
            <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}.png" alt="${hour.weather[0].description}" title="${hour.weather[0].description}">
            <span>${Math.round(hour.main.temp)}${tempUnit}</span>
        `;
        container.appendChild(item);
    });
}

/**
 * Displays the daily forecast for the next 5 days.
 * @param {Array} forecastList - The list of 3-hour forecast objects from the /forecast API.
 * @param {number} currentDataTimestamp - The timestamp of the current weather data, to identify "today".
 */
function displayDailyForecast(forecastList, currentDataTimestamp) {
    const container = document.getElementById('daily-forecast');
    container.innerHTML = '';

    const tempUnit = currentUnit === 'metric' ? '°C' : '°F';
    const dailyData = {};

    // Group forecast data by day, using UTC dates to avoid timezone issues.
    forecastList.forEach(item => {
        const date = new Date(item.dt * 1000).toISOString().split('T')[0];
        if (!dailyData[date]) {
            dailyData[date] = {
                temps: [],
                icons: [],
                descriptions: []
            };
        }
        dailyData[date].temps.push(item.main.temp);
        dailyData[date].icons.push(item.weather[0].icon);
        dailyData[date].descriptions.push(item.weather[0].description);
    });

    // Determine "today's" date from the current weather data to reliably exclude it from the forecast.
    const todayDateStr = new Date(currentDataTimestamp * 1000).toISOString().split('T')[0];
    const forecastDays = Object.keys(dailyData).filter(date => date !== todayDateStr);

    // Create forecast items for the next 5 days
    forecastDays.slice(0, 5).forEach(dateStr => {
        const day = dailyData[dateStr];
        const dateObj = new Date(`${dateStr}T12:00:00Z`);
        const dayString = dateObj.toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });

        const maxTemp = Math.round(Math.max(...day.temps));
        const minTemp = Math.round(Math.min(...day.temps));
        const icon = day.icons.sort((a, b) => day.icons.filter(v => v === a).length - day.icons.filter(v => v === b).length).pop();
        const description = day.descriptions.sort((a, b) => day.descriptions.filter(v => v === a).length - day.descriptions.filter(v => v === b).length).pop();

        const item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = `
            <span>${dayString}</span>
            <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${description}" title="${description}">
            <span>${maxTemp}°/${minTemp}°</span>
        `;
        container.appendChild(item);
    });
}

/**
 * Displays an error message in the UI.
 * @param {string} message - The error message to display.
 */
function displayError(message) {
    if (countdownInterval) clearInterval(countdownInterval);
    updateBackground(); // Reset to default background on error
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = 'block';
    weatherInfoDiv.style.display = 'none';
    forecastSection.style.display = 'none';
}

/**
 * Triggers the weather data fetch.
 */
function handleSearch() {
    const city = cityInput.value.trim();
    if (city) {
        getCoordsForCity(city);
    }
}

/**
 * Handles the click on the "Use my location" button.
 */
function handleUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                await fetchAndDisplayWeather(latitude, longitude);
            },
            (error) => {
                let message = 'Could not get your location.';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = 'You denied the request for Geolocation.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        message = 'The request to get user location timed out.';
                        break;
                }
                displayError(message);
            }
        );
    } else {
        displayError('Geolocation is not supported by this browser.');
    }
}

/**
 * Handles the click on the voice search button.
 */
function handleVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        displayError("Voice search is not supported by your browser.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceSearchBtn.classList.add('listening');
    voiceSearchBtn.disabled = true;

    recognition.start();

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        cityInput.value = speechResult;
        handleSearch(); // Trigger search with the result
    };

    recognition.onspeechend = () => {
        recognition.stop();
        voiceSearchBtn.classList.remove('listening');
        voiceSearchBtn.disabled = false;
    };

    recognition.onerror = (event) => {
        let errorMessage = 'An error occurred during voice recognition.';
        if (event.error === 'no-speech') errorMessage = 'No speech was detected. Please try again.';
        else if (event.error === 'audio-capture') errorMessage = 'Microphone not found. Ensure it is enabled.';
        else if (event.error === 'not-allowed') errorMessage = 'Permission to use microphone was denied.';
        
        displayError(errorMessage);
        voiceSearchBtn.classList.remove('listening');
        voiceSearchBtn.disabled = false;
    };
}

// Add event listeners
searchBtn.addEventListener('click', handleSearch);
locationBtn.addEventListener('click', handleUserLocation);
favoriteBtn.addEventListener('click', handleFavoriteToggle);
voiceSearchBtn.addEventListener('click', handleVoiceSearch);
unitToggleCheckbox.addEventListener('change', handleUnitToggle);

cityInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        handleSearch();
    }
});

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    populateCityList();
    loadFavorites();
    displayFavorites();
    loadUnitPreference(); // Load user's unit preference
    updateBackground(); // Set initial default background
    handleUserLocation(); // Automatically get weather for user's location
});
