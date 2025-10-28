// backend/analyze-patient.mjs
import fetch from 'node-fetch';
import readline from 'readline';
import fs from 'fs/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   UltraLinq Longitudinal Analysis Tool                ║');
  console.log('║   Semi-Automated Mode (Manual Login)                  ║');
  console.log('║   Powered by Gemini 2.5 Pro                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Check if server is running
  try {
    const healthCheck = await fetch('http://localhost:3000/health');
    if (!healthCheck.ok) throw new Error('Server not responding');
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Error: Server is not running!');
    console.log('Please start the server first: npm start\n');
    rl.close();
    return;
  }

  const patientName = await question('Patient Name (optional, for report): ') || 'Patient';
  
  console.log('\nStudy Type Options:');
  console.log('  1. Left Leg Arterial');
  console.log('  2. Right Leg Arterial');
  console.log('  3. Aorta');
  console.log('  4. Carotid');
  const studyChoice = await question('Select study type (1-4): ');
  
  const studyTypeMap = {
    '1': 'left_leg',
    '2': 'right_leg',
    '3': 'aorta',
    '4': 'carotid'
  };
  
  const studyType = studyTypeMap[studyChoice];
  if (!studyType) {
    console.error('❌ Invalid study type selection');
    rl.close();
    return;
  }

  console.log('\n' + '─'.repeat(60));
  console.log('🔄 Starting analysis...');
  console.log('─'.repeat(60));
  console.log('\nA browser will open. Please:');
  console.log('  1. Log into UltraLinq');
  console.log('  2. Search for the patient');
  console.log('  3. Make sure all relevant studies are visible');
  console.log('  4. Return here and follow instructions\n');

  rl.close();

  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:3000/analyze-patient-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName,
        studyType
      })
    });

    const data = await response.json();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (data.success) {
      console.log('\n' + '═'.repeat(60));
      console.log('✅ ANALYSIS COMPLETE');
      console.log('═'.repeat(60));
      console.log(`\n📊 Studies Analyzed: ${data.studiesAnalyzed}`);
      console.log(`📅 Date Range: ${data.dateRange.earliest} to ${data.dateRange.latest}`);
      console.log(`⏱️  Total Time: ${duration} seconds`);
      
      if (data.patientInfo) {
        console.log(`\n👤 Patient: ${data.patientInfo.name}`);
        console.log(`   DOB: ${data.patientInfo.dob}`);
      }
      
      console.log('\n' + '─'.repeat(60));
      console.log('LONGITUDINAL ANALYSIS REPORT');
      console.log('─'.repeat(60) + '\n');
      console.log(data.report);
      console.log('\n' + '─'.repeat(60));

      // Save to file
      const filename = `report_${patientName.replace(/\s+/g, '_')}_${studyType}_${Date.now()}.txt`;
      await fs.writeFile(filename, `
ULTRALINQ LONGITUDINAL ANALYSIS REPORT
Patient: ${patientName}
Study Type: ${studyType}
Analysis Date: ${new Date().toISOString()}
Studies Analyzed: ${data.studiesAnalyzed}
Date Range: ${data.dateRange.earliest} to ${data.dateRange.latest}

${data.report}
`);
      console.log(`\n💾 Report saved to: ${filename}\n`);

    } else {
      console.error('\n❌ ERROR:', data.error);
    }
  } catch (error) {
    console.error('\n❌ FAILED TO ANALYZE:', error.message);
  }
}

main();