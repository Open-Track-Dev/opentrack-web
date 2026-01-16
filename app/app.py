from flask import Flask, render_template, jsonify, Response, abort, send_from_directory
import os
import yaml
from datetime import datetime
from icalendar import Calendar, Event
from geopy.geocoders import Nominatim
import json
import time

import threading

app = Flask(__name__)

# Determine base data directory
# Docker environment usually has /app/data mounted
if os.path.exists('/app/data/events'):
    DATA_ROOT = '/app/data'
elif os.path.exists(os.path.join('data', 'events')):
    DATA_ROOT = 'data'
else:
    DATA_ROOT = '.'

EVENTS_DIR = os.path.join(DATA_ROOT, 'events')
ORGANIZERS_DIR = os.path.join(DATA_ROOT, 'organizers')
LANGUAGES_DIR = os.path.join(DATA_ROOT, 'languages')
CURRENCIES_DIR = os.path.join(DATA_ROOT, 'currencies')
COUNTRIES_DIR = os.path.join(DATA_ROOT, 'countries')
CACHE_DIR = os.path.join(DATA_ROOT, '.cache')

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

geolocator = Nominatim(user_agent="opentrack-web")

# Lock for cache file operations
cache_lock = threading.Lock()

def get_coordinates(address, city, country, async_fetch=False):
    cache_file = os.path.join(CACHE_DIR, 'geocoding_cache.json')
    query = f"{address}, {city}, {country}"
    
    with cache_lock:
        cache = {}
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    cache = json.load(f)
            except Exception:
                pass
        
        if query in cache:
            return cache[query]
    
    if async_fetch:
        # Start a background thread to fetch and cache the coordinates
        thread = threading.Thread(target=fetch_and_cache_coordinates, args=(address, city, country, query, cache_file))
        thread.start()
        return None

    return fetch_and_cache_coordinates(address, city, country, query, cache_file)

def fetch_and_cache_coordinates(address, city, country, query, cache_file):
    # Try multiple queries from most specific to least specific
    queries = [
        f"{address}, {city}, {country}",
        f"{city}, {country}"
    ]
    
    for q in queries:
        try:
            print(f"Attempting geocoding for: {q}")
            location = geolocator.geocode(q)
            if location:
                coords = {'latitude': location.latitude, 'longitude': location.longitude}
                
                with cache_lock:
                    cache = {}
                    if os.path.exists(cache_file):
                        try:
                            with open(cache_file, 'r') as f:
                                cache = json.load(f)
                        except Exception:
                            pass
                    
                    cache[query] = coords # Cache the original full query
                    with open(cache_file, 'w') as f:
                        json.dump(cache, f)
                
                print(f"Successfully geocoded: {q} -> {coords}")
                time.sleep(1) # Respect Nominatim's usage policy
                return coords
        except Exception as e:
            print(f"Geocoding error for {q}: {e}")
            time.sleep(1)
    
    print(f"Failed to geocode any query for: {query}")
    return None


def load_organizers():
    """
    Loads all organizers from the data/organizers directory.
    Each organizer is stored in its own subdirectory with an organizer.yaml and description.md file.
    Returns a dictionary of organizers with their directory name as the key.
    """
    organizers = {}
    if not os.path.exists(ORGANIZERS_DIR):
        return organizers

    for item in os.listdir(ORGANIZERS_DIR):
        item_path = os.path.join(ORGANIZERS_DIR, item)
        if os.path.isdir(item_path):
            yaml_path = os.path.join(item_path, 'organizer.yaml')
            if os.path.exists(yaml_path):
                with open(yaml_path, 'r') as f:
                    try:
                        org_data = yaml.safe_load(f)
                        org_data['id'] = item

                        # Load detailed description from Markdown file
                        description_path = os.path.join(item_path, 'description.md')
                        if os.path.exists(description_path):
                            with open(description_path, 'r') as df:
                                org_data['description'] = df.read()

                        # Check if image exists
                        image_path = os.path.join(item_path, 'image.png')
                        if os.path.exists(image_path):
                            org_data['image_url'] = f'/organizer/{item}/image.png'

                        organizers[item.lower()] = org_data
                    except yaml.YAMLError as exc:
                        print(f"Error parsing {yaml_path}: {exc}")
    return organizers


