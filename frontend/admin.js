// API_BASE and WS_BASE are loaded from config.js


let selectedCategory = null;
let selectedServiceId = null;
let socket = null;

document.addEventListener("DOMContentLoaded", () => {
    if (!checkAdmin()) return;
    fetchSidebarServices();
    initWebSocket();
});

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function initWebSocket() {
    socket = new WebSocket(WS_BASE);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === "queue_update") {
            // If the update is for the currently selected service, refresh the queue
            if (data.service_id === selectedServiceId) {
                loadQueue();
            }
            // Also refresh sidebar counts/status if needed
            fetchSidebarServices();
        }
    };

    socket.onclose = () => {
        setTimeout(initWebSocket, 5000);
    };
}

function checkAdmin() {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');
    
    if (!token || !user || user.is_admin !== 1) {
        alert("Access Denied: Admins Only");
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

async function fetchSidebarServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        const data = await response.json();
        
        const sidebar = document.getElementById('adminSidebar');
        sidebar.innerHTML = ''; 

        appendSidebarSection(sidebar, "Canteens", data.canteens, "canteens");
        appendSidebarSection(sidebar, "Salons", data.salons, "salons");
        appendSidebarSection(sidebar, "Clinics", data.clinics, "clinics");

    } catch (error) {
        console.error("Error fetching services for admin:", error);
    }
}

function appendSidebarSection(parent, titleText, items, category) {
    const iconClass = category === 'canteens' ? 'fa-hamburger' : category === 'salons' ? 'fa-scissors' : 'fa-hospital';
    const title = document.createElement('div');
    title.className = 'sidebar-category';
    title.innerHTML = `<i class="fas ${iconClass}"></i> ${titleText}`;
    parent.appendChild(title);

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'sidebar-btn';
        if (item.id === selectedServiceId) btn.classList.add('active');
        btn.innerHTML = `<i class="fas fa-chevron-right"></i> ${item.name} <span class="badge">${item.queue.length}</span>`;
        btn.onclick = () => selectService(category, item.id, item.name, item.location, btn);
        parent.appendChild(btn);
    });
}

function selectService(category, id, name, location, btnElement) {
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    selectedCategory = category;
    selectedServiceId = id;

    document.getElementById('manageTitle').innerText = name;
    document.getElementById('manageLoc').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${location}`;

    loadQueue();
}

async function loadQueue() {
    if (!selectedCategory || !selectedServiceId) return;

    try {
        const response = await fetch(`${API_BASE}/queue/${selectedCategory}/${selectedServiceId}`);
        const data = await response.json();

        document.getElementById('manageCurrentToken').innerText = data.current_token;

        const tbody = document.getElementById('queueTableBody');
        tbody.innerHTML = '';

        if (data.queue.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No one in queue</td></tr>';
            document.getElementById('nextBtn').disabled = true;
        } else {
            document.getElementById('nextBtn').disabled = false;
            data.queue.forEach((item, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td><strong style="color:var(--accent-color);">${item.token}</strong></td>
                    <td>${item.name}</td>
                    <td>${item.phone}</td>
                `;
                tbody.appendChild(tr);
            });
        }

    } catch (error) {
        console.error("Error loading queue:", error);
    }
}

async function callNext() {
    if (!selectedCategory || !selectedServiceId) return;

    const btn = document.getElementById('nextBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const reqData = {
            category: selectedCategory,
            service_id: selectedServiceId
        };

        const response = await fetch(`${API_BASE}/admin/next`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(reqData)
        });

        const data = await response.json();

        if (response.ok) {
            loadQueue();
        } else {
            if (response.status === 401 || response.status === 403) {
                alert("Session expired or unauthorized. Please login again.");
                window.location.href = 'auth.html';
            } else {
                alert("Error: " + (data.detail || "Action failed"));
            }
        }
    } catch (error) {
        console.error(error);
        alert("Failed to advance queue");
    } finally {
        btn.innerText = "Call Next Person";
        btn.disabled = false;
    }
}
