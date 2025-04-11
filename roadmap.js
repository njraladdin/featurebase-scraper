const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// --- Default Configuration ---
const DEFAULT_PRODUCT = 'lovable.dev';
const PAGE_DELAY_MS = 300; // Delay between fetching pages (milliseconds)
const DETAIL_DELAY_MS = 150; // Delay between fetching post details (milliseconds)
const COMMENTS_DELAY_MS = 100; // Delay between fetching comments (milliseconds)

// Limit parameters for testing - set to 0 for no limit
const TEST_LIMIT = 5; // Default limit for testing - set to 5 items per section

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
        BASE_URL: `https://feedback.${domain}/api/v1`,
        SUBMISSION_URL: `https://feedback.${domain}/api/v1/submission`,
        COMMENTS_URL: `https://feedback.${domain}/api/v1/comment`,
        ORGANIZATION_URL: `https://feedback.${domain}/api/v1/organization`,
        OUTPUT_DIR: path.join('output', productDomain),
        OUTPUT_DEBUG_DIR: path.join('output_debug', productDomain),
        ROADMAP_OUTPUT_FILE: 'roadmap_raw.json',
        FORMATTED_ROADMAP_OUTPUT_FILE: 'roadmap.json',
        PAGE_OUTPUT_TEMPLATE: 'roadmap_section_{section}_page_{page}.json',
        SECTION_OUTPUT_TEMPLATE: 'roadmap_section_{section}.json',
    };
}

// --- Helper Functions ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Sanitize a string to be used as part of a filename
function sanitizeForFilename(str) {
    if (!str) return 'unknown';
    
    // First replace spaces with underscores
    let sanitized = str.toLowerCase().replace(/\s+/g, '_');
    
    // Then replace any non-alphanumeric characters (including emojis) with nothing
    sanitized = sanitized.replace(/[^\w\-]/g, '');
    
    // Finally, replace any sequences of multiple underscores with a single underscore
    sanitized = sanitized.replace(/_+/g, '_');
    
    // Remove leading or trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    
    return sanitized || 'unknown';
}

// Get roadmap sections from the organization API
async function fetchRoadmapSections(config) {
    console.log('Fetching roadmap sections from organization data...');
    
    // Extract domain from config BASE_URL for the referer
    const domainMatch = config.BASE_URL.match(/feedback\.([^/]+)/);
    const domain = domainMatch ? domainMatch[1] : 'example.com';
    
    // Add the referer header based on the properly extracted domain
    const headers = {
        ...COMMON_HEADERS,
        'referer': `https://feedback.${domain}/`,
    };
    
    const response = await axios.get(config.ORGANIZATION_URL, { headers });
    
    if (response.status !== 200) {
        throw new Error(`Failed to fetch organization data: HTTP Status ${response.status}`);
    }
    
    if (!response.data) {
        throw new Error('Organization API returned empty response');
    }
    
    // Save organization data for debugging
    await saveToJson(response.data, 'organization_data.json', false, config);
    
    // Check if organization data contains roadmaps
    if (!response.data.roadmaps || response.data.roadmaps.length === 0) {
        throw new Error('No roadmaps found in organization data');
    }
    
    // Get the first roadmap (assuming it's the main one)
    const mainRoadmap = response.data.roadmaps[0];
    console.log(`Found roadmap: ${mainRoadmap.name}`);
    
    if (!mainRoadmap.items || mainRoadmap.items.length === 0) {
        throw new Error('No roadmap items found in the main roadmap');
    }
    
    // Extract sections from roadmap items
    const sections = [];
    
    for (const item of mainRoadmap.items) {
        // Parse the filter to extract the section ID
        // Example filter: "s=67b48e46dc9ba389ef409bd0&sortBy=date%3Adesc&inReview=false"
        const sectionIdMatch = item.filter.match(/s=([^&]+)/);
        const sectionId = sectionIdMatch ? sectionIdMatch[1] : null;
        
        if (sectionId) {
            sections.push({
                id: sectionId,
                name: item.title,
                color: item.color,
                icon: item.icon
            });
            console.log(`Found section: ${item.title} (${sectionId})`);
        }
    }
    
    if (sections.length === 0) {
        throw new Error('No valid sections found in roadmap items');
    }
    
    console.log(`Successfully extracted ${sections.length} roadmap sections`);
    return sections;
}