def load_languages():
    """
    Loads all languages from the data/languages directory.
    Returns a dictionary of languages with their directory name as the key.
    """
    languages = {}
    if not os.path.exists(LANGUAGES_DIR):
        return languages

    for item in os.listdir(LANGUAGES_DIR):
        item_path = os.path.join(LANGUAGES_DIR, item)
        if os.path.isdir(item_path):
            yaml_path = os.path.join(item_path, 'language.yaml')
            if os.path.exists(yaml_path):
                with open(yaml_path, 'r') as f:
                    try:
                        lang_data = yaml.safe_load(f)
                        lang_data['id'] = item
                        languages[item.lower()] = lang_data
                    except yaml.YAMLError as exc:
                        print(f"Error parsing {yaml_path}: {exc}")
    return languages


def load_currencies():
    """
    Loads all currencies from the data/currencies directory.
    Returns a dictionary of currencies with their directory name as the key.
    """
    currencies = {}
    if not os.path.exists(CURRENCIES_DIR):
        return currencies

    for item in os.listdir(CURRENCIES_DIR):
        item_path = os.path.join(CURRENCIES_DIR, item)
        if os.path.isdir(item_path):
            yaml_path = os.path.join(item_path, 'currency.yaml')
            if os.path.exists(yaml_path):
                with open(yaml_path, 'r') as f:
                    try:
                        currency_data = yaml.safe_load(f)
                        currency_data['id'] = item
                        currencies[item.lower()] = currency_data
                    except yaml.YAMLError as exc:
                        print(f"Error parsing {yaml_path}: {exc}")
    return currencies


def load_countries():
    """
    Loads all countries from the data/countries directory.
    Returns a dictionary of countries with their directory name as the key.
    """
    countries = {}
    if not os.path.exists(COUNTRIES_DIR):
        return countries

    for item in os.listdir(COUNTRIES_DIR):
        item_path = os.path.join(COUNTRIES_DIR, item)
        if os.path.isdir(item_path):
            yaml_path = os.path.join(item_path, 'country.yaml')
            if os.path.exists(yaml_path):
                with open(yaml_path, 'r') as f:
                    try:
                        country_data = yaml.safe_load(f)
                        country_data['id'] = item
                        countries[item.lower()] = country_data
                    except yaml.YAMLError as exc:
                        print(f"Error parsing {yaml_path}: {exc}")
    return countries


def load_events():
    """
    Loads all events from the data/events directory and the data root directory.
    Each event is stored in its own subdirectory with an event.yaml and description.md file.
    Events are returned as a list of dictionaries, sorted by date.
    """
    events = []
    organizers = load_organizers()
    languages = load_languages()
    currencies = load_currencies()
    countries = load_countries()

    dirs_to_scan = [EVENTS_DIR]
    # Also scan for event directories in DATA_ROOT (excluding organizers and known system dirs)
    for item in os.listdir(DATA_ROOT):
        if item in ['events', 'organizers', 'static', 'templates', '.cache']:
            continue
        item_path = os.path.join(DATA_ROOT, item)
        if os.path.isdir(item_path) and os.path.exists(os.path.join(item_path, 'event.yaml')):
            dirs_to_scan.append(item_path)

    for scan_path in dirs_to_scan:
        if scan_path == EVENTS_DIR:
            if not os.path.exists(EVENTS_DIR):
                continue
            items = [os.path.join(EVENTS_DIR, i) for i in os.listdir(EVENTS_DIR)]
        else:
            items = [scan_path]

        for item_path in items:
            if os.path.isdir(item_path):
                yaml_path = os.path.join(item_path, 'event.yaml')
                if os.path.exists(yaml_path):
                    item = os.path.basename(item_path)
                    with open(yaml_path, 'r') as f:
                        try:
                            event_data = yaml.safe_load(f)
                            event_data['id'] = item

                            # Load detailed description from Markdown file
                            description_path = os.path.join(item_path, 'description.md')
                            if os.path.exists(description_path):
                                with open(description_path, 'r') as df:
                                    event_data['description'] = df.read()

                            # Link organizer data
                            org_name = event_data.get('organizer', '').lower()
                            if org_name in organizers:
                                event_data['organizer_details'] = organizers[org_name]

                            # Link language data
                            lang_id = str(event_data.get('language', '')).lower()
                            if lang_id in languages:
                                event_data['language_details'] = languages[lang_id]

                            # Link country data
                            loc = event_data.get('location', {})
                            country_id = str(loc.get('country', '')).lower()
                            if country_id in countries:
                                event_data['location']['country_details'] = countries[country_id]

                            # Link currency data
                            price = event_data.get('price')
                            if isinstance(price, dict) and 'currency' in price:
                                curr_id = str(price['currency']).lower()
                                if curr_id in currencies:
                                    event_data['price']['currency_details'] = currencies[curr_id]

                            # Auto-calculate coordinates if missing (but don't wait for them)
                            if loc and ('latitude' not in loc or 'longitude' not in loc):
                                country_name = loc.get('country', '')
                                if 'country_details' in loc:
                                    country_name = loc['country_details'].get('name', country_name)
                                get_coordinates(loc.get('address', ''), loc.get('city', ''), countries.get(country_name.lower(), {"name": country_name})["name"], async_fetch=True)

                            events.append(event_data)
                        except yaml.YAMLError as exc:
                            print(f"Error parsing {yaml_path}: {exc}")

    # Sort events chronologically by their start date
    events.sort(key=lambda x: str(x.get('date', '')))
    return events


