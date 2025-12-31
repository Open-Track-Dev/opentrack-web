import { initTabs, initDropdowns, showTab } from './modules/ui.js';

document.addEventListener('DOMContentLoaded', function() {
    let allEvents = [];
    let calendar;
    let map;
    let markers = [];

    initTabs();
    initDropdowns();

    function initCalendar() {
        var calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            height: 'auto',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek'
            },
            events: function(info, successCallback, failureCallback) {
                const filtered = getFilteredEvents();
                successCallback(filtered.map(e => {
                    const start = moment(e.date).startOf('day').toISOString();
                    let end = e.date;
                    if (e.end_date) {
                        end = moment(e.end_date).endOf('day').toISOString();
                    } else {
                        end = moment(e.date).endOf('day').toISOString();
                    }
                    return {
                        id: e.id,
                        title: e.name || e.title,
                        start: start,
                        end: end,
                        url: e.url,
                        allDay: !e.end_date || moment(e.date).isSame(e.end_date, 'day'),
                        backgroundColor: e.type === 'Conference' ? '#4f46e5' : (e.type === 'Exhibition' ? '#f59e0b' : '#10b981'),
                        borderColor: e.type === 'Conference' ? '#4f46e5' : (e.type === 'Exhibition' ? '#f59e0b' : '#10b981'),
                        extendedProps: {
                            organizer: e.organizer
                        }
                    };
                }));
            },
            eventClick: function(info) {
                info.jsEvent.preventDefault();
                showTab('#list-view');
                const eventId = info.event.id;
                setTimeout(() => {
                    const element = document.getElementById(`event-${eventId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('highlight-event');
                        setTimeout(() => element.classList.remove('highlight-event'), 3000);
                    }
                }, 300);
            },
            handleWindowResize: true,
            windowResizeDelay: 100
        });
        calendar.render();
    }

    function initMap() {
        // Fix Leaflet default icon paths
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: '/static/vendor/leaflet/images/marker-icon-2x.png',
            iconUrl: '/static/vendor/leaflet/images/marker-icon.png',
            shadowUrl: '/static/vendor/leaflet/images/marker-shadow.png',
        });

        map = L.map('map').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    fetch('/api/events')
        .then(response => response.json())
        .then(events => {
            allEvents = events;
            document.getElementById('event-count').innerText = events.filter(e => moment(e.date).isSameOrAfter(moment().startOf('day'))).length;
            
            const tags = new Set();
            const organizers = new Map();
            events.forEach(e => {
                e.tags.forEach(t => tags.add(t));
                if (e.organizer) {
                    const orgName = (e.organizer_details && e.organizer_details.name) ? e.organizer_details.name : e.organizer;
                    organizers.set(e.organizer, orgName);
                }
            });

            const tagSelect = document.getElementById('filter-tags');
            Array.from(tags).sort().forEach(tag => {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = tag;
                tagSelect.appendChild(option);
            });

            const organizerFilter = document.getElementById('filter-organizer');
            Array.from(organizers.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                organizerFilter.appendChild(option);
            });

            initCalendar();
            initMap();
            loadStateFromUrl();
            renderList(getFilteredEvents());
            updateMarkers(getFilteredEvents());

            document.getElementById('filter-type').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-time').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-free').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-online').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-organizer').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-tags').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('event-search').addEventListener('input', () => { filterAll(); updateUrl(); });

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('event')) {
                const eventId = urlParams.get('event');
                setTimeout(() => {
                    const element = document.getElementById(`event-${eventId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('highlight-event');
                    }
                }, 500);
            }
        });

    function getFilteredEvents() {
        const type = document.getElementById('filter-type').value;
        const timeFilter = document.getElementById('filter-time').value;
        const organizer = document.getElementById('filter-organizer').value;
        const search = document.getElementById('event-search').value.toLowerCase();
        const isFree = document.getElementById('filter-free').checked;
        const isOnline = document.getElementById('filter-online').checked;
        const selectedTags = Array.from(document.getElementById('filter-tags').selectedOptions).map(opt => opt.value);
        const now = moment().startOf('day');

        return allEvents.filter(e => {
            const eventDate = moment(e.date);
            const typeMatch = !type || e.type === type;
            const organizerMatch = !organizer || e.organizer === organizer;
            const searchMatch = !search || 
                (e.name || e.title).toLowerCase().includes(search) || 
                e.location.city.toLowerCase().includes(search) ||
                e.location.country.toLowerCase().includes(search) ||
                e.tags.some(t => t.toLowerCase().includes(search));
            const tagsMatch = selectedTags.length === 0 || selectedTags.some(t => e.tags.includes(t));
            let timeMatch = true;
            if (timeFilter === 'future') {
                timeMatch = eventDate.isSameOrAfter(now);
            } else if (timeFilter === 'past') {
                timeMatch = eventDate.isBefore(now);
            }
            const freeMatch = !isFree || (e.price === 'free' || e.price === 'Free' || (typeof e.price === 'object' && (e.price.amount === 0 || e.price.min_amount === 0)));
            const onlineMatch = !isOnline || e.online === true;
            return typeMatch && organizerMatch && searchMatch && tagsMatch && timeMatch && freeMatch && onlineMatch;
        });
    }

    function updateUrl() {
        const params = new URLSearchParams();
        const search = document.getElementById('event-search').value;
        const type = document.getElementById('filter-type').value;
        const time = document.getElementById('filter-time').value;
        const organizer = document.getElementById('filter-organizer').value;
        const free = document.getElementById('filter-free').checked;
        const online = document.getElementById('filter-online').checked;
        const tags = Array.from(document.getElementById('filter-tags').selectedOptions).map(opt => opt.value);

        if (search) params.set('search', search);
        if (type) params.set('type', type);
        if (time && time !== 'future') params.set('time', time);
        if (organizer) params.set('organizer', organizer);
        if (free) params.set('free', 'true');
        if (online) params.set('online', 'true');
        if (tags.length > 0) params.set('tags', tags.join(','));

        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
    }

    function loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('search')) document.getElementById('event-search').value = params.get('search');
        if (params.has('type')) document.getElementById('filter-type').value = params.get('type');
        if (params.has('time')) document.getElementById('filter-time').value = params.get('time');
        if (params.has('organizer')) document.getElementById('filter-organizer').value = params.get('organizer');
        if (params.has('free')) document.getElementById('filter-free').checked = true;
        if (params.has('online')) document.getElementById('filter-online').checked = true;
        if (params.has('tags')) {
            const tags = params.get('tags').split(',');
            const tagSelect = document.getElementById('filter-tags');
            tags.forEach(tag => {
                const opt = Array.from(tagSelect.options).find(o => o.value === tag);
                if (opt) opt.selected = true;
            });
        }
    }

    function filterAll() {
        const filtered = getFilteredEvents();
        const activeCount = filtered.filter(e => moment(e.date).isSameOrAfter(moment().startOf('day'))).length;
        document.getElementById('event-count').innerText = activeCount;
        renderList(filtered);
        updateMarkers(filtered);
        if (calendar) calendar.refetchEvents();
    }

    function formatPrice(price) {
        if (!price) return 'Contact for price';
        if (price === 'free' || price === 'Free') return 'Free';
        const formatNum = (num) => {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        };
        if (typeof price === 'object') {
            if (price.min_amount !== undefined && price.max_amount !== undefined) {
                return `${formatNum(price.min_amount)} - ${formatNum(price.max_amount)} ${price.currency}`;
            }
            if (price.amount !== undefined) {
                return `${formatNum(price.amount)} ${price.currency}`;
            }
        }
        return price;
    }

    function renderList(events) {
        const list = document.getElementById('event-list');
        const currentYear = moment().year();
        if (events.length === 0) {
            list.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-search display-1 text-muted"></i>
                    <p class="mt-3 text-muted">No events found matching your filters.</p>
                </div>
            `;
            return;
        }
        list.innerHTML = events.map(event => {
            const dateObj = moment(event.date);
            const month = dateObj.format('MMM');
            const day = dateObj.format('D');
            const year = dateObj.year();
            const showYear = year !== currentYear;
            const description = event.description || '';
            
            let speakersText = 'TBA';
            if (event.speakers) {
                if (typeof event.speakers === 'number') {
                    speakersText = `${event.speakers}`;
                } else if (typeof event.speakers === 'object') {
                    const num = event.speakers.number;
                    const more = event.speakers.more;
                    if (num !== undefined) {
                        speakersText = more ? `${num}+` : `${num}`;
                    } else {
                        speakersText = 'TBA';
                    }
                } else {
                    speakersText = event.speakers;
                }
            }
            let badgeColor = '#10b981';
            if (event.type === 'Conference') badgeColor = '#6366f1';
            if (event.type === 'Exhibition') badgeColor = '#f59e0b';
            
            return `
            <div class="card event-card" id="event-${event.id}">
                <div class="date-section">
                    <div class="date-badge-container">
                        <span class="date-badge-month">${month}</span>
                        <span class="date-badge-day">${day}</span>
                        ${showYear ? `<span class="date-badge-year">${year}</span>` : ''}
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div class="d-flex gap-2">
                            <span class="event-type-badge" 
                                  style="background-color: ${badgeColor}; color: white;">
                                ${event.type}
                            </span>
                            ${event.online ? `
                                <span class="event-type-badge bg-primary text-white" style="background-color: #0dcaf0 !important;">
                                    <i class="bi bi-globe me-1"></i>Online
                                </span>
                            ` : ''}
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-link text-muted p-0" data-bs-toggle="dropdown">
                                <i class="bi bi-three-dots-vertical"></i>
                            </button>
                            <ul class="dropdown-menu shadow-sm border-0">
                                <li><a class="dropdown-item py-2" href="/event/${event.id}.ics">
                                    <i class="bi bi-calendar-event me-2"></i>Download ICS
                                </a></li>
                                <li><button class="dropdown-item py-2 share-event" data-id="${event.id}">
                                    <i class="bi bi-share me-2"></i>Copy Link
                                </button></li>
                            </ul>
                        </div>
                    </div>
                    <h4 class="fw-bold mb-1">${event.name || event.title}</h4>
                    <div class="mb-3 d-flex align-items-center">
                        ${event.organizer_details && event.organizer_details.image_url ? `
                            <img src="${event.organizer_details.image_url}" alt="${event.organizer}" class="organizer-img">
                        ` : ''}
                        <span class="text-muted small">
                            by <strong>${event.organizer_details && event.organizer_details.name ? event.organizer_details.name : 'Unknown Organizer'}</strong>
                        </span>
                    </div>
                    <div class="text-muted mb-4">
                        <div class="row">
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-calendar3 me-2 text-primary"></i>
                                <span><strong>Date:</strong> ${moment(event.date).format('MMM D, YYYY')}${event.end_date ? ' — ' + moment(event.end_date).format('MMM D, YYYY') : ''}</span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-geo-alt me-2 text-primary"></i>
                                <span><strong>Location:</strong> ${event.location.city}, ${event.location.country}</span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-ticket-perforated me-2 text-primary"></i>
                                <span><strong>Price:</strong> <span class="price-tag ${formatPrice(event.price) === 'Free' ? 'text-success' : ''}">${formatPrice(event.price)}</span></span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-megaphone me-2 text-primary"></i>
                                <span><strong>Speakers:</strong> ${speakersText}</span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-translate me-2 text-primary"></i>
                                <span><strong>Language:</strong> ${event.language || 'English'}</span>
                            </div>
                            ${event.online ? `
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-globe me-2 text-primary"></i>
                                <span><strong>Access:</strong> Online</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <p class="text-secondary mb-4" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                        ${description}
                    </p>
                    <div class="d-flex flex-wrap gap-2 align-items-center pt-4 border-top mt-2">
                        <div class="d-flex flex-wrap gap-1">
                            ${event.tags.map(tag => `<span class="tag-badge">#${tag}</span>`).join('')}
                        </div>
                        <div class="ms-auto">
                            <a href="${event.url}" class="btn btn-primary" target="_blank">
                                Event Details <i class="bi bi-arrow-up-right ms-1"></i>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            `; }).join('');

        document.querySelectorAll('.share-event').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const url = new URL(window.location.href);
                url.searchParams.set('event', id);
                navigator.clipboard.writeText(url.toString()).then(() => {
                    const originalText = this.innerHTML;
                    this.innerHTML = '<i class="bi bi-check2 me-2"></i>Copied!';
                    setTimeout(() => {
                        this.innerHTML = originalText;
                    }, 2000);
                });
            });
        });
    }

    function updateMarkers(events) {
        if (!map) return;
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        events.forEach(event => {
            if (event.location && event.location.latitude && event.location.longitude) {
                const pos = [event.location.latitude, event.location.longitude];
                const m = L.marker(pos).addTo(map)
                    .bindPopup(`
                        <div class="p-2 text-center">
                            <h6 class="fw-bold mb-1">${event.title}</h6>
                            <p class="small text-muted mb-2">${event.location.city}</p>
                            <button onclick="window.scrollToEvent('${event.id}')" class="btn btn-sm btn-primary w-100">View in List</button>
                        </div>
                    `);
                markers.push(m);
            }
        });
    }

    window.scrollToEvent = function(eventId) {
        showTab('#list-view');
        setTimeout(() => {
            const element = document.getElementById(`event-${eventId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-event');
                setTimeout(() => element.classList.remove('highlight-event'), 3000);
            }
        }, 300);
    };

    document.addEventListener('tabShown', (e) => {
        const targetId = e.detail.target;
        if (targetId === '#calendar-view' && calendar) {
            calendar.render();
            calendar.updateSize();
        } else if (targetId === '#map-view' && map) {
            map.invalidateSize();
        }
    });

    // Community Widget Click Handling
    const communityWidget = document.querySelector('.community-widget');
    const communityTrigger = document.querySelector('.community-trigger');

    if (communityTrigger && communityWidget) {
        communityTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            communityWidget.classList.toggle('active');
        });

        // Close widget when clicking outside
        document.addEventListener('click', function(e) {
            if (!communityWidget.contains(e.target)) {
                communityWidget.classList.remove('active');
            }
        });

        // Close widget on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                communityWidget.classList.remove('active');
            }
        });
    }

    // function loadGithubRepos() { ... removed for static content }
});
