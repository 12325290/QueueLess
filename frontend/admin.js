const API_BASE = "http://localhost:8000/api";

let selectedCategory = null;
let selectedServiceId = null;

document.addEventListener("DOMContentLoaded", () => {
    fetchSidebarServices();
});

async function fetchSidebarServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        const data = await response.json();
        
        const sidebar = document.getElementById('adminSidebar');
        sidebar.innerHTML = ''; // clear

        // Canteens section
        appendSidebarSection(sidebar, "Canteens", data.canteens, "canteens");
        // Salons section
        appendSidebarSection(sidebar, "Salons", data.salons, "salons");
        // Clinics section
        appendSidebarSection(sidebar, "Clinics", data.clinics, "clinics");

    } catch (error) {
        console.error("Error fetching services for admin:", error);
    }
}

function appendSidebarSection(parent, titleText, items, category) {
    const title = document.createElement('h3');
    title.innerText = titleText;
    parent.appendChild(title);

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'sidebar-btn';
        btn.innerText = item.name;
        btn.onclick = () => selectService(category, item.id, item.name, item.location, btn);
        parent.appendChild(btn);
    });
}

function selectService(category, id, name, location, btnElement) {
    // UI update for active button
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    selectedCategory = category;
    selectedServiceId = id;

    // Update Header
    document.getElementById('manageTitle').innerText = name;
    document.getElementById('manageLoc').innerText = "📍 " + location;

    // Fetch and render queue
    loadQueue();
}

async function loadQueue() {
    if (!selectedCategory || !selectedServiceId) return;

    try {
        const response = await fetch(`${API_BASE}/queue/${selectedCategory}/${selectedServiceId}`);
        const data = await response.json();

        // Update current token
        document.getElementById('manageCurrentToken').innerText = data.current_token;

        // Render table
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
    btn.innerText = "Processing...";

    try {
        const reqData = {
            category: selectedCategory,
            service_id: selectedServiceId
        };

        const response = await fetch(`${API_BASE}/admin/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqData)
        });

        const data = await response.json();

        if (response.ok) {
            // refresh
            loadQueue();
        } else {
            alert("Error: " + data.detail);
        }
    } catch (error) {
        console.error(error);
        alert("Failed to advance queue");
    } finally {
        btn.innerText = "Call Next Person";
    }
}
