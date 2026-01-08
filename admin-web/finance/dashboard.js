/**
 * PACK 358 — Financial Dashboard JavaScript
 * 
 * Handles all client-side logic for the finance dashboard
 */

// Firebase Configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const functions = firebase.functions();
const auth = firebase.auth();

// Chart instances
let forecastChart = null;
let burnRateChart = null;
let ltvChart = null;

// Current state
let currentTimeframe = '30d';
let currentFilter = 'all';

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/admin/login.html';
      return;
    }

    // Verify admin status
    const token = await user.getIdTokenResult();
    if (!token.claims.admin) {
      alert('Access denied. Admin privileges required.');
      window.location.href = '/';
      return;
    }

    // Initialize dashboard
    await initDashboard();
  });

  // Setup event listeners
  setupEventListeners();
});

// ============================================================================
// DASHBOARD INITIALIZATION
// ============================================================================

async function initDashboard() {
  showLoading();

  try {
    await Promise.all([
      loadSummaryMetrics(),
      loadForecast(currentTimeframe),
      loadBurnRate(),
      loadLTV(),
      loadStressScenarios(),
      loadAlerts()
    ]);

    updateLastUpdated();
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showError('Failed to load dashboard data');
  } finally {
    hideLoading();
  }
}

// ============================================================================
// SUMMARY METRICS
// ============================================================================

async function loadSummaryMetrics() {
  try {
    // Load 30-day forecast
    const forecastDoc = await db
      .collection('finance')
      .doc('forecasts')
      .collection('latest')
      .doc('30d')
      .get();

    if (forecastDoc.exists) {
      const forecast = forecastDoc.data();
      document.getElementById('revenue-30d').textContent = 
        `${formatCurrency(forecast.totalRevenuePLN)} PLN`;
      document.getElementById('net-profit').textContent = 
        `${formatCurrency(forecast.totalGrossProfitPLN)} PLN`;
      
      const profitMargin = (forecast.totalGrossProfitPLN / forecast.totalRevenuePLN) * 100;
      document.getElementById('profit-margin').textContent = 
        `${profitMargin.toFixed(1)}% margin`;
      document.getElementById('profit-margin').className = 
        `metric-change ${profitMargin >= 20 ? 'positive' : 'negative'}`;
    }

    // Load burn rate
    const burnDoc = await db
      .collection('finance')
      .doc('burnrate')
      .get();

    if (burnDoc.exists) {
      const burn = burnDoc.data().latest;
      document.getElementById('monthly-burn').textContent = 
        `${formatCurrency(burn.totalBurnPLN)} PLN`;
      
      const burnChange = burn.profitMargin >= 0 ? 'positive' : 'negative';
      document.getElementById('burn-change').textContent = 
        `${burn.profitMargin.toFixed(1)}% profit margin`;
      document.getElementById('burn-change').className = 
        `metric-change ${burnChange}`;
    }

    // Calculate runway (mock calculation - should come from backend)
    const runway = 180; // days
    document.getElementById('runway').textContent = `${runway} days`;
    document.getElementById('runway-months').textContent = 
      `~${Math.floor(runway / 30)} months`;
    document.getElementById('runway-months').className = 
      `metric-change ${runway >= 120 ? 'positive' : 'negative'}`;

  } catch (error) {
    console.error('Error loading summary metrics:', error);
  }
}

// ============================================================================
// FORECAST TAB
// ============================================================================

async function loadForecast(timeframe) {
  try {
    const forecastDoc = await db
      .collection('finance')
      .doc('forecasts')
      .collection('latest')
      .doc(timeframe)
      .get();

    if (!forecastDoc.exists) {
      console.warn(`No forecast data for ${timeframe}`);
      return;
    }

    const data = forecastDoc.data();
    
    // Update confidence bands
    document.getElementById('p50').textContent = `${formatCurrency(data.p50)} PLN`;
    document.getElementById('p75').textContent = `${formatCurrency(data.p75)} PLN`;
    document.getElementById('p90').textContent = `${formatCurrency(data.p90)} PLN`;

    // Render forecast chart
    renderForecastChart(data);

  } catch (error) {
    console.error('Error loading forecast:', error);
  }
}