async function fetchRoadmapSection(sectionId, sectionName, page = 1, config) {
    const url = `${config.SUBMISSION_URL}?s=${sectionId}&sortBy=upvotes%3Adesc&inReview=false&includePinned=true&page=${page}`;
    console.log(`Fetching roadmap section "${sectionName}" page ${page}...`);
    
    try {
        // Extract domain from config BASE_URL for the referer
        const domainMatch = config.BASE_URL.match(/feedback\.([^/]+)/);
        const domain = domainMatch ? domainMatch[1] : 'example.com';
        
        // Add the referer header based on the properly extracted domain
        const headers = {
            ...COMMON_HEADERS,
            'referer': `https://feedback.${domain}/`,
        };
        
        const response = await axios.get(url, { headers });
        if (response.status === 200 && response.data) {
            // Check if the response contains results
            if (!response.data.results || response.data.results.length === 0) {
                console.log(`No data found for roadmap section "${sectionName}" page ${page} (empty results array)`);
                return { 
                    noData: true, 
                    data: response.data,
                    sectionId,
                    sectionName,
                    page
                };
            }
            
            return {
                data: response.data,
                sectionId,
                sectionName,
                page
            };
        } else {
            console.error(`Error fetching roadmap section "${sectionName}" page ${page}: Status ${response.status}`);
            return { 
                error: true, 
                message: `HTTP Status: ${response.status}`,
                sectionId,
                sectionName,
                page
            };
        }
    } catch (error) {
        console.error(`Error fetching roadmap section "${sectionName}" page ${page}:`, error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
        }
        return { 
            error: true, 
            message: error.message,
            responseStatus: error.response ? error.response.status : undefined,
            sectionId,
            sectionName,
            page
        };
    }
}

async function saveToJson(data, filename, isMainOutput = false, config) {
    try {
        // Choose the appropriate directory - output_debug for intermediate files, output for final results
        const targetDir = isMainOutput ? config.OUTPUT_DIR : config.OUTPUT_DEBUG_DIR;
        const outputFilePath = path.join(targetDir, filename);
        
        console.log(`Ensuring directory exists: ${targetDir}`);
        await fs.mkdir(targetDir, { recursive: true }); // Create dir if it doesn't exist

        console.log(`Writing data to ${outputFilePath}...`);
        await fs.writeFile(outputFilePath, JSON.stringify(data, null, 2)); // Pretty print JSON
        console.log(`Successfully wrote data to ${outputFilePath}`);
        return true;
    } catch (error) {
        console.error(`Error writing data to ${filename}:`, error.message);
        return false;
    }
}

// Save a single page of section data
async function saveSectionPage(sectionName, pageNumber, pageData, config) {
    const sanitizedSectionName = sectionName.replace(/\s+/g, '_').toLowerCase();
    const filename = config.PAGE_OUTPUT_TEMPLATE
        .replace('{section}', sanitizedSectionName)
        .replace('{page}', pageNumber);
    
    // Debug files go to output_debug
    return saveToJson(pageData, filename, false, config);
}

async function fetchPostDetails(postId, config) {
    const url = `${config.SUBMISSION_URL}?id=${postId}&includeMergedPosts=true`;
    console.log(`   Fetching details for post ID ${postId}...`);
    try {
        // Extract domain from config BASE_URL for the referer
        const domainMatch = config.BASE_URL.match(/feedback\.([^/]+)/);
        const domain = domainMatch ? domainMatch[1] : 'example.com';
        
        // Add the referer header based on the properly extracted domain
        const headers = {
            ...COMMON_HEADERS,
            'referer': `https://feedback.${domain}/`,
        };
        
        const response = await axios.get(url, { headers });
        if (response.status === 200 && response.data && response.data.results) {
            if (response.data.results.length === 0) {
                console.error(`   No results found for post ID ${postId} (empty results array)`);
                return null;
            }
            return response.data.results[0]; // Assuming the API returns an array with one result
        } else {
            // Log specific error information
            if (response.status !== 200) {
                console.error(`   Error fetching details for post ID ${postId}: HTTP Status ${response.status}`);
            } else if (!response.data) {
                console.error(`   Error fetching details for post ID ${postId}: No data in response`);
            } else if (!response.data.results) {
                console.error(`   Error fetching details for post ID ${postId}: No results field in response`);
            }
            return null;
        }
    } catch (error) {
        console.error(`   Error fetching details for post ID ${postId}:`, error.message);
        if (error.response) {
            console.error(`   Response Status: ${error.response.status}`);
            
            // Log more details about the error response if available
            if (error.response.data) {
                try {
                    console.error(`   Error response data:`, 
                      typeof error.response.data === 'object' 
                        ? JSON.stringify(error.response.data).substring(0, 200) + '...' 
                        : error.response.data.substring(0, 200) + '...');
                } catch (e) {
                    console.error(`   Error response data available but could not be stringified`);
                }
            }
        }
        return null;
    }
}

