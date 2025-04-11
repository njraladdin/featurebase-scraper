/**
 * Main script for the Featurebase Scraper
 * This script orchestrates the data collection from both feedback posts and roadmap
 * for any product hosted on Featurebase (feedback.*.com)
 */

const fs = require('fs').promises;
const path = require('path');
const { fetchAllPosts } = require('./feedback');
const { fetchAllRoadmapData } = require('./roadmap');
const { fetchOrganizationData } = require('./organization');

// Configuration
const DEFAULT_PRODUCT = 'lovable.dev';
const OUTPUT_DIR = 'output';
const OUTPUT_DEBUG_DIR = 'output_debug';
const WEBSITE_DATA_DIR = 'website/data';
const WEBSITE_INDEX_PATH = 'website/index.html';
const SCRAPER_LOG_FILE = 'scraper_log.txt';
const DEFAULT_ITEM_LIMIT = 0; // 0 means no limit

// Helper function to write logs to a file and console
async function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(message);
    
    try {
        // Make sure the output directory exists
        await fs.mkdir(OUTPUT_DEBUG_DIR, { recursive: true });
        
        // Then append to the log file
        await fs.appendFile(path.join(OUTPUT_DEBUG_DIR, SCRAPER_LOG_FILE), logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error.message);
    }
}

/**
 * Converts a JSON file to a JavaScript file that sets window variables
 * @param {string} jsonFilePath - Path to the JSON file
 * @param {string} variableName - Name of the variable to create
 * @returns {Promise<string>} - Path to the created JavaScript file
 */
async function convertJsonToJsDataFile(jsonFilePath, variableName) {
    try {
        // Check if the JSON file exists
        const exists = await fs.access(jsonFilePath).then(() => true).catch(() => false);
        if (!exists) {
            throw new Error(`JSON file not found: ${jsonFilePath}`);
        }
        
        // Read the JSON file
        const jsonData = await fs.readFile(jsonFilePath, 'utf8');
        const data = JSON.parse(jsonData);
        
        // Create the JavaScript file path with _data suffix and .js extension
        const jsFilePath = jsonFilePath.replace(/\.json$/, '_data.js');
        
        // Create the JavaScript content with window assignment
        const jsContent = `// Auto-generated JavaScript file for static site usage
// Original JSON: ${path.basename(jsonFilePath)}
// Generated on: ${new Date().toISOString()}

window.${variableName} = ${JSON.stringify(data, null, 2)};
`;

        // Write the JavaScript file
        await fs.writeFile(jsFilePath, jsContent);
        
        return jsFilePath;
    } catch (error) {
        throw new Error(`Error converting JSON to JS file: ${error.message}`);
    }
}

/**
 * Convert all main JSON files to JavaScript data files for a given product
 * @param {string} productDomain - The product domain
 * @returns {Promise<Object>} - Object containing paths to generated JS files
 */
async function convertAllJsonToJsDataFiles(productDomain) {
    const productDir = path.join(OUTPUT_DIR, productDomain);
    const conversions = [];
    
    // Define files to convert and their variable names
    const filesToConvert = [
        { path: 'feedback.json', variable: 'feedbackData' },
        { path: 'roadmap.json', variable: 'roadmapData' },
        { path: 'organization.json', variable: 'organizationData' }
    ];
    
    // Process each file
    const results = {};
    for (const file of filesToConvert) {
        const jsonPath = path.join(productDir, file.path);
        try {
            // Check if file exists before attempting conversion
            const exists = await fs.access(jsonPath).then(() => true).catch(() => false);
            if (exists) {
                const jsPath = await convertJsonToJsDataFile(jsonPath, file.variable);
                await logMessage(`Converted ${file.path} to JavaScript data file at ${path.basename(jsPath)}`);
                results[file.path] = jsPath;
            } else {
                await logMessage(`Skipping conversion of ${file.path} (file not found)`);
            }
        } catch (error) {
            await logMessage(`Error converting ${file.path}: ${error.message}`);
        }
    }
    
    return results;
}

/**
 * Copy output files to website/data directory for the specified product
 * @param {string} productDomain - The product domain
 * @returns {Promise<void>}
 */