@app.route('/')
def index():
    """Renders the main page with the list of events."""
    events = load_events()
    return render_template('index.html', events=events)


@app.route('/organizer/<org_id>/image.png')
def organizer_image(org_id):
    """Serves the organizer's image."""
    org_path = os.path.join(ORGANIZERS_DIR, org_id)
    if os.path.exists(org_path) and os.path.isdir(org_path):
        return send_from_directory(org_path, 'image.png')
    abort(404)


@app.route('/api/events')
def api_events():
    """Returns all events as a JSON object for the frontend."""
    events = load_events()
    return jsonify(events)


@app.route('/api/coordinates')
def api_coordinates():
    """Returns coordinates for all events as a JSON object."""
    events = load_events()
    countries = load_countries()
    coordinates = {}
    
    for event in events:
        loc = event.get('location', {})
        if loc:
            # Check if coordinates are already in the event file
            if 'latitude' in loc and 'longitude' in loc:
                coordinates[event['id']] = {
                    'latitude': loc['latitude'],
                    'longitude': loc['longitude']
                }
            else:
                # Try to fetch from cache or Nominatim
                country_code = str(loc.get('country', '')).lower()
                country_name = country_code
                if 'country_details' in loc:
                    country_name = loc['country_details'].get('name', country_name)
                
                # Use the country details we already loaded if possible
                country_data = countries.get(country_code, {"name": country_name})
                
                coords = get_coordinates(
                    loc.get('address', ''), 
                    loc.get('city', ''), 
                    country_data.get("name", country_name), 
                    async_fetch=False  # We want them now for this API call
                )
                if coords:
                    coordinates[event['id']] = coords
                    
    return jsonify(coordinates)


@app.route('/event/<event_id>.ics')
def event_ics(event_id):
    """Generates and returns an iCalendar file for a specific event."""
    events = load_events()
    event_data = next((e for e in events if e.get('id') == event_id), None)

    if not event_data:
        abort(404)

    cal = Calendar()
    cal.add('prodid', '-//OpenTrack//opentrack.dev//')
    cal.add('version', '2.0')

    event = Event()
    event.add('summary', event_data.get('name') or event_data.get('title'))

    # Handle start date
    dt_start = event_data.get('date')
    if isinstance(dt_start, str):
        dt_start = datetime.strptime(dt_start, '%Y-%m-%d').date()
    event.add('dtstart', dt_start)

    # Handle end date if available
    dt_end = event_data.get('end_date')
    if dt_end:
        if isinstance(dt_end, str):
            dt_end = datetime.strptime(dt_end, '%Y-%m-%d').date()
        event.add('dtend', dt_end)

    # Set location string
    location_parts = [
        event_data.get('location', {}).get('address', ''),
        event_data.get('location', {}).get('city'),
        event_data.get('location', {}).get('country')
    ]
    event.add('location', ", ".join(filter(None, location_parts)))

    # Construct detailed description including all available event data
    description_parts = []

    if event_data.get('description'):
        description_parts.append(event_data.get('description'))
        description_parts.append("")  # Empty line for spacing

    fields_to_include = {
        'Organizer': event_data.get('organizer'),
        'Type': event_data.get('type'),
        'Online': 'Yes' if event_data.get('online') else 'No',
        'Language': event_data.get('language'),
        'Speakers': event_data.get('speakers'),
        'URL': event_data.get('url'),
        'Tags': ", ".join(event_data.get('tags', [])) if event_data.get('tags') else None
    }

    price_data = event_data.get('price')
    if price_data:
        if isinstance(price_data, dict):
            currency = price_data.get('currency', '')
            if 'min_amount' in price_data and 'max_amount' in price_data:
                formatted_min = f"{price_data['min_amount']:,}".replace(',', ' ')
                formatted_max = f"{price_data['max_amount']:,}".replace(',', ' ')
                fields_to_include['Price'] = f"{formatted_min} - {formatted_max} {currency}"
            elif 'amount' in price_data:
                formatted_amount = f"{price_data['amount']:,}".replace(',', ' ')
                fields_to_include['Price'] = f"{formatted_amount} {currency}"
        else:
            fields_to_include['Price'] = str(price_data)

    for label, value in fields_to_include.items():
        if value:
            description_parts.append(f"{label}: {value}")

    event.add('description', "\n".join(description_parts))
    event.add('url', event_data.get('url'))
    event['uid'] = f"{event_id}@opentrack.dev"

    if event_data.get('organizer'):
        event.add('organizer', event_data.get('organizer'))

    cal.add_component(event)

    return Response(
        cal.to_ical(),
        mimetype="text/calendar",
        headers={"Content-disposition": f"attachment; filename={event_id}.ics"}
    )