async function fetchPostComments(postId, config) {
    console.log(`      Fetching comments for post ID ${postId}...`);
    
    let allComments = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    // Fetch all pages of comments
    while (hasMorePages) {
        const url = `${config.COMMENTS_URL}?sortBy=best&submissionId=${postId}&page=${currentPage}`;
        console.log(`      Fetching comments page ${currentPage}...`);
        
        try {
            // Extract domain from config BASE_URL for the referer
            const domainMatch = config.BASE_URL.match(/feedback\.([^/]+)/);
            const domain = domainMatch ? domainMatch[1] : 'example.com';
            
            // Add the referer header based on the properly extracted domain
            const headers = {
                ...COMMON_HEADERS,
                'referer': `https://feedback.${domain}/`,
            };
            
            const response = await axios.get(url, { headers });
            
            if (response.status === 200 && response.data && response.data.results) {
                const pageComments = response.data.results || [];
                console.log(`      Retrieved ${pageComments.length} top-level comments from page ${currentPage}`);
                
                if (pageComments.length > 0) {
                    allComments = allComments.concat(pageComments);
                    currentPage++;
                    
                    // Check if there are more pages
                    // If the API returns a totalPages value, use that instead
                    if (response.data.totalPages) {
                        hasMorePages = currentPage <= response.data.totalPages;
                    } else {
                        // Otherwise, if we get fewer comments than expected, assume we've reached the end
                        hasMorePages = pageComments.length >= 10; // Assuming default page size is 10
                    }
                    
                    // Add a small delay between pages
                    if (hasMorePages) {
                        await delay(COMMENTS_DELAY_MS);
                    }
                } else {
                    // No comments on this page, we're done
                    console.log(`      No comments found on page ${currentPage}, stopping pagination`);
                    hasMorePages = false;
                }
            } else {
                // Log specific error information
                if (response.status !== 200) {
                    console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}): HTTP Status ${response.status}`);
                } else if (!response.data) {
                    console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}): No data in response`);
                } else if (!response.data.results) {
                    console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}): No results field in response`);
                }
                hasMorePages = false;
            }
        } catch (error) {
            console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}):`, error.message);
            if (error.response) {
                console.error(`      Response Status: ${error.response.status}`);
                
                // Log more details about the error response if available
                if (error.response.data) {
                    try {
                        console.error(`      Error response data:`, 
                          typeof error.response.data === 'object' 
                            ? JSON.stringify(error.response.data).substring(0, 200) + '...' 
                            : error.response.data.substring(0, 200) + '...');
                    } catch (e) {
                        console.error(`      Error response data available but could not be stringified`);
                    }
                }
            }
            hasMorePages = false;
        }
    }
    
    // Count total comments including nested replies
    let totalComments = 0;
    const countNestedComments = (comments) => {
        for (const comment of comments) {
            totalComments++;
            if (comment.replies && comment.replies.length > 0) {
                countNestedComments(comment.replies);
            }
        }
    };
    
    countNestedComments(allComments);
    console.log(`      Finished fetching all comment pages. Found ${allComments.length} top-level comments and ${totalComments} total comments (including replies)`);
    
    return allComments;
}

