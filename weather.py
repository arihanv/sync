#!/usr/bin/env python3
"""Weather finder - displays today's weather information."""

import json
import sys
from datetime import datetime
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

def get_weather(city="San Francisco"):
    """
    Fetch current weather data for a given city.
    
    Args:
        city (str): City name to get weather for
        
    Returns:
        dict: Weather data or None if error
    """
    if not HAS_REQUESTS:
        # Mock data for demonstration when requests is not available
        return {
            'current_condition': [{
                'temp_C': '20',
                'temp_F': '68',
                'weatherDesc': [{'value': 'Partly cloudy'}],
                'humidity': '60',
                'windspeedKmph': '10',
                'winddir16Point': 'NW',
                'FeelsLikeC': '22',
                'FeelsLikeF': '72'
            }],
            'nearest_area': [{
                'areaName': [{'value': city}],
                'country': [{'value': 'Demo Location'}]
            }]
        }
    
    try:
        # Using wttr.in service for weather data
        response = requests.get(f"https://wttr.in/{city}?format=j1")
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching weather: {e}")
        return None

def format_weather(weather_data):
    """
    Format weather data for display.
    
    Args:
        weather_data (dict): Raw weather data
        
    Returns:
        str: Formatted weather string
    """
    if not weather_data:
        return "Weather data unavailable"
    
    current = weather_data['current_condition'][0]
    location = weather_data['nearest_area'][0]
    
    return f"""Weather Today - {datetime.now().strftime('%Y-%m-%d')}
Location: {location['areaName'][0]['value']}, {location['country'][0]['value']}
Temperature: {current['temp_C']}°C ({current['temp_F']}°F)
Condition: {current['weatherDesc'][0]['value']}
Humidity: {current['humidity']}%
Wind: {current['windspeedKmph']} km/h {current['winddir16Point']}
Feels like: {current['FeelsLikeC']}°C ({current['FeelsLikeF']}°F)
"""

def main():
    """Main function to get and display weather."""
    city = sys.argv[1] if len(sys.argv) > 1 else "San Francisco"
    
    print(f"Fetching weather for {city}...")
    weather_data = get_weather(city)
    
    if weather_data:
        print(format_weather(weather_data))
    else:
        print("Failed to retrieve weather information")
        sys.exit(1)

if __name__ == "__main__":
    main()