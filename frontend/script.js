const API_BASE = "http://localhost:8000/api";
const WS_BASE = "ws://localhost:8000/ws";
let currentData = null; // Cache for searching
let socket = null;

document.addEventListener("DOMContentLoaded", () => {
    fetchServices();
    checkActiveBooking();
    updateAuthUI();
    initWebSocket();
});

function initWebSocket() {
    socket = new WebSocket(WS_BASE);

    socket.onopen = () => {
        console.log("Connected to WebSocket");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("WS Message:", data);

        if (data.event === "queue_update" || data.event === "turn_update") {
            // Refresh service cards in the background
            fetchServices(false); // false means don't show loading spinner again
            
            // If user has an active booking, check if it's relevant to them
            const activeData = localStorage.getItem("activeBooking");
            if (activeData) {
                const booking = JSON.parse(activeData);
                if (booking.service_id === data.service_id) {
                    pollQueueStatus(booking);
                }
            }
            
            if (data.event === "turn_update") {
                showNotification(data.message, "info");
            }
        }
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 5s...");
        setTimeout(initWebSocket, 5000);
    };
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function updateAuthUI() {
    const authLinks = document.getElementById('authLinks');
    const user = JSON.parse(localStorage.getItem('user'));

    if (user) {
        authLinks.innerHTML = `
            <div class="user-pill">
                <i class="fas fa-user-circle"></i>
                <span>${user.username}</span>
                <button onclick="handleLogout()" class="logout-btn" title="Logout"><i class="fas fa-sign-out-alt"></i></button>
            </div>
        `;
    } else {
        authLinks.innerHTML = `
            <a href="auth.html" class="btn-primary" style="padding: 0.5rem 1rem; border-radius: 50px;">Login</a>
        `;
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
}

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
async function fetchServices(showLoading = true) {
    const grids = ['canteenGrid', 'salonGrid', 'clinicGrid'];
    if (showLoading) {
        grids.forEach(id => {
            const container = document.getElementById(id);
            if (container) container.innerHTML = '<div class="spinner"></div>';
        });
    }

    try {
        const response = await fetch(`${API_BASE}/services`);
        const data = await response.json();
        currentData = data;
        
        renderCards('canteenGrid', data.canteens, 'canteens');
        renderCards('salonGrid', data.salons, 'salons');
        renderCards('clinicGrid', data.clinics, 'clinics');
    } catch (error) {
        console.error("Error fetching services:", error);
        showNotification("Failed to connect to server", "error");
    }
}

function renderCards(containerId, items, category) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="no-data">No services available.</p>';
        return;
    }

    items.forEach(item => {
        const availableCount = item.available_slots - item.queue.length;
        const etaText = item.estimated_wait_time > 0 ? `~${item.estimated_wait_time}m` : '0m';
        
        const card = document.createElement('div');
        card.className = 'service-card';
        card.innerHTML = `
            <h3>${item.name}</h3>
            <div class="location"><i class="fas fa-map-marker-alt"></i> ${item.location}</div>
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
                <i class="fas ${availableCount <= 0 ? 'fa-ban' : 'fa-calendar-plus'}"></i>
                ${availableCount <= 0 ? 'House Full' : 'Book Slot'}
            </button>
        `;
        container.appendChild(card);
    });
}

// Modal handling
function openBookingModal(serviceId, serviceName, category, slotsLeft) {
    const user = localStorage.getItem('user');
    if (!user) {
        showNotification("Please login to book a slot", "warning");
        setTimeout(() => window.location.href = 'auth.html', 1500);
        return;
    }

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
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const reqData = {
        name: document.getElementById('userName').value,
        phone: document.getElementById('userPhone').value,
        category: document.getElementById('serviceCategory').value,
        service_id: document.getElementById('serviceId').value
    };

    try {
        const response = await fetch(`${API_BASE}/book`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(reqData)
        });

        const data = await response.json();

        if (!response.ok) {
            showNotification(data.detail || "Booking failed", "error");
            btn.disabled = false;
            btn.innerText = "Confirm Booking";
            return;
        }

        // Setup local storage to track active token
        const activeBooking = {
            category: reqData.category,
            service_id: reqData.service_id,
            token: data.token,
            service_name: document.getElementById('modalTitle').innerText.replace('Book at ', '')
        };
        localStorage.setItem("activeBooking", JSON.stringify(activeBooking));

        // Close modal and show notification
        closeModal();
        showNotification(data.message || `Booking confirmed! Token ${data.token}`, "success");
        
        // Refresh UI
        fetchServices(false);
        checkActiveBooking();

    } catch (error) {
        console.error(error);
        showNotification("Failed to connect to server", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirm Booking";
    }
}

