export function initTabs() {
    const tabButtons = document.querySelectorAll('[data-bs-toggle="pill"]');
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const targetId = button.getAttribute('data-bs-target');
            const targetPane = document.querySelector(targetId);
            
            // Deactivate current active tab
            const activeTab = button.closest('.nav-pills').querySelector('.nav-link.active');
            if (activeTab) activeTab.classList.remove('active');
            
            const activePane = targetPane.parentElement.querySelector('.tab-pane.active');
            if (activePane) {
                activePane.classList.remove('active');
                activePane.classList.remove('show');
            }
            
            // Activate new tab
            button.classList.add('active');
            targetPane.classList.add('active');
            targetPane.classList.add('show');
            
            // Trigger events for other components (Map/Calendar)
            const event = new CustomEvent('tabShown', { detail: { target: targetId } });
            document.dispatchEvent(event);
        });
    });
}

export function initDropdowns() {
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-bs-toggle="dropdown"]');
        if (toggle) {
            const menu = toggle.nextElementSibling;
            const isOpen = menu.classList.contains('show');
            
            // Close all other dropdowns
            document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
            
            if (!isOpen) {
                menu.classList.add('show');
            }
            e.stopPropagation();
        } else {
            document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        }
    });
}

export function showTab(tabId) {
    const button = document.querySelector(`[data-bs-target="${tabId}"]`);
    if (button) button.click();
}
