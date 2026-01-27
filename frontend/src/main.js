import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
const state = {
    user: null,
    token: localStorage.getItem('token'),
    view: 'login', // login, dashboard, insights, members, billing
    orgs: [],
    currentOrg: null,
    insights: null,
    error: null
};

const app = document.getElementById('app');

// --- Helpers ---
const saveAuth = (token) => {
    state.token = token;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

const logout = () => {
    localStorage.removeItem('token');
    window.location.reload();
};

// --- API Calls ---
const login = async (email, password) => {
    try {
        const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
        saveAuth(res.data.accessToken); // Changed from tokens.access.token
        await fetchUser();
        render();
    } catch (e) {
        state.error = e.response?.data?.message || 'Login failed';
        render();
    }
};

const fetchUser = async () => {
    try {
        const res = await axios.get(`${API_BASE}/user/profile`);
        state.user = res.data;
        // Map subscriptionId to a readable string for the UI if needed
        // The service returns the subscription tier in the user object usually
        // but here we might need to check the exact field name

        // Fetch orgs
        const orgRes = await axios.get(`${API_BASE}/org/my-organizations`);
        state.orgs = orgRes.data;
        if (state.orgs.length > 0) state.currentOrg = state.orgs[0];
        state.view = 'dashboard';
    } catch (e) {
        console.error("Fetch User Error:", e);
        logout();
    }
};

const fetchInsights = async () => {
    if (!state.currentOrg) return;
    try {
        const res = await axios.get(`${API_BASE}/analytics/org/${state.currentOrg.organizationId}/insights`, {
            headers: { 'x-org-id': state.currentOrg.organizationId }
        });
        state.insights = res.data;
        render();
    } catch (e) {
        state.error = e.response?.data?.message || 'Failed to fetch insights';
        render();
    }
};

// --- Views ---
const LoginView = () => `
    <div class="flex flex-col items-center justify-center min-h-[80vh]">
        <div class="glass p-8 rounded-2xl w-full max-w-md">
            <h1 class="text-3xl font-bold mb-2 text-primary">CraftedClimate</h1>
            <p class="text-slate-400 mb-8">Professional Telemetry Testing Portal</p>
            
            ${state.error ? `<div class="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-4">${state.error}</div>` : ''}

            <form id="loginForm" class="space-y-4">
                <div class="flex flex-col space-y-2">
                    <label class="text-sm font-medium text-slate-400">Email</label>
                    <input type="email" id="email" class="input-field" placeholder="admin@example.com" required>
                </div>
                <div class="flex flex-col space-y-2">
                    <label class="text-sm font-medium text-slate-400">Password</label>
                    <input type="password" id="password" class="input-field" placeholder="••••••••" required>
                </div>
                <button type="submit" class="btn-primary w-full mt-4">Login to Dashboard</button>
            </form>
        </div>
    </div>
`;

const Nav = () => `
    <nav class="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div class="flex items-center space-x-4">
            <span class="text-xl font-bold text-primary">CraftedClimate</span>
            <div class="h-6 w-[1px] bg-slate-700"></div>
            <select id="orgSelect" class="bg-transparent text-slate-300 outline-none">
                ${state.orgs.map(o => `<option value="${o.organizationId}" ${state.currentOrg?.organizationId === o.organizationId ? 'selected' : ''}>${o.name}</option>`).join('')}
            </select>
        </div>
        <div class="flex items-center space-x-6 text-sm font-medium">
            <button onclick="setView('dashboard')" class="${state.view === 'dashboard' ? 'text-primary' : 'text-slate-400'}">Overview</button>
            <button onclick="setView('insights')" class="${state.view === 'insights' ? 'text-primary' : 'text-slate-400'} underline decoration-primary/30">AI Insights</button>
            <button onclick="setView('members')" class="${state.view === 'members' ? 'text-primary' : 'text-slate-400'}">Team</button>
            <button onclick="setView('billing')" class="${state.view === 'billing' ? 'text-primary' : 'text-slate-400'}">Billing</button>
            <button onclick="logout()" class="text-red-400 hover:text-red-300">Logout</button>
        </div>
    </nav>
`;

const DashboardView = () => `
    ${Nav()}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="glass p-6 rounded-xl">
            <h3 class="text-slate-400 text-sm mb-1">Active Subscription</h3>
            <p class="text-2xl font-bold capitalize">${state.user?.subscriptionTier || 'Free'}</p>
        </div>
        <div class="glass p-6 rounded-xl">
            <h3 class="text-slate-400 text-sm mb-1">Organization</h3>
            <p class="text-2xl font-bold truncate">${state.currentOrg?.name || 'N/A'}</p>
        </div>
        <div class="glass p-6 rounded-xl border-primary/20 bg-primary/5">
            <h3 class="text-slate-400 text-sm mb-1">Device Status</h3>
            <p class="text-2xl font-bold text-primary">All Systems Online</p>
        </div>
    </div>
    
    <div class="mt-8 glass p-8 rounded-2xl min-h-[300px] flex flex-col items-center justify-center border-dashed border-slate-700">
        <div class="text-center">
            <p class="text-slate-500 mb-4 font-mono text-sm">Real API Connected: ${API_BASE}</p>
            <div class="flex space-x-2 justify-center">
                <span class="px-3 py-1 bg-green-500/10 text-green-500 rounded text-xs">Auth OK</span>
                <span class="px-3 py-1 bg-green-500/10 text-green-500 rounded text-xs">Profile OK</span>
                <span class="px-3 py-1 bg-green-500/10 text-green-500 rounded text-xs">Orgs OK</span>
            </div>
        </div>
    </div>
`;

const InsightsView = () => {
    const isFree = state.user?.subscriptionTier === 'free' || state.user?.subscriptionTier === 'freemium';
    return `
    ${Nav()}
    <div class="space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-2xl font-bold">AI Insight Center</h2>
            <button onclick="fetchInsights()" class="${isFree ? 'opacity-50 cursor-not-allowed' : ''} bg-primary/20 text-primary border border-primary/30 px-4 py-1 rounded-full text-sm">Refresh AI</button>
        </div>

        ${isFree ? `
            <div class="glass p-12 text-center rounded-2xl border-secondary/20 bg-secondary/5">
                <div class="text-4xl mb-4 text-secondary">✨</div>
                <h3 class="text-xl font-bold mb-2 text-white">Unlock Professional Insights</h3>
                <p class="text-slate-400 max-w-md mx-auto mb-6">The <b>${state.user?.subscriptionTier}</b> plan only includes basic monitoring. Upgrade to Pro for Anomaly Detection or Enterprise for Predictive Forecasting.</p>
                <button onclick="setView('billing')" class="btn-primary">Explore Premium Plans</button>
            </div>
        ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${state.insights?.insights?.map(i => `
                    <div class="glass p-4 rounded-xl border-l-4 ${i.severity === 'high' ? 'border-red-500' : 'border-blue-500'}">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">${i.type}</span>
                            <span class="text-[10px] text-slate-500">${i.severity} Priority</span>
                        </div>
                        <p class="text-sm text-slate-200">${i.message}</p>
                    </div>
                `).join('') || `
                    <div class="col-span-2 text-center py-12">
                        <p class="text-slate-500 mb-2">Fetching AI insights from production...</p>
                        <div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-primary"></div>
                    </div>
                `}
            </div>
        `}
    </div>
`;
};

// --- Renderer ---
const render = () => {
    if (!state.token) {
        app.innerHTML = LoginView();
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            login(e.target.email.value, e.target.password.value);
        });
        return;
    }

    if (!state.user) {
        app.innerHTML = '<div class="flex items-center justify-center min-h-screen"><p class="animate-pulse text-primary font-mono text-xl">Initializing Environment...</p></div>';
        fetchUser();
        return;
    }

    if (state.view === 'dashboard') app.innerHTML = DashboardView();
    if (state.view === 'insights') app.innerHTML = InsightsView();
    if (state.view === 'login') app.innerHTML = LoginView();
    if (state.view === 'members') app.innerHTML = `${Nav()}<div class="glass p-12 text-center rounded-2xl"><h2 class="text-2xl font-bold">Team Management</h2><p class="text-slate-500 mt-4">Coming Soon: Collaboration Seat Gating</p></div>`;
    if (state.view === 'billing') app.innerHTML = `${Nav()}<div class="glass p-12 text-center rounded-2xl"><h2 class="text-2xl font-bold">Subscription Management</h2><p class="text-slate-500 mt-4">Coming Soon: Stripe Integration Mock</p></div>`;

    document.getElementById('orgSelect')?.addEventListener('change', (e) => {
        state.currentOrg = state.orgs.find(o => o.organizationId === e.target.value);
        render();
    });
};

// Global Exposure
window.setView = (view) => {
    state.view = view;
    render();
};
window.logout = logout;
window.fetchInsights = fetchInsights;

// Init
if (state.token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
}
render();
