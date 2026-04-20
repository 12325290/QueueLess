const API_BASE = "http://localhost:8000/api";
let currentData = null; // Cache for searching

document.addEventListener("DOMContentLoaded", () => {
    fetchServices();
    checkActiveBooking();
});

// Search Filter
function filterServices() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    if (!currentData) return;

    ['canteens', 'salons', 'clinics'].forEach(cat => {
        const filtered = currentData[cat].filter(item => 
            item.name.toLowerCase().includes(query) || 
            item.location.toLowerCase().includes(query)
        );
        renderCards(cat === 'canteens' ? 'canteenGrid' : cat === 'salons' ? 'salonGrid' : 'clinicGrid', filtered, cat);
    });
}

// Fetch services and render them
async function fetchServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        const data = await response.json();
        currentData = data;
        
        renderCards('canteenGrid', data.canteens, 'canteens');
        renderCards('salonGrid', data.salons, 'salons');
        renderCards('clinicGrid', data.clinics, 'clinics');
    } catch (error) {
        console.error("Error fetching services:", error);
    }
}

function renderCards(containerId, items, category) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // clear spinner

    if (!items || items.length === 0) {
        container.innerHTML = '<p>No services matched.</p>';
        return;
    }

    items.forEach(item => {
        const availableCount = item.available_slots - item.queue.length;
        const etaText = item.estimated_wait_time > 0 ? `~${item.estimated_wait_time}m` : '0m';
        
        const card = document.createElement('div');
        card.className = 'service-card glass-card';
        card.innerHTML = `
            <h3>${item.name}</h3>
            <div class="location">📍 ${item.location}</div>
            <div class="live-tags">
                <div class="tag">
                    <span>Serving</span>
                    <strong>${item.current_token}</strong>
                </div>
                <div class="tag" style="text-align:right;">
                    <span>Wait Time</span>
                    <strong>${etaText}</strong>
                </div>
            </div>
            <button class="btn-primary" 
                    onclick="openBookingModal('${item.id}', '${item.name}', '${category}', ${availableCount})"
                    ${availableCount <= 0 ? 'disabled' : ''}>
                ${availableCount <= 0 ? 'House Full' : 'Book Slot'}
            </button>
        `;
        container.appendChild(card);
    });
}

// Modal handling
function openBookingModal(serviceId, serviceName, category, slotsLeft) {
    document.getElementById('serviceId').value = serviceId;
    document.getElementById('serviceCategory').value = category;
    document.getElementById('modalTitle').innerText = `Book at ${serviceName}`;
    document.getElementById('slotsLeft').innerText = slotsLeft;
    
    document.getElementById('bookingModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('bookingModal').classList.add('hidden');
    document.getElementById('bookingForm').reset();
}

// Handle Form Submit
async function submitBooking(e) {
    e.preventDefault();
    const btn = document.getElementById('bookBtn');
    btn.disabled = true;
    btn.innerText = "Booking...";

    const reqData = {
        name: document.getElementById('userName').value,
        phone: document.getElementById('userPhone').value,
        category: document.getElementById('serviceCategory').value,
        service_id: document.getElementById('serviceId').value
    };

    try {
        const response = await fetch(`${API_BASE}/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqData)
        });

        const data = await response.json();

        if (!response.ok) {
            alert("Error: " + data.detail);
            btn.disabled = false;
            btn.innerText = "Confirm Booking";
            return;
        }

        // Setup local storage to track active token
        const activeBooking = {
            category: reqData.category,
            service_id: reqData.service_id,
            token: data.token
        };
        localStorage.setItem("activeBooking", JSON.stringify(activeBooking));

        // Close modal and show notification
        closeModal();
        showNotification(data.message || `Booking confirmed! Token ${data.token}`);
        
        // Refresh UI
        fetchServices();
        checkActiveBooking();

    } catch (error) {
        console.error(error);
        alert("Failed to connect to server");
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirm Booking";
    }
}

// Cancel Booking
async function cancelBooking() {
    const positionState = document.getElementById('positionDisplay').innerText;
    if (positionState === "TURN!" || positionState === "Done" || positionState === "Invalid") {
        showNotification("Token is currently being served or passed. Cannot cancel.");
        return;
    }

    if (!confirm("Are you sure you want to cancel your booking?")) return;
    
    const btn = document.getElementById('cancelBtn');
    btn.disabled = true;
    btn.innerText = "Cancelling...";

    const activeData = localStorage.getItem("activeBooking");
    if (!activeData) return;
    const booking = JSON.parse(activeData);

    try {
        const response = await fetch(`${API_BASE}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: booking.category,
                service_id: booking.service_id,
                token: booking.token
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === "cancelled") {
                localStorage.removeItem("activeBooking");
                showNotification(data.message);
                checkActiveBooking();
                fetchServices();
            } else {
                // Not found, already served, etc
                localStorage.removeItem("activeBooking");
                showNotification(data.message);
                checkActiveBooking();
            }
        } else {
            const data = await response.json();
            showNotification("Could not cancel: " + (data.detail || "Server error"));
        }
    } catch(err) {
        console.error(err);
        showNotification("Failed to connect to server");
    } finally {
        btn.disabled = false;
        btn.innerText = "Cancel";
    }
}