// Format the roadmap item data
function formatRoadmapItem(item, sectionName) {
    if (!item) return null;
    
    // Extract image URLs from content if present
    const imageUrlRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
    const contentStr = item.content || '';
    const imageMatches = [...contentStr.matchAll(imageUrlRegex)];
    
    // Process image URLs to extract the base URL without query parameters
    const imageUrls = imageMatches.map(match => {
        const fullUrl = match[1];
        try {
            // Try to get the URL without query parameters
            const url = new URL(fullUrl);
            return url.origin + url.pathname;
        } catch (e) {
            // If URL parsing fails, just return the original
            return fullUrl;
        }
    });
    
    // Format a single comment (including handling nested replies)
    const formatComment = (comment) => {
        const formattedComment = {
            id: comment.id,
            content: comment.content,
            contentText: comment.content ? comment.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '',
            author: comment.user ? {
                id: comment.user._id,
                name: comment.user.name,
                picture: comment.user.picture,
                type: comment.user.type
            } : null,
            date: comment.createdAt || comment.date,
            upvotes: comment.upvotes || 0,
            replies: []
        };
        
        // Process replies recursively if they exist
        if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
            formattedComment.replies = comment.replies.map(reply => formatComment(reply));
        }
        
        return formattedComment;
    };
    
    // Process all comments
    const comments = item.comments && Array.isArray(item.comments) 
        ? item.comments.map(comment => formatComment(comment)) 
        : [];
    
    return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        content: item.content, // Keep the HTML content
        contentText: item.content ? item.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '', // Plain text version
        submitter: item.user ? {
            id: item.user._id,
            name: item.user.name,
            picture: item.user.picture,
            type: item.user.type
        } : null,
        date: item.date,
        lastModified: item.lastModified,
        status: item.postStatus ? {
            name: item.postStatus.name,
            type: item.postStatus.type
        } : null,
        roadmapSection: sectionName,
        category: item.postCategory ? {
            name: item.postCategory.category,
            icon: item.postCategory.icon
        } : null,
        upvotes: item.upvotes || 0,
        commentCount: item.commentCount || 0,
        comments: comments,
        tags: item.postTags || [],
        images: imageUrls,
        pinned: item.pinned || false
    };
}

// Format all items from a section
function formatRoadmapItems(items, sectionName) {
    return items.map(item => formatRoadmapItem(item, sectionName)).filter(item => item !== null);
}

