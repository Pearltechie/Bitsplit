// BitSplit Frontend JavaScript
import { AuthClient } from "@dfinity/auth-client";
import { createActor } from "@dfinity/agent";

// Configuration
const canisterId = "your-canister-id"; // Replace with your actual canister ID
const host = "https://ic0.app"; // Use local host for development: "http://localhost:4943"

// Global variables
let authClient;
let actor;
let isAuthenticated = false;
let currentUser = null;
let balanceChart = null;

// DOM Elements
const welcomeScreen = document.getElementById('welcomeScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const getStartedBtn = document.getElementById('getStartedBtn');
const userPrincipal = document.getElementById('userPrincipal');
const loadingOverlay = document.getElementById('loadingOverlay');

// Balance displays
const totalBalance = document.getElementById('totalBalance');
const spendBalance = document.getElementById('spendBalance');
const saveBalance = document.getElementById('saveBalance');
const investBalance = document.getElementById('investBalance');

// Modals
const addIncomeModal = document.getElementById('addIncomeModal');
const splitSettingsModal = document.getElementById('splitSettingsModal');
const spendModal = document.getElementById('spendModal');
const transferModal = document.getElementById('transferModal');

// Initialize the app
async function init() {
    try {
        authClient = await AuthClient.create();
        
        if (await authClient.isAuthenticated()) {
            await handleAuthenticated();
        } else {
            showWelcomeScreen();
        }
        
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize application');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Authentication
    loginBtn.addEventListener('click', login);
    logoutBtn.addEventListener('click', logout);
    getStartedBtn.addEventListener('click', login);
    
    // Dashboard actions
    document.getElementById('addIncomeBtn')?.addEventListener('click', () => showModal('addIncomeModal'));
    document.getElementById('spendFundsBtn')?.addEventListener('click', () => showModal('spendModal'));
    document.getElementById('splitSettingsBtn')?.addEventListener('click', () => showModal('splitSettingsModal'));
    document.getElementById('transferBtn')?.addEventListener('click', () => showModal('transferModal'));
    
    // Modal actions
    document.getElementById('confirmIncomeBtn')?.addEventListener('click', addIncome);
    document.getElementById('cancelIncomeBtn')?.addEventListener('click', () => hideModal('addIncomeModal'));
    
    document.getElementById('saveSplitBtn')?.addEventListener('click', saveSplitSettings);
    document.getElementById('cancelSplitBtn')?.addEventListener('click', () => hideModal('splitSettingsModal'));
    
    document.getElementById('confirmSpendBtn')?.addEventListener('click', spendFunds);
    document.getElementById('cancelSpendBtn')?.addEventListener('click', () => hideModal('spendModal'));
    
    document.getElementById('confirmTransferBtn')?.addEventListener('click', transferFunds);
    document.getElementById('cancelTransferBtn')?.addEventListener('click', () => hideModal('transferModal'));
    
    // Split settings sliders
    setupSplitSettingsSliders();
}

// Authentication functions
async function login() {
    try {
        showLoading(true);
        
        await authClient.login({
            identityProvider: "https://identity.ic0.app",
            onSuccess: async () => {
                await handleAuthenticated();
            },
            onError: (error) => {
                console.error('Login error:', error);
                showError('Login failed');
                showLoading(false);
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed');
        showLoading(false);
    }
}

async function logout() {
    try {
        await authClient.logout();
        isAuthenticated = false;
        currentUser = null;
        actor = null;
        showWelcomeScreen();
    } catch (error) {
        console.error('Logout error:', error);
        showError('Logout failed');
    }
}

async function handleAuthenticated() {
    try {
        isAuthenticated = true;
        const identity = authClient.getIdentity();
        
        // Create actor with authenticated identity
        actor = createActor(canisterId, {
            agentOptions: {
                identity,
                host
            }
        });
        
        // Initialize user
        const initResult = await actor.initializeUser();
        if ('ok' in initResult) {
            currentUser = initResult.ok;
            await showDashboard();
        } else {
            throw new Error(initResult.err);
        }
        
        // Update UI
        const principal = identity.getPrincipal().toString();
        userPrincipal.textContent = `${principal.slice(0, 8)}...${principal.slice(-8)}`;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        
        showLoading(false);
    } catch (error) {
        console.error('Authentication handling error:', error);
        showError('Failed to authenticate');
        showLoading(false);
    }
}

// Screen management
function showWelcomeScreen() {
    welcomeScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userPrincipal.textContent = '';
}

async function showDashboard() {
    try {
        welcomeScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        
        await updateDashboard();
    } catch (error) {
        console.error('Dashboard error:', error);
        showError('Failed to load dashboard');
    }
}

// Dashboard functions
async function updateDashboard() {
    try {
        if (!actor || !isAuthenticated) return;
        
        // Get user profile
        const profileResult = await actor.getUserProfile();
        if ('ok' in profileResult) {
            currentUser = profileResult.ok;
            updateBalanceDisplay(currentUser.balance);
            updateChart(currentUser.balance);
            await updateTransactionList();
        } else {
            throw new Error(profileResult.err);
        }
    } catch (error) {
        console.error('Dashboard update error:', error);
        showError('Failed to update dashboard');
    }
}

function updateBalanceDisplay(balance) {
    const formatBalance = (amount) => {
        return (amount / 100000000).toFixed(8); // Convert satoshis to BTC format
    };
    
    totalBalance.textContent = `${formatBalance(balance.total)} ckBTC`;
    spendBalance.textContent = `${formatBalance(balance.spend)} ckBTC`;
    saveBalance.textContent = `${formatBalance(balance.save)} ckBTC`;
    investBalance.textContent = `${formatBalance(balance.invest)} ckBTC`;
}

function updateChart(balance) {
    const ctx = document.getElementById('balanceChart').getContext('2d');
    
    if (balanceChart) {
        balanceChart.destroy();
    }
    
    const data = [balance.spend, balance.save, balance.invest];
    const total = data.reduce((a, b) => a + b, 0);
    
    balanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Spend', 'Save', 'Invest'],
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(147, 51, 234, 0.8)',
                    'rgba(249, 115, 22, 0.8)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(147, 51, 234, 1)',
                    'rgba(249, 115, 22, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'white',
                        padding: 20
                    }
                }
            }
        }
    });
}

