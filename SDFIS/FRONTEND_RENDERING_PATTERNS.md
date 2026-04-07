# 🎨 Frontend Rendering Patterns for Worker Performance Report

## Complete Implementation Guide

---

## Quick Start: Add to Your Dashboard

### 1. HTML Section
```html
<!-- Add this to index.html in the production supervisor section -->
<div id="workerPerformanceSection" style="margin-top: 20px;">
  <h3 style="color: #9c27b0; margin-bottom: 15px;">📊 Worker Performance Report</h3>
  
  <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
    <select id="reportType" style="padding: 8px 12px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 4px;">
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
    
    <input type="date" id="reportDate" style="padding: 8px 12px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 4px;">
    
    <button onclick="loadWorkerPerformanceReport()" style="padding: 8px 16px; background: #9c27b0; color: white; border: none; border-radius: 4px; cursor: pointer;">
      Generate Report
    </button>
  </div>
  
  <div id="workerPerformanceResult" style="background: #1e1e2e; padding: 15px; border-radius: 6px; min-height: 100px;"></div>
</div>
```

### 2. JavaScript Function

```javascript
async function loadWorkerPerformanceReport() {
  try {
    const reportDate = document.getElementById('reportDate').value;
    const reportType = document.getElementById('reportType').value || 'daily';
    
    if (!reportDate) {
      showToast('Please select a date', 'warning');
      return;
    }

    // Display loading state
    const resultContainer = document.getElementById('workerPerformanceResult');
    resultContainer.innerHTML = '<p style="text-align: center; color: #999;">⏳ Loading report...</p>';

    // Build query based on report type
    let queryDate = reportDate;
    if (reportType === 'monthly') {
      queryDate = reportDate.substring(0, 7);  // YYYY-MM
    } else if (reportType === 'yearly') {
      queryDate = reportDate.substring(0, 4);  // YYYY
    }

    console.log(`Fetching ${reportType} report for date: ${queryDate}`);

    // Make API request
    const response = await fetch(
      `${API_BASE_URL}/production/worker-performance?type=${reportType}&date=${queryDate}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sdfis_token')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    // Error handling
    if (!response.ok) {
      throw new Error(data.message || `HTTP Error: ${response.status}`);
    }

    if (!data.success) {
      throw new Error(data.message || 'Report generation failed');
    }

    console.log('Report data received:', data);

    // Check if we have data
    if (!data.summary || data.summary.length === 0) {
      resultContainer.innerHTML = '<p style="text-align: center; color: #999;">📭 No worker data found for this period</p>';
      return;
    }

    // Display the report
    displayWorkerPerformanceReport(data);

  } catch (error) {
    console.error('Error loading performance report:', error);
    const resultContainer = document.getElementById('workerPerformanceResult');
    if (resultContainer) {
      resultContainer.innerHTML = `<p style="color: #f44336; text-align: center;">❌ ${error.message}</p>`;
    }
    showToast('Error: ' + error.message, 'error');
  }
}

function displayWorkerPerformanceReport(data) {
  const resultContainer = document.getElementById('workerPerformanceResult');
  
  if (!data.summary || data.summary.length === 0) {
    resultContainer.innerHTML = '<p style="text-align: center; color: #999;">No data available</p>';
    return;
  }

  // Build the HTML
  const html = `
    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444;">
      <small style="color: #999;">
        📅 Report Type: <strong>${data.type || 'daily'}</strong> | 
        📆 Date: <strong>${data.date}</strong> | 
        👥 Workers: <strong>${data.summary.length}</strong>
      </small>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
      ${data.summary.map((worker, index) => renderWorkerCard(worker, index)).join('')}
    </div>
  `;

  resultContainer.innerHTML = html;
}