async function copyFilesToWebsiteData(productDomain) {
    try {
        // Define source and destination directories
        const sourceDir = path.join(OUTPUT_DIR, productDomain);
        const destDir = path.join(WEBSITE_DATA_DIR, productDomain);
        
        // Create the destination directory if it doesn't exist
        await fs.mkdir(destDir, { recursive: true });
        
        // Get all files in the source directory
        const files = await fs.readdir(sourceDir);
        
        // Filter out files we want to copy (JSON and JS data files)
        const filesToCopy = files.filter(file => 
            file.endsWith('.json') || file.endsWith('_data.js')
        );
        
        // Copy each file to the destination directory
        for (const file of filesToCopy) {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(destDir, file);
            
            // Copy file (overwrites if it already exists)
            await fs.copyFile(sourcePath, destPath);
            await logMessage(`Copied ${file} to ${path.relative(process.cwd(), destPath)}`);
        }
        
        await logMessage(`Successfully copied ${filesToCopy.length} files to website/data/${productDomain}`);
    } catch (error) {
        throw new Error(`Error copying files to website/data: ${error.message}`);
    }
}

/**
 * Update the products array in website/index.html
 * @param {string} productDomain - The product domain
 * @param {Object} organizationData - The organization data with logo information
 * @returns {Promise<void>}
 */
async function updateWebsiteProductList(productDomain, organizationData) {
    try {
        // Check if website/index.html exists
        const indexExists = await fs.access(WEBSITE_INDEX_PATH).then(() => true).catch(() => false);
        if (!indexExists) {
            throw new Error(`Website index file not found: ${WEBSITE_INDEX_PATH}`);
        }
        
        // Read the index.html file
        const indexContent = await fs.readFile(WEBSITE_INDEX_PATH, 'utf8');
        
        // Find the products array in the HTML file
        const productArrayRegex = /const\s+productIndex\s*=\s*\{\s*"products"\s*:\s*\[([\s\S]*?)\]\s*\}/;
        const productArrayMatch = indexContent.match(productArrayRegex);
        
        if (!productArrayMatch) {
            throw new Error('Could not find the products array in the index.html file');
        }
        
        // Parse the existing products array
        const productsArrayString = productArrayMatch[0];
        const productsArray = JSON.parse(productsArrayString.replace('const productIndex = ', ''));
        
        // Get the logo URL from organization data
        let logoUrl = '';
        if (organizationData && organizationData.picture) {
            logoUrl = organizationData.picture;
        }
        
        // Check if the product already exists in the array
        const existingProductIndex = productsArray.products.findIndex(product => 
            product.id === productDomain || product.name === productDomain
        );
        
        if (existingProductIndex >= 0) {
            // Update existing product entry
            productsArray.products[existingProductIndex] = {
                ...productsArray.products[existingProductIndex],
                id: productDomain,
                name: productDomain,
                description: `${productDomain} Feedback Portal`
            };
            
            // Only update logo if we have one and it's not already set
            if (logoUrl && (!productsArray.products[existingProductIndex].logo || 
                productsArray.products[existingProductIndex].logo !== logoUrl)) {
                productsArray.products[existingProductIndex].logo = logoUrl;
            }
            
            await logMessage(`Updated existing product in website/index.html: ${productDomain}`);
        } else {
            // Add new product entry
            productsArray.products.push({
                id: productDomain,
                name: productDomain,
                description: `${productDomain} Feedback Portal`,
                logo: logoUrl
            });
            
            await logMessage(`Added new product to website/index.html: ${productDomain}`);
        }
        
        // Format the updated products array with proper indentation
        const updatedProductsArrayString = JSON.stringify(productsArray, null, 2)
            .replace(/"products":/g, '"products":')
            .replace(/\n/g, '\n        ');
        
        // Create the updated script content
        const updatedScriptContent = `const productIndex = ${updatedProductsArrayString};`;
        
        // Replace the old products array with the updated one
        const updatedIndexContent = indexContent.replace(
            productArrayRegex,
            updatedScriptContent
        );
        
        // Write the updated content back to the file
        await fs.writeFile(WEBSITE_INDEX_PATH, updatedIndexContent);
        await logMessage(`Successfully updated products list in ${WEBSITE_INDEX_PATH}`);
        
    } catch (error) {
        throw new Error(`Error updating website product list: ${error.message}`);
    }
}

