# OpenTrack.dev

OpenTrack.dev is a community-driven platform for tracking IT events, conferences, and meetups worldwide.

## Features

- **Event Discovery**: Easily find upcoming IT events through a modern web interface.
- **Multiple Views**:
  - **Grid View**: A card-based layout for quick scanning of events.
  - **Calendar View**: A monthly calendar to visualize event dates.
  - **Map View**: An interactive map showing event locations globally.
- **Advanced Filtering**: Filter events by type (Conference, Exhibition, Meetup), timeframe (Future, Past), price (Free), online availability, organizer, or tags.
- **Detailed Event Information**: Each event includes a rich description, location details, pricing (including ranges), language, and speaker counts.
- **Calendar Integration**:
  - Subscribe to all events via Webcal.
  - Download individual event details as ICS files.
  - Export the entire event list in ICS format.
- **API Access**: Retrieve all event data in JSON format via a simple API endpoint.

## Project Structure

- `app/`: Directory containing the application code and data.
  - `app.py`: Flask-based backend handling event loading and ICS generation.
  - `data/events/`: Directory containing event data. Each event is organized in its own folder with:
    - `event.yaml`: Main event metadata (title, date, location, price, etc.).
    - `description.md`: Detailed event description in Markdown format.
  - `static/`: Static assets including CSS, JavaScript, and images.
  - `templates/`: HTML templates for the web interface.
- `Dockerfile`: Instructions for building the Docker image.
- `docker-compose.yml`: Configuration for running the application with Docker Compose.
- `requirements.txt`: Python dependencies.

## Data Synchronization

The project includes a script to synchronize events from Odoo. This can be scheduled to run daily to keep the event list up-to-date.

### Syncing from Odoo (Web Scraping)

The project includes modular, object-oriented synchronization scripts. The Odoo sync script now uses web scraping to fetch public events from an Odoo instance. This is useful when API access is restricted.

1. Set the required environment variables (optional, defaults to https://www.odoo.com):
   ```bash
   export ODOO_URL="https://your-odoo-instance.com"
   ```
2. Run the script:
   ```bash
   python scripts/sync_odoo_events.py
   ```

## How it Works

The system automatically loads events from the `app/data/events` directory. It parses YAML files for structured data and Markdown files for descriptions. Events are automatically sorted chronologically by their start date.

## Running the Project

### Using Docker (Recommended)

The easiest way to get the project running is using Docker:

1. Build and start the container:
   ```bash
   docker-compose up --build
   ```
2. Open your browser at `http://localhost:5000`

### Manual Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the Flask application:
   ```bash
   cd app
   python app.py
   ```
3. Open your browser at `http://127.0.0.1:5000`

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to OpenTrack.dev.
