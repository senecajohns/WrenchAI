// WrenchAI Backend API
// Proxies AI calls to Venice API (so API key isn't in mobile app)

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const VENICE_API_URL = 'https://api.venice.ai/api/v1/chat/completions';
const VENICE_API_KEY = process.env.VENICE_API_KEY;

if (!VENICE_API_KEY) {
  console.error('VENICE_API_KEY not set!');
  process.exit(1);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Interpret DTCs
app.post('/api/interpret-dtcs', async (req, res) => {
  try {
    const { dtcs, vehicleInfo } = req.body;
    
    const vehicleStr = vehicleInfo 
      ? `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`
      : 'Unknown vehicle';

    const dtcList = dtcs.map(d => `- ${d.code}: ${d.description || 'Unknown'}`).join('\n');

    const prompt = `Vehicle: ${vehicleStr}

Diagnostic Trouble Codes:
${dtcList}

Provide:
1. Brief explanation of each code
2. Most likely root cause(s)
3. Safety level (safe to drive / immediate attention)
4. DIY difficulty (beginner / intermediate / shop required)
5. Estimated parts cost

Keep it practical and actionable.`;

    const response = await fetch(VENICE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are an experienced automotive technician.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    
    res.json({
      success: true,
      interpretation: data.choices?.[0]?.message?.content || 'No interpretation available',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get repair instructions
app.post('/api/repair-instructions', async (req, res) => {
  try {
    const { dtc, vehicleInfo } = req.body;
    
    const prompt = `Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}

Problem: ${dtc.code} - ${dtc.description}

Provide step-by-step DIY repair instructions:
1. Required tools
2. Parts needed
3. Estimated time
4. Safety precautions
5. Step-by-step procedure`;

    const response = await fetch(VENICE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    
    res.json({
      success: true,
      instructions: data.choices?.[0]?.message?.content || 'No instructions available',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WrenchAI backend running on port ${PORT}`);
});
