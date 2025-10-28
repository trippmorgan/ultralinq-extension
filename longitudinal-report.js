// longitudinal-report.js
async function loadReport() {
  const data = await chrome.storage.session.get(['longitudinalReport', 'studiesAnalyzed']);
  
  if (data.longitudinalReport) {
    document.getElementById('report').textContent = data.longitudinalReport;
    document.getElementById('info').textContent = 
      `Studies Analyzed: ${data.studiesAnalyzed || 'Unknown'}`;
  } else {
    document.getElementById('report').textContent = 'No report data found.';
  }
}

function copyReport() {
  const reportText = document.getElementById('report').textContent;
  navigator.clipboard.writeText(reportText).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

function downloadReport() {
  const reportText = document.getElementById('report').textContent;
  const blob = new Blob([reportText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `longitudinal-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

loadReport();