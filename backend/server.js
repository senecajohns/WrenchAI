// WrenchAI Backend API
// Proxies AI calls to Venice API (so API key isn't in mobile app)

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:19006']; // Dev defaults

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  }
}));

// Body parsing with size limit
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const VENICE_API_URL = 'https://api.venice.ai/api/v1/chat/completions';
const VENICE_API_KEY = process.env.VENICE_API_KEY;

if (!VENICE_API_KEY) {
  console.error('VENICE_API_KEY not set!');
  process.exit(1);
}

// Input validation middleware
const validateDTCRequest = (req, res, next) => {
  const { dtcs, vehicleInfo } = req.body;
  
  if (!dtcs || !Array.isArray(dtcs)) {
    return res.status(400).json({ 
      success: false, 
      error: 'dtcs must be an array' 
    });
  }
  
  if (dtcs.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'dtcs array cannot be empty' 
    });
  }
  
  // Validate each DTC has a code
  for (const dtc of dtcs) {
    if (!dtc.code || typeof dtc.code !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Each DTC must have a code string' 
      });
    }
  }
  
  next();
};

const validateRepairRequest = (req, res, next) => {
  const { dtc, vehicleInfo } = req.body;
  
  if (!dtc || !dtc.code) {
    return res.status(400).json({ 
      success: false, 
      error: 'dtc with code is required' 
    });
  }
  
  if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model) {
    return res.status(400).json({ 
      success: false, 
      error: 'vehicleInfo with year, make, and model is required' 
    });
  }
  
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Interpret DTCs
app.post('/api/interpret-dtcs', validateDTCRequest, async (req, res) => {
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

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

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
app.post('/api/repair-instructions', validateRepairRequest, async (req, res) => {
  try {
    const { dtc, vehicleInfo } = req.body;
    
    const prompt = `Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}

Problem: ${dtc.code} - ${dtc.description || 'Unknown issue'}

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

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    
    res.json({
      success: true,
      instructions: data.choices?.[0]?.message?.content || 'No instructions available',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WrenchAI backend running on port ${PORT}`);
});
