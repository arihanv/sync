#!/usr/bin/env python3
"""Tests for weather functionality."""

import unittest
import json
from weather import get_weather, format_weather

class TestWeather(unittest.TestCase):
    """Test cases for weather functionality."""
    
    def setUp(self):
        """Set up test data."""
        self.sample_weather_data = {
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
                'areaName': [{'value': 'San Francisco'}],
                'country': [{'value': 'United States'}]
            }]
        }
    
    def test_get_weather_returns_data(self):
        """Test that get_weather returns data."""
        result = get_weather("San Francisco")
        
        self.assertIsNotNone(result)
        self.assertIn('current_condition', result)
        self.assertIn('nearest_area', result)
    
    def test_format_weather(self):
        """Test weather data formatting."""
        result = format_weather(self.sample_weather_data)
        
        self.assertIn("San Francisco", result)
        self.assertIn("20°C", result)
        self.assertIn("Partly cloudy", result)
        self.assertIn("60%", result)
    
    def test_format_weather_none(self):
        """Test formatting with None data."""
        result = format_weather(None)
        
        self.assertEqual(result, "Weather data unavailable")
    
    def test_format_weather_structure(self):
        """Test that formatted weather has expected structure."""
        result = format_weather(self.sample_weather_data)
        
        self.assertIn("Weather Today", result)
        self.assertIn("Location:", result)
        self.assertIn("Temperature:", result)
        self.assertIn("Condition:", result)
        self.assertIn("Humidity:", result)
        self.assertIn("Wind:", result)
        self.assertIn("Feels like:", result)

if __name__ == '__main__':
    unittest.main()