async function updateTransactionList() {
    try {
        const transactions = await actor.getUserTransactions();
        const transactionList = document.getElementById('transactionList');
        
        if (transactions.length === 0) {
            transactionList.innerHTML = '<p class="text-center text-white/50">No transactions yet</p>';
            return;
        }
        
        transactionList.innerHTML = transactions.slice(0, 10).map(tx => {
            const date = new Date(Number(tx.timestamp) / 1000000).toLocaleDateString();
            const amount = (tx.amount / 100000000).toFixed(8);
            const typeEmoji = {
                income: '📥',
                spend: '💸',
                save: '💰',
                invest: '📈'
            }[Object.keys(tx.transactionType)[0]] || '📝';
            
            return `
                <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <span class="text-xl">${typeEmoji}</span>
                        <div>
                            <p class="font-medium">${tx.description}</p>
                            <p class="text-sm text-white/60">${date}</p>
                        </div>
                    </div>
                    <p class="font-semibold ${Object.keys(tx.transactionType)[0] === 'income' ? 'text-green-400' : 'text-red-400'}">
                        ${Object.keys(tx.transactionType)[0] === 'income' ? '+' : '-'}${amount} ckBTC
                    </p>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Transaction list error:', error);
    }
}

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Load current split settings if opening split settings modal
        if (modalId === 'splitSettingsModal' && currentUser) {
            loadSplitSettings();
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        
        // Clear form inputs
        modal.querySelectorAll('input').forEach(input => {
            if (input.type !== 'range') {
                input.value = '';
            }
        });
    }
}

// Income functions
async function addIncome() {
    try {
        const amountInput = document.getElementById('incomeAmount');
        const amount = parseFloat(amountInput.value);
        
        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        
        showLoading(true);
        hideModal('addIncomeModal');
        
        // Convert to satoshis (multiply by 100,000,000)
        const amountSatoshis = Math.floor(amount * 100000000);
        
        const result = await actor.processIncome(amountSatoshis);
        
        if ('ok' in result) {
            await updateDashboard();
            showSuccess('Income processed successfully!');
        } else {
            throw new Error(result.err);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Add income error:', error);
        showError('Failed to process income');
        showLoading(false);
    }
}

// Spend functions
async function spendFunds() {
    try {
        const amountInput = document.getElementById('spendAmount');
        const descriptionInput = document.getElementById('spendDescription');
        const amount = parseFloat(amountInput.value);
        const description = descriptionInput.value.trim();
        
        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        
        if (!description) {
            showError('Please enter a description');
            return;
        }
        
        showLoading(true);
        hideModal('spendModal');
        
        const amountSatoshis = Math.floor(amount * 100000000);
        
        const result = await actor.spendFunds(amountSatoshis, description);
        
        if ('ok' in result) {
            await updateDashboard();
            showSuccess('Funds spent successfully!');
        } else {
            throw new Error(result.err);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Spend error:', error);
        showError('Failed to spend funds: ' + error.message);
        showLoading(false);
    }
}

// Split settings functions
function setupSplitSettingsSliders() {
    const spendSlider = document.getElementById('spendPercent');
    const saveSlider = document.getElementById('savePercent');
    const investSlider = document.getElementById('investPercent');
    
    const spendLabel = document.getElementById('spendPercentLabel');
    const saveLabel = document.getElementById('savePercentLabel');
    const investLabel = document.getElementById('investPercentLabel');
    const totalLabel = document.getElementById('totalPercent');
    
    function updateLabels() {
        const spend = parseInt(spendSlider.value);
        const save = parseInt(saveSlider.value);
        const invest = parseInt(investSlider.value);
        const total = spend + save + invest;
        
        spendLabel.textContent = `${spend}%`;
        saveLabel.textContent = `${save}%`;
        investLabel.textContent = `${invest}%`;
        totalLabel.textContent = `${total}%`;
        
        // Color code based on total
        if (total === 100) {
            totalLabel.className = 'font-semibold text-green-400';
        } else {
            totalLabel.className = 'font-semibold text-red-400';
        }
    }
    
    spendSlider.addEventListener('input', updateLabels);
    saveSlider.addEventListener('input', updateLabels);
    investSlider.addEventListener('input', updateLabels);
}

function loadSplitSettings() {
    if (!currentUser) return;
    
    const settings = currentUser.splitSettings;
    document.getElementById('spendPercent').value = settings.spendPercent;
    document.getElementById('savePercent').value = settings.savePercent;
    document.getElementById('investPercent').value = settings.investPercent;
    
    // Update labels
    document.getElementById('spendPercentLabel').textContent = `${settings.spendPercent}%`;
    document.getElementById('savePercentLabel').textContent = `${settings.savePercent}%`;
    document.getElementById('investPercentLabel').textContent = `${settings.investPercent}%`;
}

async function saveSplitSettings() {
    try {
        const spend = parseInt(document.getElementById('spendPercent').value);
        const save = parseInt(document.getElementById('savePercent').value);
        const invest = parseInt(document.getElementById('investPercent').value);
        
        if (spend + save + invest !== 100) {
            showError('Split percentages must add up to 100%');
            return;
        }
        
        showLoading(true);
        hideModal('splitSettingsModal');
        
        const newSettings = {
            spendPercent: spend,
            savePercent: save,
            investPercent: invest
        };
        
        const result = await actor.updateSplitSettings(newSettings);
        
        if ('ok' in result) {
            await updateDashboard();
            showSuccess('Split settings updated!');
        } else {
            throw new Error(result.err);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Split settings error:', error);
        showError('Failed to update split settings');
        showLoading(false);
    }
}

// Transfer functions
async function transferFunds() {
    try {
        const fromSelect = document.getElementById('transferFrom');
        const toSelect = document.getElementById('transferTo');
        const amountInput = document.getElementById('transferAmount');
        
        const from = fromSelect.value;
        const to = toSelect.value;
        const amount = parseFloat(amountInput.value);
        
        if (from === to) {
            showError('Cannot transfer to the same category');
            return;
        }
        
        if (!amount || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        
        showLoading(true);
        hideModal('transferModal');
        
        const amountSatoshis = Math.floor(amount * 100000000);
        
        const fromCategory = { [from]: null };
        const toCategory = { [to]: null };
        
        const result = await actor.transferBetweenCategories(fromCategory, toCategory, amountSatoshis);
        
        if ('ok' in result) {
            await updateDashboard();
            showSuccess('Transfer completed successfully!');
        } else {
            throw new Error(result.err);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Transfer error:', error);
        showError('Failed to transfer funds: ' + error.message);
        showLoading(false);
    }
}

// Utility functions
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');
    } else {
        loadingOverlay.classList.add('hidden');
        loadingOverlay.classList.remove('flex');
    }
}

function showSuccess(message) {
    // Create and show success notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showError(message) {
    // Create and show error notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.BitSplit = {
    authClient,
    actor,
    currentUser,
    updateDashboard
};