function renderWorkerCard(worker, index) {
  const workerName = worker.workerName || 'Unknown Worker';
  const stages = worker.stages || {};
  const stageCount = Object.keys(stages).length;
  const totalDoors = worker.totalDoorsForWorker || 0;

  // Calculate progress percentage
  const maxDoorsPerStage = Math.max(...Object.values(stages), 1);
  
  // Color coding based on total doors
  let statusColor = '#999';
  let statusIcon = '⚪';
  if (totalDoors >= 10) {
    statusColor = '#4caf50';
    statusIcon = '🟢';
  } else if (totalDoors >= 5) {
    statusColor = '#2196f3';
    statusIcon = '🔵';
  } else if (totalDoors > 0) {
    statusColor = '#ff9800';
    statusIcon = '🟠';
  }

  return `
    <div style="
      background: linear-gradient(135deg, #2a2a3e 0%, #1e1e2e 100%);
      border: 2px solid #444;
      border-left: 4px solid #9c27b0;
      border-radius: 8px;
      padding: 15px;
      transition: all 0.3s ease;
      cursor: pointer;
    " onmouseover="this.style.borderColor='#9c27b0'; this.style.box=shadow='0 0 10px rgba(156, 39, 176, 0.3)';" onmouseout="this.style.borderColor='#444'; this.style.boxShadow='none';">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
        <div>
          <div style="color: #9c27b0; font-weight: bold; font-size: 16px; margin-bottom: 3px;">
            👤 ${workerName}
          </div>
          <small style="color: #999;">ID: ${worker.workerId.substring(0, 8)}...</small>
        </div>
        <div style="text-align: right; font-size: 24px;">
          ${statusIcon}
        </div>
      </div>

      <!-- Total Stats -->
      <div style="
        background: #1e1e2e;
        padding: 10px;
        border-radius: 6px;
        margin-bottom: 12px;
        text-align: center;
      ">
        <div style="font-size: 28px; color: ${statusColor}; font-weight: bold;">
          ${totalDoors}
        </div>
        <small style="color: #999;">Total Doors</small>
      </div>

      <!-- Stage Breakdown -->
      <div style="margin-bottom: 12px;">
        <small style="color: #999; display: block; margin-bottom: 8px;">📊 Stage-wise Breakdown (${stageCount} stages)</small>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${Object.entries(stages).map(([stage, count]) => {
            const percentage = maxDoorsPerStage > 0 ? (count / maxDoorsPerStage) * 100 : 0;
            let stageIcon = getStageIcon(stage);
            let stageColor = getStageColor(stage);
            
            return `
              <div style="
                background: #0a0a14;
                padding: 8px;
                border-radius: 4px;
                border-left: 3px solid ${stageColor};
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <small style="color: #999;">${stageIcon} ${stage}</small>
                  <span style="color: ${stageColor}; font-weight: bold; font-size: 12px;">${count}</span>
                </div>
                <div style="
                  background: #1a1a2e;
                  height: 6px;
                  border-radius: 3px;
                  overflow: hidden;
                ">
                  <div style="
                    background: ${stageColor};
                    height: 100%;
                    width: ${percentage}%;
                    transition: width 0.3s ease;
                  "></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Footer -->
      <div style="
        border-top: 1px solid #444;
        padding-top: 10px;
        display: flex;
        justify-content: space-between;
        text-align: center;
      ">
        <div>
          <small style="color: #999; display: block;">Avg per Stage</small>
          <span style="color: #4caf50; font-weight: bold;">${stageCount > 0 ? (totalDoors / stageCount).toFixed(1) : 0}</span>
        </div>
        <div>
          <small style="color: #999; display: block;">Max Stage</small>
          <span style="color: #2196f3; font-weight: bold;">${Math.max(...Object.values(stages), 0)}</span>
        </div>
        <div>
          <small style="color: #999; display: block;">Stages</small>
          <span style="color: #9c27b0; font-weight: bold;">${stageCount}</span>
        </div>
      </div>
    </div>
  `;
}

// Helper function: Get stage icon
function getStageIcon(stage) {
  const icons = {
    'CUTTING': '✂️',
    'PROCESSING': '⚙️',
    'POLISHING': '✨',
    'PACKING': '📦',
    'LOADING': '🚚',
    'DELIVERY': '🚛',
    'INSPECTION': '🔍',
    'QUALITY_CHECK': '✓',
  };
  return icons[stage] || '📋';
}

// Helper function: Get stage color
function getStageColor(stage) {
  const colors = {
    'CUTTING': '#4caf50',      // Green
    'PROCESSING': '#2196f3',   // Blue
    'POLISHING': '#ff9800',    // Orange
    'PACKING': '#9c27b0',      // Purple
    'LOADING': '#f44336',      // Red
    'DELIVERY': '#00bcd4',     // Cyan
    'INSPECTION': '#673ab7',   // Indigo
    'QUALITY_CHECK': '#8bc34a', // Light Green
  };
  return colors[stage] || '#999';
}
```

---

## Alternative Display Patterns

### Pattern 1: Table View
```javascript
function displayAsTable(data) {
  const resultContainer = document.getElementById('workerPerformanceResult');
  
  let html = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #2a2a3e; border-bottom: 2px solid #9c27b0;">
          <th style="padding: 10px; text-align: left; color: #9c27b0;">Worker</th>
          <th style="padding: 10px; text-align: center; color: #9c27b0;">Cutting</th>
          <th style="padding: 10px; text-align: center; color: #9c27b0;">Processing</th>
          <th style="padding: 10px; text-align: center; color: #9c27b0;">Polishing</th>
          <th style="padding: 10px; text-align: center; color: #9c27b0;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${data.summary.map((worker, i) => `
          <tr style="background: ${i % 2 === 0 ? '#1e1e2e' : '#242435'}; border-bottom: 1px solid #444;">
            <td style="padding: 10px; color: #fff;">${worker.workerName || 'Unknown'}</td>
            <td style="padding: 10px; text-align: center; color: #4caf50;">${worker.stages.CUTTING || 0}</td>
            <td style="padding: 10px; text-align: center; color: #2196f3;">${worker.stages.PROCESSING || 0}</td>
            <td style="padding: 10px; text-align: center; color: #ff9800;">${worker.stages.POLISHING || 0}</td>
            <td style="padding: 10px; text-align: center; color: #9c27b0; font-weight: bold;">${worker.totalDoorsForWorker}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  resultContainer.innerHTML = html;
}
```

### Pattern 2: Compact List View
```javascript
function displayCompactList(data) {
  const resultContainer = document.getElementById('workerPerformanceResult');
  
  let html = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${data.summary.map(worker => {
        const stagesList = Object.entries(worker.stages)
          .map(([stage, count]) => `${stage}:${count}`)
          .join(' | ');
        
        return `
          <div style="
            background: #2a2a3e;
            padding: 10px 12px;
            border-radius: 4px;
            border-left: 3px solid #9c27b0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div>
              <strong>${worker.workerName || 'Unknown'}</strong>
              <br>
              <small style="color: #999;">${stagesList}</small>
            </div>
            <div style="text-align: right;">
              <div style="color: #4caf50; font-weight: bold; font-size: 16px;">${worker.totalDoorsForWorker}</div>
              <small style="color: #999;">doors</small>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  resultContainer.innerHTML = html;
}
```

### Pattern 3: Timeline View
```javascript
function displayTimeline(data) {
  const resultContainer = document.getElementById('workerPerformanceResult');
  
  let html = `
    <div style="border-left: 2px solid #9c27b0; padding-left: 20px; position: relative;">
      ${data.summary.map((worker, i) => `
        <div style="margin-bottom: 20px; position: relative;">
          <!-- Timeline dot -->
          <div style="
            position: absolute;
            left: -28px;
            width: 12px;
            height: 12px;
            background: #9c27b0;
            border-radius: 50%;
            border: 3px solid #1e1e2e;
          "></div>
          
          <!-- Content -->
          <div style="background: #2a2a3e; padding: 12px; border-radius: 4px;">
            <strong style="color: #9c27b0;">${worker.workerName}</strong>
            <div style="color: #999; font-size: 12px; margin-top: 4px;">
              ${worker.totalDoorsForWorker} doors • ${Object.keys(worker.stages).length} stages
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  resultContainer.innerHTML = html;
}
```

---

## Error Handling Examples

```javascript
// Safe property access
const workerName = worker?.workerName || 'Unknown Worker';
const stages = worker?.stages || {};
const totalDoors = worker?.totalDoorsForWorker ?? 0;

// Type checking
if (typeof worker !== 'object') {
  console.error('Invalid worker data:', worker);
  return;
}

// Array checking
if (!Array.isArray(data.summary)) {
  console.error('Summary is not an array');
  return;
}

// Handle missing stages
const stageList = Object.entries(stages).map(([stage, count]) => ({
  name: stage,
  count: count,
  icon: getStageIcon(stage),
  color: getStageColor(stage)
}));

if (stageList.length === 0) {
  console.warn('Worker has no stage data:', workerName);
}
```

---

## Integration with Existing UI

```javascript
// Add to your production supervisor section initialization
function initProductionSupervisor() {
  // ... existing code ...
  
  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('reportDate').value = today;
  
  // Add event listener for report type change
  document.getElementById('reportType').addEventListener('change', function() {
    // Clear previous results
    document.getElementById('workerPerformanceResult').innerHTML = '';
  });
}

// Call on page load
window.addEventListener('load', function() {
  if (document.getElementById('workerPerformanceSection')) {
    initProductionSupervisor();
  }
});
```

---

## CSS Styling (Optional Enhancement)

```html
<style>
  .worker-card {
    background: linear-gradient(135deg, #2a2a3e 0%, #1e1e2e 100%);
    border: 2px solid #444;
    border-left: 4px solid #9c27b0;
    border-radius: 8px;
    padding: 15px;
    transition: all 0.3s ease;
  }

  .worker-card:hover {
    border-color: #9c27b0;
    box-shadow: 0 0 15px rgba(156, 39, 176, 0.2);
    transform: translateY(-2px);
  }

  .stage-progress {
    background: #1a1a2e;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
  }

  .stage-progress-bar {
    background: #9c27b0;
    height: 100%;
    transition: width 0.3s ease;
  }

  .stat-box {
    background: #1e1e2e;
    padding: 10px;
    border-radius: 6px;
    text-align: center;
  }

  .stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #4caf50;
  }

  .stat-label {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }
</style>
```

---

## Debugging Tips

```javascript
// Log the full response structure
console.log('Full response:', data);
console.log('Summary data:', data.summary);
console.log('First worker:', data.summary[0]);

// Check worker properties
data.summary.forEach(worker => {
  console.log(`${worker.workerName} - ObjectId: ${worker.workerId}`);
  console.log(`  Stages:`, Object.keys(worker.stages));
  console.log(`  Total:`, worker.totalDoorsForWorker);
});

// Verify stage data
const firstWorker = data.summary[0];
Object.entries(firstWorker.stages).forEach(([stage, count]) => {
  console.log(`  ${stage}: ${count} doors`);
});
```

---

## Summary

✅ **Quick implementation:** Copy the JavaScript function + HTML section  
✅ **Multiple display options:** Cards, table, list, timeline  
✅ **Error handling:** Safe property access, type checking  
✅ **Styling:** Dark theme matching production supervisor dashboard  
✅ **Debugging:** Console logging for troubleshooting  
✅ **Worker names:** Displays name, not ObjectId (via backend $lookup)