// Notification System (Simulated SMS)
function showNotification(message) {
    const toast = document.getElementById('notificationToast');
    document.getElementById('toastMessage').innerText = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}

// Polling interval tracker
let pollInterval = null;

// Track active booking and poll for updates
function checkActiveBooking() {
    const activeData = localStorage.getItem("activeBooking");
    const statusDiv = document.getElementById('activeStatus');

    if (!activeData) {
        statusDiv.classList.add('hidden');
        if (pollInterval) clearInterval(pollInterval);
        return;
    }

    statusDiv.classList.remove('hidden');
    const booking = JSON.parse(activeData);
    document.getElementById('userTokenDisplay').innerText = booking.token;

    // Initial fetch
    pollQueueStatus(booking);

    // Setup polling every 5 seconds
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
        pollQueueStatus(booking);
    }, 5000);
}

async function pollQueueStatus(booking) {
    try {
        const response = await fetch(`${API_BASE}/queue/${booking.category}/${booking.service_id}`);
        if (!response.ok) return;

        const data = await response.json();
        
        // Restore Serving Now display updates 
        document.getElementById('servingTokenDisplay').innerText = data.current_token;

        let position = 0;
        let found = false;
        for (let i = 0; i < data.queue.length; i++) {
            if (data.queue[i].token === booking.token) {
                position = i + 1; // 1-indexed position
                found = true;
                break;
            }
        }

        const cancelBtn = document.getElementById('cancelBtn');

        if (found) {
            document.getElementById('positionDisplay').innerText = position;
            // ETA Calculation
            document.getElementById('etaDisplay').innerText = `~${position * data.base_wait_time}m`;
            cancelBtn.disabled = false;
            cancelBtn.innerText = "Cancel";
            
            // Notification logic (Your turn is coming up!)
            if (position === 2) {
                const warned = sessionStorage.getItem("warned_token_" + booking.token);
                if (!warned) {
                    showNotification(`SMS: Your turn is approaching in ~${position * data.base_wait_time}m! Be ready!`);
                    sessionStorage.setItem("warned_token_" + booking.token, "true");
                }
            }
        } else {
            // Check if our token is currently serving
            if (data.current_token === booking.token) {
                document.getElementById('positionDisplay').innerText = "TURN!";
                document.getElementById('etaDisplay').innerText = "0m";
                cancelBtn.disabled = true;
                cancelBtn.innerText = "Cannot Cancel";
                
                const warnedServe = sessionStorage.getItem("served_token_" + booking.token);
                if (!warnedServe) {
                    showNotification(`SMS: It's your turn now! Token ${booking.token}`);
                    sessionStorage.setItem("served_token_" + booking.token, "true");
                }
            } else {
                // Token is missing and not currently serving
                // Triggers if turn passed, cancelled by admin, or backend JSON reset
                const tokenNum = parseInt(booking.token.replace('Q', '')) || 0;
                const currTokenNum = parseInt(data.current_token.replace('Q', '')) || 0;
                
                cancelBtn.disabled = true;
                cancelBtn.innerText = "Cannot Cancel";

                if (tokenNum <= currTokenNum || currTokenNum === 0 || isNaN(currTokenNum)) {
                    // Turn definitely passed or server reset
                    document.getElementById('positionDisplay').innerText = "Done";
                    document.getElementById('etaDisplay').innerText = "-";
                    setTimeout(() => {
                        localStorage.removeItem("activeBooking");
                        checkActiveBooking();
                    }, 5000);
                } else {
                     // Odd edge case
                     document.getElementById('positionDisplay').innerText = "Invalid";
                     document.getElementById('etaDisplay').innerText = "-";
                     setTimeout(() => {
                        localStorage.removeItem("activeBooking");
                        checkActiveBooking();
                     }, 3000);
                }
            }
        }

    } catch (error) {
        console.error("Polling error", error);
    }
}
