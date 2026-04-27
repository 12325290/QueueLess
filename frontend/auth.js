const API_BASE = "http://localhost:8000/api";

function toggleAuth(mode) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = 'index.html';
        } else {
            alert(data.detail || "Login failed");
        }
    } catch (err) {
        console.error("Login Error Details:", err);
        alert("Server not reachable. Check console (F12) for details.");
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const username = document.getElementById('signupUser').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPass').value;

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            alert("Registration successful! Please login.");
            toggleAuth('login');
        } else {
            alert(data.detail || "Signup failed");
        }
    } catch (err) {
        console.error("Signup Error Details:", err);
        alert("Server not reachable. Check console (F12) for details.");
    }
}
