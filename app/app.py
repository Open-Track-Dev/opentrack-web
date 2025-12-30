from flask import Flask, render_template, jsonify, Response, abort, send_from_directory
import os
import yaml
from datetime import datetime
from icalendar import Calendar, Event

app = Flask(__name__)

EVENTS_DIR = 'data/events'
ORGANIZERS_DIR = 'data/organizers'


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


def load_events():
    """
    Loads all events from the data/events directory and the data root directory.
    Each event is stored in its own subdirectory with an event.yaml and description.md file.
    Events are returned as a list of dictionaries, sorted by date.
    """
    events = []
    organizers = load_organizers()

    dirs_to_scan = [EVENTS_DIR]
    # Also scan data/ for event directories (excluding organizers and known system dirs)
    if os.path.exists('data'):
        for item in os.listdir('data'):
            if item in ['events', 'organizers', 'static', 'templates']:
                continue
            item_path = os.path.join('data', item)
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
