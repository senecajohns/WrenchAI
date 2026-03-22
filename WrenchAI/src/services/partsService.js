// Parts Affiliate Service for WrenchAI
// Generates affiliate links to auto parts retailers

class PartsService {
  constructor() {
    this.affiliates = {
      autozone: {
        name: 'AutoZone',
        baseUrl: 'https://www.autozone.com/search',
        param: 'searchText',
      },
      advance: {
        name: 'Advance Auto Parts',
        baseUrl: 'https://shop.advanceautoparts.com/web/SearchResults',
        param: 'searchTerm',
      },
      rockauto: {
        name: 'RockAuto',
        baseUrl: 'https://www.rockauto.com/en/catalog/search',
        param: 'searchstr',
      },
      oreilly: {
        name:"O'Reilly",
        baseUrl: 'https://www.oreillyauto.com/shop/search',
        param: 'q',
      },
    };
  }

  generateSearchLinks(query, dtc = null, vehicleInfo = null) {
    const links = [];
    
    // Build search query
    let searchQuery = query;
    if (dtc && vehicleInfo) {
      searchQuery = `${dtc.code} ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;
    }

    // Generate links for each affiliate
    for (const [key, config] of Object.entries(this.affiliates)) {
      const url = `${config.baseUrl}?${config.param}=${encodeURIComponent(searchQuery)}`;
      links.push({
        retailer: config.name,
        url: url,
        key: key,
      });
    }

    return links;
  }

  // Direct part number search (when we know the exact part)
  generatePartLinks(partNumber, partType) {
    return [
      {
        retailer: 'RockAuto',
        url: `https://www.rockauto.com/en/catalog/search?searchstr=${encodeURIComponent(partNumber)}`,
      },
      {
        retailer: 'eBay',
        url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}`,
      },
    ];
  }

  // Get common parts for a DTC code
  getCommonPartsForDTC(dtcCode, vehicleInfo) {
    // This would ideally be a database lookup
    // For MVP, return generic search suggestions
    const partsMap = {
      'P0300': ['spark plugs', 'ignition coils', 'fuel injectors'],
      'P0420': ['catalytic converter', 'O2 sensors'],
      'P0171': ['MAF sensor', 'oxygen sensor', 'air filter'],
      'P0455': ['gas cap', 'EVAP canister', 'purge valve'],
      'P0401': ['EGR valve', 'DPFE sensor'],
    };

    const parts = partsMap[dtcCode] || ['diagnostic tool', 'repair manual'];
    
    return parts.map(part => ({
      name: part,
      links: this.generateSearchLinks(
        `${part} ${vehicleInfo?.year || ''} ${vehicleInfo?.make || ''} ${vehicleInfo?.model || ''}`.trim()
      ),
    }));
  }
}

export default new PartsService();
