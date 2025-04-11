/**
 * Organization module for Featurebase Scraper
 * This module fetches organization information from Featurebase
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// --- Default Configuration ---
const DEFAULT_PRODUCT = 'lovable.dev';

// Headers
const COMMON_HEADERS = {
    'accept': 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'dnt': '1',
};

// Build URLs and filenames based on product domain
function getConfig(productDomain = DEFAULT_PRODUCT) {
    // Ensure productDomain has a valid TLD
    let domain = productDomain;
    
    // If the domain doesn't have a dot, assume it's missing a TLD and add .com
    if (!domain.includes('.')) {
        domain = `${domain}.com`;
    }
    
    return {
        ORGANIZATION_URL: `https://feedback.${domain}/api/v1/organization`,
        OUTPUT_DIR: path.join('output', productDomain),
        OUTPUT_DEBUG_DIR: path.join('output_debug', productDomain),
        ORGANIZATION_OUTPUT_FILE: 'organization.json',
    };
}

/**
 * Fetch organization data from Featurebase
 * @param {string} productDomain - The product domain (e.g., 'lovable.dev')
 * @returns {Promise<Object>} - The organization data
 */
async function fetchOrganizationData(productDomain = DEFAULT_PRODUCT) {
    console.log(`Fetching organization data for ${productDomain}...`);
    
    const config = getConfig(productDomain);
    
    try {
        // Extract domain for the referer header
        const domainMatch = config.ORGANIZATION_URL.match(/feedback\.([^/]+)/);
        const domain = domainMatch ? domainMatch[1] : 'example.com';
        
        // Add the referer header
        const headers = {
            ...COMMON_HEADERS,
            'referer': `https://feedback.${domain}/`,
        };
        
        // Make the API request
        const response = await axios.get(config.ORGANIZATION_URL, { headers });
        
        if (response.status !== 200) {
            throw new Error(`Failed to fetch organization data: HTTP Status ${response.status}`);
        }
        
        if (!response.data) {
            throw new Error('Organization API returned empty response');
        }
        
        console.log('Successfully fetched organization data');
        
        // Extract relevant information
        const organizationData = {
            name: response.data.name,
            displayName: response.data.displayName,
            color: response.data.color,
            picture: response.data.picture,
            customDomain: response.data.customDomain,
            subscriptionStatus: response.data.subscriptionStatus,
            plan: response.data.plan,
            language: response.data.language,
            categories: response.data.categories,
            postCategories: response.data.postCategories,
            postTags: response.data.postTags,
            postStatuses: response.data.postStatuses,
            roadmaps: response.data.roadmaps,
            changelogTags: response.data.changelogTags,
            changelogCategories: response.data.changelogCategories,
            roadmapStatuses: response.data.roadmapStatuses,
            createdAt: response.data.createdAt,
            updatedAt: response.data.updatedAt,
            widget: response.data.widget,
            settings: response.data.settings,
        };
        
        // Save the data to JSON file
        await saveOrganizationData(organizationData, config);
        
        return organizationData;
    } catch (error) {
        console.error('Error fetching organization data:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
        }
        throw error;
    }
}

/**
 * Save organization data to a JSON file
 * @param {Object} data - The organization data to save
 * @param {Object} config - Configuration object with output paths
 * @returns {Promise<boolean>} - Whether the save operation was successful
 */
async function saveOrganizationData(data, config) {
    try {
        // Ensure the output directory exists
        await fs.mkdir(config.OUTPUT_DIR, { recursive: true });
        
        const outputFilePath = path.join(config.OUTPUT_DIR, config.ORGANIZATION_OUTPUT_FILE);
        
        console.log(`Saving organization data to ${outputFilePath}...`);
        await fs.writeFile(outputFilePath, JSON.stringify(data, null, 2)); // Pretty print JSON
        console.log(`Successfully saved organization data to ${outputFilePath}`);
        
        return true;
    } catch (error) {
        console.error(`Error saving organization data:`, error.message);
        return false;
    }
}

// Export the main function for use in main.js
module.exports = {
    fetchOrganizationData
}; 