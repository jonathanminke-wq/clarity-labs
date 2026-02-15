"""Configuration and constants for the Demo Brief Generator."""

import os

# --- Search API Configuration ---
# Supports: "google", "bing", or "duckduckgo" (fallback, no API key needed)
SEARCH_BACKEND = os.environ.get("SEARCH_BACKEND", "duckduckgo")

# Google Custom Search API
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GOOGLE_CSE_ID = os.environ.get("GOOGLE_CSE_ID", "")

# Bing Search API
BING_API_KEY = os.environ.get("BING_API_KEY", "")

# --- Document Styling ---
FONT_NAME = "Arial"
FONT_SIZE_TITLE = 22
FONT_SIZE_HEADING = 14
FONT_SIZE_SUBHEADING = 11
FONT_SIZE_BODY = 10
FONT_SIZE_SMALL = 8

# Colors (RGB tuples)
COLOR_PRIMARY = (10, 22, 40)        # Navy - #0a1628
COLOR_ACCENT = (97, 243, 147)       # Clarity green - #61F393
COLOR_LINK = (0, 102, 204)          # Blue links
COLOR_RED = (239, 68, 68)           # Danger/missing - #EF4444
COLOR_GRAY = (100, 116, 139)        # Slate - #64748B
COLOR_HEADER_BG = (255, 244, 230)   # Table header shading - #FFF4E6
COLOR_WHITE = (255, 255, 255)

# --- Output ---
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

# --- Research ---
MAX_SEARCH_RESULTS = 10
REQUEST_TIMEOUT = 15  # seconds
REQUEST_DELAY = 1.0   # seconds between requests to avoid rate limiting

# --- Cache ---
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
CACHE_TTL_HOURS = 24
