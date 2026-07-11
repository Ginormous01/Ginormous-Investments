// Frontend API Configuration
const API_BASE = 'http://localhost:5000/api';

// Utility function to make API calls
async function apiCall(endpoint, method = 'GET', payload = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (payload) options.body = JSON.stringify(payload);
  
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json()
  };
}

// Content API
async function loadContent() {
  return apiCall('/content');
}

async function saveContent(updates) {
  return apiCall('/content', 'POST', updates);
}

// Auth API
async function login(email, password) {
  return apiCall('/auth/login', 'POST', { email, password });
}

async function register(email, password, name, position, role = 'staff', image = '') {
  return apiCall('/auth/register', 'POST', { email, password, name, position, role, image });
}

async function verifyEmail(email, token) {
  return apiCall('/auth/verify-email', 'POST', { email, token });
}

async function resendVerification(email) {
  return apiCall('/auth/resend-verification', 'POST', { email });
}

async function forgotPassword(email) {
  return apiCall('/auth/forgot-password', 'POST', { email });
}

async function resetPassword(email, token, newPassword) {
  return apiCall('/auth/reset-password', 'POST', { email, token, newPassword });
}

async function checkAuthStatus(email) {
  return apiCall('/auth/check-status', 'POST', { email });
}

// Users API
async function getUsers(role = null) {
  const endpoint = role ? `/users?role=${role}` : '/users';
  return apiCall(endpoint);
}

async function addUser(email, password, name, position, image = '') {
  return apiCall('/users', 'POST', { email, password, name, position, role: 'staff', image });
}

async function updateUser(email, name, position, password) {
  return apiCall(`/users/${email}`, 'PATCH', { name, position, password });
}

async function deleteUser(email) {
  return apiCall(`/users/${email}`, 'DELETE');
}

async function suspendUser(email) {
  return apiCall('/users/suspend', 'PATCH', { email });
}

async function unsuspendUser(email) {
  return apiCall('/users/unsuspend', 'PATCH', { email });
}

async function promoteUser(email) {
  return apiCall('/users/promote', 'PATCH', { email });
}

async function demoteUser(email) {
  return apiCall('/users/demote', 'PATCH', { email });
}

// Properties API
async function getProperties() {
  return apiCall('/properties');
}

async function addProperty(title, description, tag, price, meta, image, status = 'available', prices = null) {
  const payload = { title, description, tag, price, meta, image, status };
  if (prices) payload.prices = prices;
  return apiCall('/properties', 'POST', payload);
}

async function updateProperty(id, updates) {
  return apiCall(`/properties/${id}`, 'PATCH', updates);
}

async function deleteProperty(id) {
  return apiCall(`/properties/${id}`, 'DELETE');
}

// Orders API
async function createOrder(payload) {
  return apiCall('/orders', 'POST', payload);
}

async function getOrders() {
  return apiCall('/orders');
}

async function updateOrder(orderId, updates) {
  return apiCall(`/orders/${orderId}`, 'PATCH', updates);
}

// Payments API
async function initializePayment(orderId) {
  return apiCall('/payments/initialize', 'POST', { orderId });
}

async function verifyPayment(reference, success) {
  return apiCall('/payments/verify', 'POST', { reference, success });
}

// Dashboard API
async function getDashboardStats() {
  return apiCall('/dashboard/stats');
}

// Activity Log API
async function getActivityLog(type = null, user = null, limit = 100) {
  let endpoint = `/activity-log?limit=${limit}`;
  if (type) endpoint += `&type=${type}`;
  if (user) endpoint += `&user=${user}`;
  return apiCall(endpoint);
}

async function getActivityLogStats() {
  return apiCall('/activity-log/stats');
}

async function clearActivityLog() {
  return apiCall('/activity-log', 'DELETE');
}

async function deleteActivityLogEntry(id) {
  return apiCall(`/activity-log/${id}`, 'DELETE');
}

// Events API
async function getEvents() {
  return apiCall('/events');
}

async function createEvent(title, description, date, time, location, image) {
  return apiCall('/events', 'POST', { title, description, date, time, location, image });
}

async function updateEvent(id, updates) {
  return apiCall(`/events/${id}`, 'PATCH', updates);
}

async function deleteEvent(id) {
  return apiCall(`/events/${id}`, 'DELETE');
}