/**
 * Main execution function
 * @param {Object} options Configuration options
 * @param {string} options.productDomain The product domain to scrape (e.g., 'lovable.dev', 'base44.com')
 * @param {boolean} options.runFeedbackScraper Whether to run the feedback posts scraper
 * @param {boolean} options.runRoadmapScraper Whether to run the roadmap scraper
 * @param {boolean} options.runOrganizationScraper Whether to run the organization data scraper
 * @param {number} options.itemLimit Limit for items to fetch (0 = no limit) - applies to both feedback posts and roadmap items per section
 * @param {boolean} options.generateJsModules Whether to generate JavaScript data files from JSON files
 * @param {boolean} options.copyToWebsite Whether to copy output files to website/data directory
 * @param {boolean} options.updateWebsiteProducts Whether to update the products array in website/index.html
 */
async function runScraper(options = {}) {
    const {
        productDomain = DEFAULT_PRODUCT,
        runFeedbackScraper = true,
        runRoadmapScraper = true,
        runOrganizationScraper = true,
        itemLimit = DEFAULT_ITEM_LIMIT,
        generateJsModules = true,
        copyToWebsite = true,
        updateWebsiteProducts = true
    } = options;
    
    // Create all required directories upfront
    try {
        // Create main output directories
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await fs.mkdir(OUTPUT_DEBUG_DIR, { recursive: true });
        
        // Create product-specific directories
        const productOutputDir = path.join(OUTPUT_DIR, productDomain);
        const productDebugDir = path.join(OUTPUT_DEBUG_DIR, productDomain);
        await fs.mkdir(productOutputDir, { recursive: true });
        await fs.mkdir(productDebugDir, { recursive: true });
        
        // Create website data directory if copying is enabled
        if (copyToWebsite) {
            await fs.mkdir(WEBSITE_DATA_DIR, { recursive: true });
            await fs.mkdir(path.join(WEBSITE_DATA_DIR, productDomain), { recursive: true });
        }
    } catch (error) {
        console.error(`Error creating output directories: ${error.message}`);
        return;
    }
    
    // Define output directory
    const productOutputDir = path.join(OUTPUT_DIR, productDomain);
    
    // Start time tracking
    const startTime = new Date();
    await logMessage(`=== Featurebase Scraper for ${productDomain} Starting at ${startTime.toISOString()} ===`);
    
    let feedbackResults = null;
    let roadmapResults = null;
    let organizationResults = null;
    
    // Run the organization data scraper if enabled
    if (runOrganizationScraper) {
        await logMessage(`\n=== Starting Organization Data Scraper for ${productDomain} ===`);
        try {
            // Pass product domain to the organization module
            organizationResults = await fetchOrganizationData(productDomain);
            await logMessage('=== Organization Data Scraper Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR running organization scraper: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Run the feedback posts scraper if enabled
    if (runFeedbackScraper) {
        await logMessage(`\n=== Starting Feedback Posts Scraper for ${productDomain} ===`);
        try {
            // Pass product domain and limit to the feedback module
            feedbackResults = await fetchAllPosts(productDomain, itemLimit);
            await logMessage('=== Feedback Posts Scraper Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR running feedback scraper: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Run the roadmap scraper if enabled
    if (runRoadmapScraper) {
        await logMessage(`\n=== Starting Roadmap Scraper for ${productDomain} ===`);
        try {
            // Pass limit and product domain to the roadmap module
            roadmapResults = await fetchAllRoadmapData(itemLimit, productDomain);
            await logMessage('=== Roadmap Scraper Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR running roadmap scraper: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Generate JavaScript files from JSON files if enabled
    if (generateJsModules) {
        await logMessage('\n=== Generating JavaScript Data Files from JSON Files ===');
        try {
            const jsFiles = await convertAllJsonToJsDataFiles(productDomain);
            await logMessage('=== JavaScript Data File Generation Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR generating JavaScript data files: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Copy output files to website/data directory if enabled
    if (copyToWebsite) {
        await logMessage('\n=== Copying Output Files to Website Data Directory ===');
        try {
            await copyFilesToWebsiteData(productDomain);
            await logMessage('=== File Copying Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR copying files to website/data: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Update products array in website/index.html if enabled
    if (updateWebsiteProducts && organizationResults) {
        await logMessage('\n=== Updating Products List in Website Index ===');
        try {
            await updateWebsiteProductList(productDomain, organizationResults);
            await logMessage('=== Website Product List Update Completed Successfully ===');
        } catch (error) {
            await logMessage(`ERROR updating website product list: ${error.message}`);
            if (error.stack) {
                await logMessage(`Stack trace: ${error.stack}`);
            }
        }
    }
    
    // Calculate and log total execution time
    const endTime = new Date();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = (executionTimeMs / 1000).toFixed(2);
    
    await logMessage(`\n=== Featurebase Scraper for ${productDomain} Completed at ${endTime.toISOString()} ===`);
    await logMessage(`Total execution time: ${executionTimeSec} seconds`);
    await logMessage(`Data saved to: ${productOutputDir}`);
    if (copyToWebsite) {
        await logMessage(`Data also copied to: ${path.join(WEBSITE_DATA_DIR, productDomain)}`);
    }
    
    return {
        organizationResults,
        feedbackResults,
        roadmapResults
    };
}

// Command line argument parsing for quick configuration
// Usage: node main.js [product-domain] [--options]
// Options:
//   --feedback-only        Run only the feedback scraper
//   --roadmap-only         Run only the roadmap scraper 
//   --organization-only    Run only the organization scraper
//   --item-limit=N         Limit the number of items to fetch (applies to both feedback posts and roadmap items per section)
//   --no-js-modules        Don't generate JavaScript data files from JSON files
//   --no-website-copy      Don't copy output files to website/data directory
//   --no-website-update    Don't update products array in website/index.html
function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    const options = {
        productDomain: DEFAULT_PRODUCT,
        runFeedbackScraper: true,
        runRoadmapScraper: true,
        runOrganizationScraper: true,
        itemLimit: DEFAULT_ITEM_LIMIT,
        generateJsModules: true,
        copyToWebsite: true,
        updateWebsiteProducts: true
    };
    
    // First argument is the product domain if provided
    if (args.length > 0 && !args[0].startsWith('--')) {
        options.productDomain = args[0];
    }
    
    // Simple flag-based args
    if (args.includes('--feedback-only')) {
        options.runRoadmapScraper = false;
        options.runOrganizationScraper = false;
    }
    
    if (args.includes('--roadmap-only')) {
        options.runFeedbackScraper = false;
        options.runOrganizationScraper = false;
    }
    
    if (args.includes('--organization-only')) {
        options.runFeedbackScraper = false;
        options.runRoadmapScraper = false;
    }
    
    // Option to disable JS module generation
    if (args.includes('--no-js-modules')) {
        options.generateJsModules = false;
    }
    
    // Option to disable copying to website/data
    if (args.includes('--no-website-copy')) {
        options.copyToWebsite = false;
    }
    
    // Option to disable updating the products array in website/index.html
    if (args.includes('--no-website-update')) {
        options.updateWebsiteProducts = false;
    }
    
    // Parse item limit if provided
    const limitArg = args.find(arg => arg.startsWith('--item-limit='));
    if (limitArg) {
        const limitValue = parseInt(limitArg.split('=')[1], 10);
        if (!isNaN(limitValue) && limitValue >= 0) {
            options.itemLimit = limitValue;
        }
    }
    
    return options;
}

// Run the scraper with command line options when this script is executed directly
if (require.main === module) {
    const options = parseCommandLineArgs();
    
    // Log the configuration
    console.log(`Starting Featurebase Scraper for product: ${options.productDomain}`);
    console.log('Configuration:');
    console.log(`- Product Domain: ${options.productDomain}`);
    console.log(`- Organization Scraper: ${options.runOrganizationScraper ? 'Enabled' : 'Disabled'}`);
    console.log(`- Feedback Scraper: ${options.runFeedbackScraper ? 'Enabled' : 'Disabled'}`);
    console.log(`- Roadmap Scraper: ${options.runRoadmapScraper ? 'Enabled' : 'Disabled'}`);
    console.log(`- Item Limit: ${options.itemLimit === 0 ? 'No Limit' : options.itemLimit}`);
    console.log(`- Generate JS Data Files: ${options.generateJsModules ? 'Enabled' : 'Disabled'}`);
    console.log(`- Copy to Website Data: ${options.copyToWebsite ? 'Enabled' : 'Disabled'}`);
    console.log(`- Update Website Products: ${options.updateWebsiteProducts ? 'Enabled' : 'Disabled'}`);
    console.log('');
    
    // Run the scraper
    runScraper(options).catch(error => {
        console.error('Unhandled error in scraper execution:', error);
        process.exit(1);
    });
}

// Export the main function for potential use by other modules
module.exports = {
    runScraper,
    convertJsonToJsDataFile,
    convertAllJsonToJsDataFiles,
    copyFilesToWebsiteData,
    updateWebsiteProductList
}; 