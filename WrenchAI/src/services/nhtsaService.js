// NHTSA VIN Decoder Service
// Uses NHTSA vPIC API (free, no API key required)

const NHTSA_BASE_URL = 'https://vpic.nhtsa.dot.gov/api';

class NHTSAService {
  async decodeVIN(vin) {
    try {
      const response = await fetch(
        `${NHTSA_BASE_URL}/vehicles/decodevin/${vin}?format=json`
      );
      const data = await response.json();
      
      if (data.Results && data.Results.length > 0) {
        return this.parseVINData(data.Results);
      }
      
      throw new Error('No data returned for VIN');
    } catch (error) {
      console.error('VIN decode error:', error);
      return { error: error.message };
    }
  }

  async decodeVINValues(vin) {
    // Simpler endpoint that returns key-value pairs
    try {
      const response = await fetch(
        `${NHTSA_BASE_URL}/vehicles/decodevinvalues/${vin}?format=json`
      );
      const data = await response.json();
      
      if (data.Results && data.Results.length > 0) {
        return { success: true, data: data.Results[0] };
      }
      
      throw new Error('No data returned');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  parseVINData(results) {
    const vehicleInfo = {};
    
    results.forEach(item => {
      if (item.Value && item.Value !== 'Not Applicable') {
        vehicleInfo[item.Variable] = item.Value;
      }
    });

    return {
      success: true,
      year: vehicleInfo['Model Year'] || null,
      make: vehicleInfo['Make'] || null,
      model: vehicleInfo['Model'] || null,
      trim: vehicleInfo['Trim'] || null,
      engine: vehicleInfo['Engine Model'] || vehicleInfo['Engine Configuration'] || null,
      transmission: vehicleInfo['Transmission'] || null,
      fuelType: vehicleInfo['Fuel Type - Primary'] || null,
      plant: vehicleInfo['Plant Company Name'] || null,
      raw: vehicleInfo
    };
  }

  // Get recalls for a vehicle
  async getRecalls(make, model, year) {
    try {
      const response = await fetch(
        `${NHTSA_BASE_URL}/recalls/records?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}&format=json`
      );
      const data = await response.json();
      
      return {
        success: true,
        count: data.Count || 0,
        recalls: data.Results || []
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new NHTSAService();
