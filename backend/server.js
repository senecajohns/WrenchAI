// WrenchAI Backend API

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set in .env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:19006', 'http://localhost:8081'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting: 60 requests per 15 min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later.' },
}));

const SYSTEM_PROMPT = `You are an ASE-certified master automotive technician with 20+ years of hands-on experience.
You give clear, practical, safety-conscious advice tailored to the specific vehicle and codes provided.
Be concise but thorough. Always flag anything that makes a vehicle unsafe to drive.
When estimating costs, give a realistic range (parts + labor if shop required).`;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Validation ---

const validateDTCRequest = (req, res, next) => {
  const { dtcs } = req.body;
  if (!Array.isArray(dtcs) || dtcs.length === 0) {
    return res.status(400).json({ success: false, error: 'dtcs must be a non-empty array' });
  }
  for (const dtc of dtcs) {
    if (!dtc.code || typeof dtc.code !== 'string') {
      return res.status(400).json({ success: false, error: 'Each DTC must have a code string' });
    }
    // Enforce valid DTC format: P/C/B/U followed by 4 hex digits
    if (!/^[PCBU][0-9A-F]{4}$/i.test(dtc.code)) {
      return res.status(400).json({ success: false, error: `Invalid DTC format: ${dtc.code}` });
    }
  }
  if (dtcs.length > 20) {
    return res.status(400).json({ success: false, error: 'Too many DTCs in one request (max 20)' });
  }
  next();
};

const validateRepairRequest = (req, res, next) => {
  const { dtc, vehicleInfo } = req.body;
  if (!dtc?.code) {
    return res.status(400).json({ success: false, error: 'dtc.code is required' });
  }
  if (!/^[PCBU][0-9A-F]{4}$/i.test(dtc.code)) {
    return res.status(400).json({ success: false, error: `Invalid DTC format: ${dtc.code}` });
  }
  if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model) {
    return res.status(400).json({ success: false, error: 'vehicleInfo with year, make, and model is required' });
  }
  next();
};

// --- Endpoints ---

// Interpret one or more DTCs with cross-code aggregation
app.post('/api/interpret-dtcs', validateDTCRequest, async (req, res) => {
  try {
    const { dtcs, vehicleInfo } = req.body;

    const vehicleStr = vehicleInfo
      ? `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`
      : 'Unknown vehicle';

    // Group by type for context
    const confirmed = dtcs.filter(d => d.type === 'confirmed' || !d.type);
    const pending = dtcs.filter(d => d.type === 'pending');
    const permanent = dtcs.filter(d => d.type === 'permanent');

    const formatGroup = (label, codes) =>
      codes.length > 0
        ? `${label}:\n${codes.map(d => `  - ${d.code}`).join('\n')}`
        : '';

    const dtcSection = [
      formatGroup('Confirmed (stored)', confirmed),
      formatGroup('Pending', pending),
      formatGroup('Permanent (non-erasable)', permanent),
    ].filter(Boolean).join('\n');

    const prompt = `Vehicle: ${vehicleStr}

Diagnostic Trouble Codes retrieved:
${dtcSection}

Please provide:
1. Plain-English explanation of each code and what it means for this specific vehicle
2. Cross-code analysis — if multiple codes are present, identify whether they point to a single root cause or multiple independent issues
3. Safety assessment: is this vehicle safe to drive? (Yes / Drive with caution / Do not drive)
4. DIY feasibility: (Beginner-friendly / Some experience needed / Professional shop required)
5. Estimated repair cost range (parts only for DIY; parts + labor for shop)
6. Recommended next diagnostic steps if the root cause is unclear

Be specific to the ${vehicleStr}. Flag any known make/model-specific issues related to these codes.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({
      success: true,
      interpretation: message.content[0].text,
    });
  } catch (error) {
    console.error('interpret-dtcs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Step-by-step repair instructions for a single DTC
app.post('/api/repair-instructions', validateRepairRequest, async (req, res) => {
  try {
    const { dtc, vehicleInfo } = req.body;
    const vehicle = `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;

    const prompt = `Vehicle: ${vehicle}
Fault code: ${dtc.code}${dtc.description ? ` — ${dtc.description}` : ''}

Write a detailed DIY repair guide for this specific vehicle:

1. **Tools required** (include part numbers or specs where helpful)
2. **Parts needed** (OEM part numbers if known, plus common aftermarket alternatives)
3. **Estimated time** and skill level
4. **Safety precautions** before starting
5. **Step-by-step repair procedure** (numbered, with torque specs and clearances where applicable)
6. **Verification steps** — how to confirm the repair is successful
7. **When to stop and see a professional** (conditions where DIY isn't safe or feasible)

Be specific to the ${vehicle}. Note any vehicle-specific gotchas or common mistakes for this job.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({
      success: true,
      instructions: message.content[0].text,
    });
  } catch (error) {
    console.error('repair-instructions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WrenchAI backend running on port ${PORT}`);
});