@app.route('/events.ics')
def all_events_ics():
    """Generates and returns a single iCalendar file containing all events."""
    events_data = load_events()
    cal = Calendar()
    cal.add('prodid', '-//OpenTrack//opentrack.dev//')
    cal.add('version', '2.0')
    cal.add('x-wr-calname', 'OpenTrack.dev Events')

    for event_data in events_data:
        event = Event()
        event.add('summary', event_data.get('name') or event_data.get('title'))

        # Start date
        dt_start = event_data.get('date')
        if isinstance(dt_start, str):
            dt_start = datetime.strptime(dt_start, '%Y-%m-%d').date()
        event.add('dtstart', dt_start)

        # End date
        dt_end = event_data.get('end_date')
        if dt_end:
            if isinstance(dt_end, str):
                dt_end = datetime.strptime(dt_end, '%Y-%m-%d').date()
            event.add('dtend', dt_end)

        # Location
        location_parts = [
            event_data.get('location', {}).get('address', ''),
            event_data.get('location', {}).get('city'),
            event_data.get('location', {}).get('country')
        ]
        event.add('location', ", ".join(filter(None, location_parts)))

        # Description
        description_parts = []
        if event_data.get('description'):
            description_parts.append(event_data.get('description'))
            description_parts.append("")

        fields_to_include = {
            'Organizer': event_data.get('organizer'),
            'Type': event_data.get('type'),
            'Online': 'Yes' if event_data.get('online') else 'No',
            'Language': event_data.get('language'),
            'Speakers': event_data.get('speakers'),
            'URL': event_data.get('url'),
            'Tags': ", ".join(event_data.get('tags', [])) if event_data.get('tags') else None
        }

        price_data = event_data.get('price')
        if price_data:
            if isinstance(price_data, dict):
                currency = price_data.get('currency', '')
                if 'min_amount' in price_data and 'max_amount' in price_data:
                    formatted_min = f"{price_data['min_amount']:,}".replace(',', ' ')
                    formatted_max = f"{price_data['max_amount']:,}".replace(',', ' ')
                    fields_to_include['Price'] = f"{formatted_min} - {formatted_max} {currency}"
                elif 'amount' in price_data:
                    formatted_amount = f"{price_data['amount']:,}".replace(',', ' ')
                    fields_to_include['Price'] = f"{formatted_amount} {currency}"
            else:
                fields_to_include['Price'] = str(price_data)

        for label, value in fields_to_include.items():
            if value:
                description_parts.append(f"{label}: {value}")

        event.add('description', "\n".join(description_parts))
        event.add('url', event_data.get('url'))
        event['uid'] = f"{event_data.get('id')}@opentrack.dev"

        if event_data.get('organizer'):
            event.add('organizer', event_data.get('organizer'))

        cal.add_component(event)

    return Response(
        cal.to_ical(),
        mimetype="text/calendar",
        headers={"Content-disposition": "attachment; filename=events.ics"}
    )


if __name__ == '__main__':
    app.run(debug=True)
