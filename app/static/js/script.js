import { initTabs, initDropdowns, showTab } from './modules/ui.js';

document.addEventListener('DOMContentLoaded', function() {
    let allEvents = [];
    let calendar;
    let map;
    let markers = [];
    let tomSelects = {};

    initTabs();
    initDropdowns();

    function initTomSelect(id) {
        if (tomSelects[id]) return tomSelects[id];
        const el = document.getElementById(id);
        if (!el) return null;
        
        const config = {
            plugins: ['remove_button'],
            create: false,
            onItemAdd: function() {
                this.setTextboxValue('');
                this.refreshOptions();
            },
            onDropdownOpen: () => {
                // Fix for Tom Select in scrollable areas
            }
        };

        if (id === 'filter-organizer') {
            config.render = {
                option: function(data, escape) {
                    const icon = data.icon || el.querySelector(`option[value="${data.value}"]`)?.getAttribute('data-icon');
                    return `<div>
                        ${icon ? `<img src="${escape(icon)}" class="organizer-filter-img" onerror="this.style.display='none'">` : ''}
                        <span>${escape(data.text)}</span>
                    </div>`;
                },
                item: function(data, escape) {
                    const icon = data.icon || el.querySelector(`option[value="${data.value}"]`)?.getAttribute('data-icon');
                    return `<div>
                        ${icon ? `<img src="${escape(icon)}" class="organizer-filter-img-small" onerror="this.style.display='none'">` : ''}
                        <span>${escape(data.text)}</span>
                    </div>`;
                }
            };
            // Ensure data-icon is available in the data object
            config.dataAttr = 'data-data';
        }

        tomSelects[id] = new TomSelect(el, config);
        
        tomSelects[id].on('change', () => {
            filterAll();
            updateUrl();
        });
        
        return tomSelects[id];
    }

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
                    const startDate = new Date(e.date);
                    startDate.setHours(0, 0, 0, 0);
                    const start = startDate.toISOString();
                    
                    let end;
                    if (e.end_date) {
                        const endDate = new Date(e.end_date);
                        endDate.setHours(23, 59, 59, 999);
                        end = endDate.toISOString();
                    } else {
                        const endDate = new Date(e.date);
                        endDate.setHours(23, 59, 59, 999);
                        end = endDate.toISOString();
                    }
                    
                    const isAllDay = !e.end_date || e.date === e.end_date;

                    return {
                        id: e.id,
                        title: e.name || e.title,
                        start: start,
                        end: end,
                        url: e.url,
                        allDay: isAllDay,
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
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            document.getElementById('event-count').innerText = events.filter(e => new Date(e.date) >= today).length;
            
            const tags = new Set();
            const organizers = new Map();
            const languages = new Map();
            const countries = new Map();
            
            events.forEach(e => {
                e.tags.forEach(t => tags.add(t));
                if (e.organizer) {
                    const orgName = (e.organizer_details && e.organizer_details.name) ? e.organizer_details.name : e.organizer;
                    const orgIcon = (e.organizer_details && e.organizer_details.image_url) ? e.organizer_details.image_url : null;
                    organizers.set(e.organizer, {name: orgName, icon: orgIcon});
                }
                const langName = (e.language_details && e.language_details.name) ? e.language_details.name : (e.language || 'en');
                const langId = (e.language_details && e.language_details.id) ? e.language_details.id : (e.language || 'en').toLowerCase();
                languages.set(langId, langName);
                
                const countryId = (e.location && e.location.country) ? e.location.country.toLowerCase() : 'unknown';
                const countryName = (e.location && e.location.country_details && e.location.country_details.name) ? e.location.country_details.name : countryId;
                countries.set(countryId, countryName);
            });

            const countryFilter = document.getElementById('filter-country');
            Array.from(countries.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                const countryEvent = events.find(e => e.location && e.location.country && e.location.country.toLowerCase() === id);
                const icon = (countryEvent && countryEvent.location.country_details) ? countryEvent.location.country_details.icon : '';
                option.textContent = icon ? `${icon} ${name}` : name;
                countryFilter.appendChild(option);
            });

            const cityFilter = document.getElementById('filter-city');
            // Cities will be populated based on selected country or all if none selected
            function updateCityFilter() {
                const selectedCountries = tomSelects['filter-country'] ? tomSelects['filter-country'].getValue() : [];
                const cities = new Set();
                events.forEach(e => {
                    const countryId = (e.location && e.location.country) ? e.location.country.toLowerCase() : 'unknown';
                    if (selectedCountries.length === 0 || selectedCountries.includes(countryId)) {
                        if (e.location && e.location.city) cities.add(e.location.city);
                    }
                });
                
                if (tomSelects['filter-city']) {
                    const currentSelected = tomSelects['filter-city'].getValue();
                    tomSelects['filter-city'].clearOptions();
                    Array.from(cities).sort().forEach(city => {
                        tomSelects['filter-city'].addOption({value: city, text: city});
                    });
                    tomSelects['filter-city'].setValue(currentSelected);
                } else {
                    Array.from(cities).sort().forEach(city => {
                        const option = document.createElement('option');
                        option.value = city;
                        option.textContent = city;
                        cityFilter.appendChild(option);
                    });
                }
            }
            updateCityFilter();

            const tagSelect = document.getElementById('filter-tags');
            Array.from(tags).sort().forEach(tag => {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = tag;
                tagSelect.appendChild(option);
            });

            const organizerFilter = document.getElementById('filter-organizer');
            Array.from(organizers.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([id, data]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = data.name;
                if (data.icon) {
                    option.setAttribute('data-icon', data.icon);
                }
                organizerFilter.appendChild(option);
            });
            
            const languageFilter = document.getElementById('filter-language');
            Array.from(languages.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                languageFilter.appendChild(option);
            });

            initTomSelect('filter-country');
            initTomSelect('filter-city');
            initTomSelect('filter-type');
            initTomSelect('filter-organizer');
            initTomSelect('filter-language');
            initTomSelect('filter-tags');

            if (tomSelects['filter-country']) {
                tomSelects['filter-country'].on('change', () => {
                    updateCityFilter();
                    filterAll();
                    updateUrl();
                });
            }

            loadStateFromUrl();
            renderList(getFilteredEvents());

            document.getElementById('filter-time').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-free').addEventListener('change', () => { filterAll(); updateUrl(); });
            document.getElementById('filter-online').addEventListener('change', () => { filterAll(); updateUrl(); });
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

            // After events are loaded and rendered, fetch coordinates asynchronously
            fetchCoordinates();
        });

    function fetchCoordinates() {
        fetch('/api/coordinates')
            .then(response => response.json())
            .then(coordsMap => {
                allEvents.forEach(event => {
                    if (coordsMap[event.id]) {
                        event.location.latitude = coordsMap[event.id].latitude;
                        event.location.longitude = coordsMap[event.id].longitude;
                    }
                });
                // Update map if it's already initialized
                if (map) {
                    updateMarkers(getFilteredEvents());
                }
            })
            .catch(error => console.error('Error fetching coordinates:', error));
    }

    function getFilteredEvents() {
        const selectedCountries = tomSelects['filter-country'] ? tomSelects['filter-country'].getValue() : [];
        const selectedCities = tomSelects['filter-city'] ? tomSelects['filter-city'].getValue() : [];
        const selectedTypes = tomSelects['filter-type'] ? tomSelects['filter-type'].getValue() : [];
        const timeFilter = document.getElementById('filter-time').value;
        const selectedOrganizers = tomSelects['filter-organizer'] ? tomSelects['filter-organizer'].getValue() : [];
        const selectedLanguages = tomSelects['filter-language'] ? tomSelects['filter-language'].getValue() : [];
        const search = document.getElementById('event-search').value.toLowerCase();
        const isFree = document.getElementById('filter-free').checked;
        const isOnline = document.getElementById('filter-online').checked;
        const selectedTags = tomSelects['filter-tags'] ? tomSelects['filter-tags'].getValue() : [];
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return allEvents.filter(e => {
            const eventDate = new Date(e.date);
            eventDate.setHours(0, 0, 0, 0);
            
            const countryId = (e.location && e.location.country) ? e.location.country.toLowerCase() : 'unknown';
            const countryMatch = selectedCountries.length === 0 || selectedCountries.includes(countryId);
            const cityMatch = selectedCities.length === 0 || (e.location && selectedCities.includes(e.location.city));
            
            const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(e.type);
            const organizerMatch = selectedOrganizers.length === 0 || selectedOrganizers.includes(e.organizer);
            
            const eventLangId = (e.language_details && e.language_details.id) ? e.language_details.id : (e.language || 'en').toLowerCase();
            const languageMatch = selectedLanguages.length === 0 || selectedLanguages.includes(eventLangId);
            
            const searchMatch = !search || 
                (e.name || e.title).toLowerCase().includes(search) || 
                e.location.city.toLowerCase().includes(search) ||
                e.location.country.toLowerCase().includes(search) ||
                e.tags.some(t => t.toLowerCase().includes(search));
            const tagsMatch = selectedTags.length === 0 || selectedTags.some(t => e.tags.includes(t));
            let timeMatch = true;
            if (timeFilter === 'future') {
                timeMatch = eventDate >= now;
            } else if (timeFilter === 'past') {
                timeMatch = eventDate < now;
            }
            const freeMatch = !isFree || (e.price === 'free' || e.price === 'Free' || (typeof e.price === 'object' && (e.price.amount === 0 || e.price.min_amount === 0)));
            const onlineMatch = !isOnline || e.online === true;
            return countryMatch && cityMatch && typeMatch && organizerMatch && languageMatch && searchMatch && tagsMatch && timeMatch && freeMatch && onlineMatch;
        });
    }

    function updateUrl() {
        const params = new URLSearchParams();
        const search = document.getElementById('event-search').value;
        const countries = tomSelects['filter-country'] ? tomSelects['filter-country'].getValue() : [];
        const cities = tomSelects['filter-city'] ? tomSelects['filter-city'].getValue() : [];
        const types = tomSelects['filter-type'] ? tomSelects['filter-type'].getValue() : [];
        const time = document.getElementById('filter-time').value;
        const organizers = tomSelects['filter-organizer'] ? tomSelects['filter-organizer'].getValue() : [];
        const languages = tomSelects['filter-language'] ? tomSelects['filter-language'].getValue() : [];
        const free = document.getElementById('filter-free').checked;
        const online = document.getElementById('filter-online').checked;
        const tags = tomSelects['filter-tags'] ? tomSelects['filter-tags'].getValue() : [];

        if (search) params.set('search', search);
        if (countries.length > 0) params.set('country', countries.join(','));
        if (cities.length > 0) params.set('city', cities.join(','));
        if (types.length > 0) params.set('type', types.join(','));
        if (time && time !== 'future') params.set('time', time);
        if (organizers.length > 0) params.set('organizer', organizers.join(','));
        if (languages.length > 0) params.set('language', languages.join(','));
        if (free) params.set('free', 'true');
        if (online) params.set('online', 'true');
        if (tags.length > 0) params.set('tags', tags.join(','));

        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
    }

    function loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('search')) document.getElementById('event-search').value = params.get('search');
        
        if (params.has('country')) {
            const countries = params.get('country').split(',');
            if (tomSelects['filter-country']) {
                tomSelects['filter-country'].setValue(countries);
                updateCityFilter();
            }
        }

        if (params.has('city')) {
            const cities = params.get('city').split(',');
            if (tomSelects['filter-city']) tomSelects['filter-city'].setValue(cities);
        }

        if (params.has('type')) {
            const types = params.get('type').split(',');
            if (tomSelects['filter-type']) tomSelects['filter-type'].setValue(types);
        }
        
        if (params.has('time')) document.getElementById('filter-time').value = params.get('time');
        
        if (params.has('organizer')) {
            const orgs = params.get('organizer').split(',');
            if (tomSelects['filter-organizer']) tomSelects['filter-organizer'].setValue(orgs);
        }

        if (params.has('language')) {
            const langs = params.get('language').split(',');
            if (tomSelects['filter-language']) tomSelects['filter-language'].setValue(langs);
        }

        if (params.has('free')) document.getElementById('filter-free').checked = true;
        if (params.has('online')) document.getElementById('filter-online').checked = true;
        
        if (params.has('tags')) {
            const tags = params.get('tags').split(',');
            if (tomSelects['filter-tags']) tomSelects['filter-tags'].setValue(tags);
        }
    }

    function filterAll() {
        const filtered = getFilteredEvents();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeCount = filtered.filter(e => new Date(e.date) >= today).length;
        document.getElementById('event-count').innerText = activeCount;
        renderList(filtered);
        if (map) updateMarkers(filtered);
        if (calendar) calendar.refetchEvents();
    }

    function formatPrice(price) {
        if (!price) return 'Contact for price';
        if (price === 'free' || price === 'Free') return 'Free';
        const formatNum = (num) => {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        };
        if (typeof price === 'object') {
            const currencySymbol = (price.currency_details && price.currency_details.symbol) ? price.currency_details.symbol : (price.currency || '€');
            if (price.min_amount !== undefined && price.max_amount !== undefined) {
                return `${formatNum(price.min_amount)} - ${formatNum(price.max_amount)} ${currencySymbol}`;
            }
            if (price.amount !== undefined) {
                return `${formatNum(price.amount)} ${currencySymbol}`;
            }
        }
        return price;
    }

    function renderList(events) {
        const list = document.getElementById('event-list');
        const currentYear = new Date().getFullYear();
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
            const dateObj = new Date(event.date);
            const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
            const day = dateObj.getDate();
            const year = dateObj.getFullYear();
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
                                <span><strong>Date:</strong> ${new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${event.end_date ? ' — ' + new Date(event.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-geo-alt me-2 text-primary"></i>
                                <span><strong>Location:</strong> ${event.location.city}, ${event.location.country_details && event.location.country_details.icon ? event.location.country_details.icon + ' ' : ''}${event.location.country_details && event.location.country_details.name ? event.location.country_details.name : event.location.country}</span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-ticket-perforated me-2 text-primary"></i>
                                <span><strong>Price:</strong> <span class="price-tag ${formatPrice(event.price) === 'Free' ? 'text-success' : ''}">${formatPrice(event.price)}</span></span>
                            </div>
                            <div class="col-md-6 mb-2 small d-flex align-items-center">
                                <i class="bi bi-translate me-2 text-primary"></i>
                                <span><strong>Language:</strong> ${event.language_details && event.language_details.name ? event.language_details.name : (event.language || 'en')}</span>
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
        if (targetId === '#calendar-view') {
            if (!calendar) {
                initCalendar();
            } else {
                calendar.render();
                calendar.updateSize();
            }
        } else if (targetId === '#map-view') {
            if (!map) {
                initMap();
                updateMarkers(getFilteredEvents());
            } else {
                map.invalidateSize();
            }
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