function renderForecastChart(data) {
  const ctx = document.getElementById('forecast-chart').getContext('2d');
  
  // Destroy existing chart
  if (forecastChart) {
    forecastChart.destroy();
  }

  const labels = data.forecasts.map(f => f.date);
  const revenues = data.forecasts.map(f => f.predictedRevenuePLN);
  const payouts = data.forecasts.map(f => f.predictedPayoutsPLN);
  const profits = data.forecasts.map(f => f.predictedGrossProfitPLN);

  forecastChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: revenues,
          borderColor: '#4F46E5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Payouts',
          data: payouts,
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Gross Profit',
          data: profits,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: ${formatCurrency(context.parsed.y)} PLN`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `${formatCurrency(value)} PLN`
          }
        }
      }
    }
  });
}

// ============================================================================
// BURN RATE TAB
// ============================================================================

async function loadBurnRate() {
  try {
    // Load historical burn rate
    const snapshot = await db
      .collection('finance')
      .doc('burnrate')
      .collection('monthly')
      .orderBy('monthYear', 'desc')
      .limit(12)
      .get();

    const burnRates = snapshot.docs.map(doc => doc.data()).reverse();
    
    // Render chart
    renderBurnRateChart(burnRates);

    // Show current month breakdown
    if (burnRates.length > 0) {
      renderCostBreakdown(burnRates[burnRates.length - 1]);
    }

  } catch (error) {
    console.error('Error loading burn rate:', error);
  }
}

function renderBurnRateChart(burnRates) {
  const ctx = document.getElementById('burnrate-chart').getContext('2d');
  
  if (burnRateChart) {
    burnRateChart.destroy();
  }

  const labels = burnRates.map(b => b.monthYear);
  const revenues = burnRates.map(b => b.totalRevenuePLN || 0);
  const burns = burnRates.map(b => b.totalBurnPLN);
  const profits = burnRates.map(b => b.netProfitPLN);

  burnRateChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: revenues,
          backgroundColor: '#4F46E5'
        },
        {
          label: 'Burn',
          data: burns,
          backgroundColor: '#EF4444'
        },
        {
          label: 'Net Profit',
          data: profits,
          backgroundColor: '#10B981'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `${formatCurrency(value)} PLN`
          }
        }
      }
    }
  });
}

function renderCostBreakdown(burnRate) {
  const container = document.getElementById('cost-breakdown');
  container.innerHTML = '';

  const costs = [
    { name: 'Infrastructure', value: burnRate.monthlyInfraCostPLN },
    { name: 'Marketing', value: burnRate.marketingCostPLN },
    { name: 'Support', value: burnRate.supportCostPLN },
    { name: 'Moderation', value: burnRate.moderationCostPLN },
    { name: 'Payment Processing', value: burnRate.paymentProcessingCostPLN },
    { name: 'Store Fees', value: burnRate.storeFeesCostPLN }
  ];

  costs.forEach(cost => {
    const item = document.createElement('div');
    item.className = 'cost-item';
    item.innerHTML = `
      <div class="cost-item-name">${cost.name}</div>
      <div class="cost-item-value">${formatCurrency(cost.value)} PLN</div>
    `;
    container.appendChild(item);
  });
}

// ============================================================================
// LTV TAB
// ============================================================================

async function loadLTV() {
  try {
    const doc = await db.collection('finance').doc('ltv').get();
    
    if (!doc.exists) {
      console.warn('No LTV data available');
      return;
    }

    const data = doc.data();
    renderLTVSegments(data.profiles);
    renderLTVChart(data.profiles);

  } catch (error) {
    console.error('Error loading LTV:', error);
  }
}

function renderLTVSegments(profiles) {
  const container = document.getElementById('ltv-segments');
  container.innerHTML = '';

  profiles.forEach(profile => {
    const segment = document.createElement('div');
    segment.className = 'ltv-segment';
    segment.innerHTML = `
      <div class="ltv-segment-header">
        <div class="ltv-segment-name">${profile.segment}</div>
        <div class="ltv-segment-badge">${profile.userCount} users</div>
      </div>
      <div class="ltv-metrics">
        <div class="ltv-metric">
          <span class="ltv-metric-label">Avg LTV</span>
          <span class="ltv-metric-value">${formatCurrency(profile.avgLTVPLN)} PLN</span>
        </div>
        <div class="ltv-metric">
          <span class="ltv-metric-label">Days Active</span>
          <span class="ltv-metric-value">${profile.avgDaysActive}</span>
        </div>
        <div class="ltv-metric">
          <span class="ltv-metric-label">Pay Frequency</span>
          <span class="ltv-metric-value">${profile.payFrequencyPerMonth.toFixed(2)}/mo</span>
        </div>
        <div class="ltv-metric">
          <span class="ltv-metric-label">Churn Risk</span>
          <span class="ltv-metric-value">${(profile.churnProbability * 100).toFixed(0)}%</span>
        </div>
      </div>
    `;
    container.appendChild(segment);
  });
}

function renderLTVChart(profiles) {
  const ctx = document.getElementById('ltv-chart').getContext('2d');
  
  if (ltvChart) {
    ltvChart.destroy();
  }

  const labels = profiles.map(p => p.segment);
  const ltvs = profiles.map(p => p.avgLTVPLN);
  const users = profiles.map(p => p.userCount);

  ltvChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg LTV (PLN)',
          data: ltvs,
          backgroundColor: '#4F46E5',
          yAxisID: 'y'
        },
        {
          label: 'User Count',
          data: users,
          backgroundColor: '#10B981',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left'
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}

// ============================================================================
// STRESS SCENARIOS TAB
// ============================================================================

async function loadStressScenarios() {
  try {
    const doc = await db.collection('finance').doc('scenarios').get();
    
    if (!doc.exists) {
      console.warn('No scenario data available');
      return;
    }

    const data = doc.data();
    renderScenarios(data.results);

  } catch (error) {
    console.error('Error loading stress scenarios:', error);
  }
}

function renderScenarios(results) {
  const container = document.getElementById('scenarios-grid');
  container.innerHTML = '';

  results.forEach(result => {
    const severity = result.survivalRunwayDays < 120 ? 'critical' : 
                     result.survivalRunwayDays < 180 ? 'warning' : 'success';
    
    const card = document.createElement('div');
    card.className = `scenario-card ${severity}`;
    card.innerHTML = `
      <div class="scenario-title">${result.scenarioName}</div>
      <div class="scenario-metrics">
        <div class="scenario-metric">
          <span class="scenario-metric-label">Revenue Impact</span>
          <span class="scenario-metric-value">${result.revenueImpactPercent.toFixed(1)}%</span>
        </div>
        <div class="scenario-metric">
          <span class="scenario-metric-label">Profit Impact</span>
          <span class="scenario-metric-value">${result.profitImpactPercent.toFixed(1)}%</span>
        </div>
        <div class="scenario-metric">
          <span class="scenario-metric-label">Survival Runway</span>
          <span class="scenario-metric-value">${result.survivalRunwayDays} days</span>
        </div>
        ${result.timeToCashZeroDays ? `
          <div class="scenario-metric">
            <span class="scenario-metric-label">Cash Zero In</span>
            <span class="scenario-metric-value">${result.timeToCashZeroDays} days</span>
          </div>
        ` : ''}
      </div>
      ${result.recommendations.length > 0 ? `
        <div class="scenario-recommendations">
          <h4>Recommendations</h4>
          <ul>
            ${result.recommendations.slice(0, 3).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

// ============================================================================
// ALERTS TAB
// ============================================================================

async function loadAlerts(filter = 'all') {
  try {
    let query = db
      .collection('finance')
      .doc('alerts')
      .collection('active')
      .orderBy('createdAt', 'desc')
      .limit(50);

    if (filter === 'unresolved') {
      query = query.where('resolved', '==', false);
    } else if (filter === 'critical' || filter === 'high') {
      query = query.where('severity', '==', filter);
    }

    const snapshot = await query.get();
    const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    renderAlerts(alerts);
    renderAlertBanner(alerts.filter(a => !a.resolved && a.severity === 'critical'));

  } catch (error) {
    console.error('Error loading alerts:', error);
  }
}

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-list');
  container.innerHTML = '';

  if (alerts.length === 0) {
    container.innerHTML = '<div class="loading">No alerts found</div>';
    return;
  }

  alerts.forEach(alert => {
    const item = document.createElement('div');
    item.className = `alert-item ${alert.severity} ${alert.resolved ? 'resolved' : ''}`;
    item.innerHTML = `
      <div class="alert-header">
        <div class="alert-title">${alert.type.replace(/_/g, ' ')}</div>
        <div class="alert-severity ${alert.severity}">${alert.severity}</div>
      </div>
      <div class="alert-message">${alert.message}</div>
      <div class="alert-footer">
        <span>${formatDate(alert.createdAt)}</span>
        <div class="alert-actions">
          ${!alert.resolved ? `
            <button class="btn btn-primary" onclick="resolveAlert('${alert.id}')">
              ✓ Resolve
            </button>
          ` : '<span>✓ Resolved</span>'}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderAlertBanner(criticalAlerts) {
  const container = document.getElementById('alerts-container');
  container.innerHTML = '';

  criticalAlerts.forEach(alert => {
    const banner = document.createElement('div');
    banner.className = 'alert alert-critical';
    banner.innerHTML = `
      <div>
        <strong>${alert.type.replace(/_/g, ' ')}</strong>: ${alert.message}
      </div>
      <button class="btn btn-danger" onclick="resolveAlert('${alert.id}')">
        ✓ Resolve
      </button>
    `;
    container.appendChild(banner);
  });
}

async function resolveAlert(alertId) {
  try {
    await db
      .collection('finance')
      .doc('alerts')
      .collection('active')
      .doc(alertId)
      .update({
        resolved: true,
        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolvedBy: auth.currentUser.uid
      });

    await loadAlerts(currentFilter);
    showSuccess('Alert resolved');

  } catch (error) {
    console.error('Error resolving alert:', error);
    showError('Failed to resolve alert');
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Refresh button
  document.getElementById('refresh-all').addEventListener('click', initDashboard);

  // Run stress test button
  document.getElementById('run-stress-test').addEventListener('click', async () => {
    if (confirm('Run all stress scenarios? This may take a few minutes.')) {
      showLoading();
      try {
        // Call cloud function to run scenarios
        const runScenarios = functions.httpsCallable('runMonthlyStressScenarios');
        await runScenarios();
        await loadStressScenarios();
        showSuccess('Stress scenarios completed');
      } catch (error) {
        console.error('Error running stress scenarios:', error);
        showError('Failed to run stress scenarios');
      } finally {
        hideLoading();
      }
    }
  });

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Timeframe selector
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timeframe = btn.dataset.timeframe;
      currentTimeframe = timeframe;
      
      document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      await loadForecast(timeframe);
    });
  });

  // Alert filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const filter = btn.dataset.filter;
      currentFilter = filter;
      
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      await loadAlerts(filter);
    });
  });
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('pl-PL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function updateLastUpdated() {
  document.getElementById('last-updated').textContent = 
    `Last updated: ${formatDate(new Date())}`;
}

function showLoading() {
  document.body.style.cursor = 'wait';
}

function hideLoading() {
  document.body.style.cursor = 'default';
}

function showSuccess(message) {
  alert(`✓ ${message}`);
}

function showError(message) {
  alert(`✗ ${message}`);
}