async function fetchAllRoadmapData(limitPerSection = 0, productDomain = DEFAULT_PRODUCT) {
    console.log(`Starting to fetch roadmap data for ${productDomain}...`);
    console.log(`Limit per section: ${limitPerSection > 0 ? limitPerSection : 'No Limit'}`);
    
    // Get configuration based on product domain
    const config = getConfig(productDomain);
    
    // Ensure output directories exist
    try {
        await fs.mkdir(config.OUTPUT_DIR, { recursive: true });
        await fs.mkdir(config.OUTPUT_DEBUG_DIR, { recursive: true });
    } catch (error) {
        console.error(`Error creating output directories: ${error.message}`);
        throw error;
    }
    
    // Fetch roadmap sections from the API
    const ROADMAP_SECTIONS = await fetchRoadmapSections(config);
    
    const allRoadmapData = {};
    const formattedRoadmapData = {};
    
    // Process each roadmap section
    for (const section of ROADMAP_SECTIONS) {
        console.log(`\nProcessing roadmap section: ${section.name} (${section.id})`);
        
        const sectionData = [];
        let currentPage = 1;
        let hasMorePages = true;
        let totalItemsCollected = 0;
        
        // Fetch pages until we reach the limit or run out of data
        while (hasMorePages && (limitPerSection === 0 || totalItemsCollected < limitPerSection)) {
            const result = await fetchRoadmapSection(section.id, section.name, currentPage, config);
            
            if (result.error) {
                console.error(`Error occurred while fetching section ${section.name}: ${result.message}`);
                hasMorePages = false;
                continue;
            }
            
            if (result.noData) {
                console.log(`No data found for section ${section.name}. Moving to next section.`);
                hasMorePages = false;
                continue;
            }
            
            if (result.data && result.data.results && result.data.results.length > 0) {
                console.log(`Retrieved ${result.data.results.length} items from page ${currentPage}`);
                
                // Save raw page data to a separate file
                await saveSectionPage(section.name, currentPage, result.data, config);
                
                // Add to our collection, respecting the limit
                const remainingToCollect = limitPerSection > 0 
                    ? limitPerSection - totalItemsCollected 
                    : result.data.results.length;
                
                const itemsToAdd = limitPerSection > 0 
                    ? result.data.results.slice(0, remainingToCollect) 
                    : result.data.results;
                
                // Fetch detailed info and comments for each item
                for (let i = 0; i < itemsToAdd.length; i++) {
                    const item = itemsToAdd[i];
                    if (item.id) {
                        // Fetch detailed post information
                        const detailedItem = await fetchPostDetails(item.id, config);
                        
                        if (detailedItem) {
                            // If item has comments, fetch them
                            if (detailedItem.commentCount > 0) {
                                console.log(`   Item has ${detailedItem.commentCount} comments. Fetching comment details...`);
                                const comments = await fetchPostComments(detailedItem.id, config);
                                detailedItem.comments = comments;
                                await delay(COMMENTS_DELAY_MS); // Be polite to the server
                            } else {
                                detailedItem.comments = [];
                            }
                            
                            // Replace the summary item with the detailed one
                            itemsToAdd[i] = detailedItem;
                        }
                        
                        await delay(DETAIL_DELAY_MS); // Be polite to the server
                    }
                }
                
                sectionData.push(...itemsToAdd);
                totalItemsCollected += itemsToAdd.length;
                
                // Check if we've reached the limit
                if (limitPerSection > 0 && totalItemsCollected >= limitPerSection) {
                    console.log(`Reached item limit (${limitPerSection}) for section ${section.name}`);
                    break;
                }
                
                // Check if we need to fetch more pages
                if (result.data.totalPages && currentPage < result.data.totalPages) {
                    currentPage++;
                    await delay(PAGE_DELAY_MS);
                } else {
                    hasMorePages = false;
                }
            } else {
                console.error(`Unexpected result format for section ${section.name}. Missing data or results array.`);
                hasMorePages = false;
            }
        }
        
        console.log(`Completed fetching section: ${section.name}. Found ${sectionData.length} total items.\n`);
        
        // Store raw data
        allRoadmapData[section.name] = sectionData;
        
        // Store formatted data
        formattedRoadmapData[section.name] = formatRoadmapItems(sectionData, section.name);
    }
    
    // Save raw data to debug directory
    await saveToJson(allRoadmapData, config.ROADMAP_OUTPUT_FILE, false, config);
    
    // Save formatted data to main output directory
    await saveToJson(formattedRoadmapData, config.FORMATTED_ROADMAP_OUTPUT_FILE, true, config);
    
    // Save each section to a separate file
    console.log('\nSaving individual roadmap sections to separate files...');
    for (const [sectionName, sectionData] of Object.entries(formattedRoadmapData)) {
        const sanitizedSectionName = sanitizeForFilename(sectionName);
        const sectionFileName = config.SECTION_OUTPUT_TEMPLATE.replace('{section}', sanitizedSectionName);
        console.log(`Saving section '${sectionName}' with ${sectionData.length} items to ${sectionFileName}...`);
        await saveToJson(sectionData, sectionFileName, true, config);
    }
    
    console.log('\nCompleted fetching and saving all roadmap data!');
    console.log(`Raw roadmap data saved to: ${path.join(config.OUTPUT_DEBUG_DIR, config.ROADMAP_OUTPUT_FILE)}`);
    console.log(`Formatted roadmap data saved to: ${path.join(config.OUTPUT_DIR, config.FORMATTED_ROADMAP_OUTPUT_FILE)}`);
    console.log(`Individual section files (roadmap_section_*.json) saved to the ${config.OUTPUT_DIR} directory.`);
    console.log(`Section pages saved to the ${config.OUTPUT_DEBUG_DIR} directory.`);
    
    // Return the final formatted data
    return formattedRoadmapData;
}

// Export the main function for use in other modules
module.exports = {
    fetchAllRoadmapData
};

// Only run the test when this file is executed directly
if (require.main === module) {
    (async () => {
        try {
            // Use base44 as our default test domain
            const productArg = process.argv[2] || 'base44'; 
            const limitArg = process.argv[3] ? parseInt(process.argv[3], 10) : 2;
            
            console.log(`Running roadmap scraper test for ${productArg} with limit of ${limitArg} items per section...`);
            await fetchAllRoadmapData(limitArg, productArg);
            console.log('Test completed successfully!');
        } catch (error) {
            console.error('TEST FAILED WITH ERROR:', error.message);
            // Print stack trace for better debugging
            console.error(error.stack);
            process.exit(1); // Exit with error code
        }
    })();
}