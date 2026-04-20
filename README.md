# 🚀 QueueLess – Smart Queue & Slot Booking System

QueueLess is a **smart queue management system** that allows users to book slots for services like canteens, salons, and clinics.
Instead of waiting in physical lines, users receive a **virtual token** and can track their **live position and estimated waiting time (ETA)**.

---

## 📌 Problem Statement

In places like canteens, salons, and clinics, users often face:

* Long waiting lines
* Uncertainty in waiting time
* Poor queue management

QueueLess solves this by providing a **digital queue system with real-time tracking**.

---

## 🎯 Features

### 👤 User Features

* View available services (canteens, salons, clinics)
* Book a slot and receive a **token (Q1, Q2, …)**
* Track:

  * Current serving token
  * Position in queue
  * Estimated waiting time (ETA)
* Cancel booking (with restrictions)
* Smart notifications (simulated)

---

### 👨‍💼 Admin Features

* View queue for each service
* Call next person in queue
* Manage real-time queue flow

---

## 🏗️ Tech Stack

| Layer    | Technology            |
| -------- | --------------------- |
| Frontend | HTML, CSS, JavaScript |
| Backend  | FastAPI (Python)      |
| Database | JSON (data.json)      |
| API      | REST APIs             |
| Server   | Uvicorn               |

---

## ⚙️ How It Works

### 🔁 Flow

1. User selects a service and books a slot
2. Backend generates a **unique token**
3. User is added to queue (FIFO logic)
4. Admin calls next user
5. System updates queue and notifies users

---

### 📊 Queue Logic

* Queue follows **FIFO (First In First Out)**
* Token generation is **sequential (Q1, Q2, …)**
* ETA is calculated as:

```
ETA = Position × Base Service Time
```

---

## 📂 Project Structure

```
QueueLess/
│
├── index.html          # User interface
├── admin.html          # Admin panel
├── style.css           # Styling
├── script.js           # User-side logic
├── admin.js            # Admin logic
│
├── main.py             # FastAPI backend
├── data.json           # Data storage
├── requirements.txt    # Dependencies
```

---

## 🚀 Installation & Setup

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/QueueLess.git
cd QueueLess
```

### 2️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

### 3️⃣ Run Backend

```bash
uvicorn main:app --reload
```

### 4️⃣ Open Frontend

Open `index.html` in browser

---

## 🔐 Limitations (Current Version)

* Uses JSON instead of database (not scalable)
* No authentication or authorization
* Uses polling instead of real-time WebSockets
* Basic security implementation

---

## 🔮 Future Improvements

* ✅ Add **JWT-based authentication**
* ✅ Role-based access control (Admin/User)
* ✅ Replace JSON with **MySQL / MongoDB**
* ✅ Implement **WebSockets for real-time updates**
* ✅ Add SMS/Email notifications (Twilio)
* ✅ Deploy on cloud (AWS / Render)
* ✅ Mobile app integration

---

## 🧠 Key Concepts Used

* Client-Server Architecture
* REST API
* Queue Data Structure (FIFO)
* Polling Mechanism
* LocalStorage
* Basic System Design

---

## 🤝 Contributing

Contributions are welcome! Feel free to fork this repo and submit pull requests.

---

## 📄 License

This project is for educational purposes.

---

## 👨‍💻 Author

**Amit Raj**

---

⭐ If you like this project, don’t forget to star the repo!
