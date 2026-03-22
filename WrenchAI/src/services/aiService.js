// AI Service for WrenchAI
// Interprets OBD codes and suggests repairs

const VENICE_API_URL = 'https://api.venice.ai/api/v1/chat/completions';

// Get API key from environment
const getApiKey = () => {
  // In production, this should come from secure storage
  // For dev, you can hardcode or use Expo Constants
  return process.env.VENICE_API_KEY || '';
};

class AIService {
  async interpretDTCs(dtcs, vehicleInfo) {
    const prompt = this.buildDTCPrompt(dtcs, vehicleInfo);
    
    try {
      const response = await fetch(VENICE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getApiKey()}`
        },
        body: JSON.stringify({
          model: 'kimi-k2-5', // or llama-3.3-70b for cost savings
          messages: [
            {
              role: 'system',
              content: 'You are an experienced automotive technician. Interpret diagnostic trouble codes and provide clear explanations and repair guidance.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3
        })
      });

      const data = await response.json();
      
      if (data.choices && data.choices[0]) {
        return {
          success: true,
          interpretation: data.choices[0].message.content
        };
      }
      
      throw new Error('Invalid response from AI');
    } catch (error) {
      return {
        success: false,
        error: error.message,
        // Fallback to template response if AI fails
        interpretation: this.getTemplateInterpretation(dtcs, vehicleInfo)
      };
    }
  }

  buildDTCPrompt(dtcs, vehicleInfo) {
    const vehicleStr = vehicleInfo 
      ? `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model} ${vehicleInfo.trim || ''}`
      : 'Unknown vehicle';

    return `Vehicle: ${vehicleStr}

Diagnostic Trouble Codes:
${dtcs.map(dtc => `- ${dtc.code}: ${dtc.description || 'Unknown'}`).join('\n')}

Please provide:
1. A brief explanation of what each code means
2. The most likely root cause(s)
3. Whether this is safe to drive or requires immediate attention
4. Typical repair difficulty (DIY-friendly vs. shop required)
5. Estimated parts cost range

Keep it practical and actionable for a DIY enthusiast.`;
  }

  getTemplateInterpretation(dtcs, vehicleInfo) {
    // Fallback if AI is unavailable
    return `DTC Analysis (Offline Mode):

${dtcs.map(dtc => `${dtc.code}: Common issue for this vehicle type. Research specific repair procedures.`).join('\n')}

Note: AI interpretation unavailable. Consider consulting a repair manual or forum for detailed guidance.`;
  }

  async getRepairInstructions(dtc, vehicleInfo) {
    const prompt = `Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}

Problem: ${dtc.code} - ${dtc.description}

Provide step-by-step DIY repair instructions including:
1. Required tools
2. Parts needed
3. Estimated time
4. Safety precautions
5. Step-by-step procedure`;

    // Similar implementation to interpretDTCs
    return this.queryAI(prompt);
  }

  async queryAI(prompt) {
    // Generic query method
    try {
      const response = await fetch(VENICE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getApiKey()}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b', // Cheaper for general queries
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        })
      });

      const data = await response.json();
      return {
        success: true,
        content: data.choices?.[0]?.message?.content || 'No response'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new AIService();