// Cancel Booking
async function cancelBooking() {
    const positionState = document.getElementById('positionDisplay').innerText;
    if (positionState === "TURN!" || positionState === "Done" || positionState === "Invalid") {
        showNotification("Token is currently being served or passed. Cannot cancel.", "warning");
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
            headers: getAuthHeaders(),
            body: JSON.stringify({
                category: booking.category,
                service_id: booking.service_id,
                token: booking.token
            })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.removeItem("activeBooking");
            showNotification(data.message, "success");
            checkActiveBooking();
            fetchServices(false);
        } else {
            showNotification(data.detail || "Could not cancel", "error");
        }
    } catch(err) {
        console.error(err);
        showNotification("Failed to connect to server", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
    }
}

// Notification System
function showNotification(message, type = "info") {
    const toast = document.getElementById('notificationToast');
    const toastMsg = document.getElementById('toastMessage');
    
    // Set icon based on type
    let icon = "fa-bell";
    if (type === "success") icon = "fa-check-circle";
    if (type === "error") icon = "fa-exclamation-circle";
    if (type === "warning") icon = "fa-exclamation-triangle";
    
    toast.className = `toast show ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${icon}"></i>
            <p>${message}</p>
        </div>
    `;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

// Track active booking
function checkActiveBooking() {
    const activeData = localStorage.getItem("activeBooking");
    const statusDiv = document.getElementById('activeStatus');

    if (!activeData) {
        statusDiv.classList.add('hidden');
        return;
    }

    statusDiv.classList.remove('hidden');
    const booking = JSON.parse(activeData);
    document.getElementById('userTokenDisplay').innerText = booking.token;

    // Initial fetch
    pollQueueStatus(booking);
}

async function pollQueueStatus(booking) {
    try {
        const response = await fetch(`${API_BASE}/queue/${booking.category}/${booking.service_id}`);
        if (!response.ok) return;

        const data = await response.json();
        
        document.getElementById('servingTokenDisplay').innerText = data.current_token;

        let position = 0;
        let found = false;
        for (let i = 0; i < data.queue.length; i++) {
            if (data.queue[i].token === booking.token) {
                position = i + 1;
                found = true;
                break;
            }
        }

        const cancelBtn = document.getElementById('cancelBtn');

        if (found) {
            document.getElementById('positionDisplay').innerText = position;
            document.getElementById('etaDisplay').innerText = `~${position * data.base_wait_time}m`;
            cancelBtn.disabled = false;
            
            // Update Progress Bar
            updateQueueProgress(position, data.queue_length);
            
            // Notification logic
            if (position <= 2) {
                const warned = sessionStorage.getItem("warned_token_" + booking.token);
                if (!warned) {
                    showNotification(`Your turn is approaching! Current position: ${position}`, "warning");
                    sessionStorage.setItem("warned_token_" + booking.token, "true");
                }
            }
        } else {
            if (data.current_token === booking.token) {
                document.getElementById('positionDisplay').innerText = "TURN!";
                document.getElementById('etaDisplay').innerText = "0m";
                cancelBtn.disabled = true;
                updateQueueProgress(0, 1);
                
                const warnedServe = sessionStorage.getItem("served_token_" + booking.token);
                if (!warnedServe) {
                    showNotification(`It's your turn now! Please proceed.`, "success");
                    sessionStorage.setItem("served_token_" + booking.token, "true");
                }
            } else {
                const tokenNum = parseInt(booking.token.replace('Q', '')) || 0;
                const currTokenNum = parseInt(data.current_token.replace('Q', '')) || 0;
                
                if (currTokenNum >= tokenNum) {
                    document.getElementById('positionDisplay').innerText = "Done";
                    document.getElementById('etaDisplay').innerText = "-";
                    updateQueueProgress(0, 1);
                    setTimeout(() => {
                        localStorage.removeItem("activeBooking");
                        checkActiveBooking();
                    }, 5000);
                } else {
                    document.getElementById('positionDisplay').innerText = "Expired";
                    setTimeout(() => {
                        localStorage.removeItem("activeBooking");
                        checkActiveBooking();
                    }, 3000);
                }
            }
        }

    } catch (error) {
        console.error("Status check error", error);
    }
}

function updateQueueProgress(pos, total) {
    const progressFill = document.getElementById('queueProgressFill');
    if (!progressFill) return;
    
    // pos 1 means you are next. pos 10 means 9 people ahead.
    // Progress % = (total - pos + 1) / total * 100
    const percentage = ((total - pos + 1) / (total + 1)) * 100;
    progressFill.style.width = `${Math.max(5, percentage)}%`;
}
