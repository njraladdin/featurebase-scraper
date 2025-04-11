const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// --- Default Configuration ---
const DEFAULT_PRODUCT = 'lovable.dev';
const PAGE_DELAY_MS = 300; // Delay between fetching pages (milliseconds)
const DETAIL_DELAY_MS = 150; // Delay between fetching post details (milliseconds)
const COMMENTS_DELAY_MS = 100; // Delay between fetching comments (milliseconds)
const DEFAULT_LIMIT_POSTS = 0; // Set to 0 for no limit, or any positive number to limit total posts processed

// Headers based on your cURL examples (simplified for clarity)
const COMMON_HEADERS = {
    'accept': 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'dnt': '1',
};

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

// Build URLs and filenames based on product domain
function getConfig(productDomain = DEFAULT_PRODUCT) {
    // Ensure productDomain has a valid TLD
    let domain = productDomain;
    
    // If the domain doesn't have a dot, assume it's missing a TLD and add .com
    if (!domain.includes('.')) {
        domain = `${domain}.com`;
    }
    
    return {
        BASE_URL: `https://feedback.${domain}/api/v1/submission`,
        COMMENTS_URL: `https://feedback.${domain}/api/v1/comment`,
        OUTPUT_DIR: path.join('output', productDomain),
        OUTPUT_DEBUG_DIR: path.join('output_debug', productDomain),
        OUTPUT_FILE: 'feedback_raw.json',
        PAGE_OUTPUT_TEMPLATE: 'feedback_page_{page}.json',
        FORMATTED_PAGE_OUTPUT_TEMPLATE: 'feedback_page_{page}_formatted.json',
        FORMATTED_OUTPUT_FILE: 'feedback.json',
        CATEGORY_OUTPUT_TEMPLATE: 'feedback_category_{category}.json',
    };
}

async function fetchPage(pageNumber, config) {
    const url = `${config.BASE_URL}?sortBy=date%3Adesc&inReview=false&includePinned=true&page=${pageNumber}`;
    console.log(`Fetching page ${pageNumber}...`);
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
            return response.data; // { results: [], page, limit, totalPages, totalResults }
        } else {
            console.error(`Error fetching page ${pageNumber}: Status ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching page ${pageNumber}:`, error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
        }
        return null;
    }
}

async function fetchPostDetails(postId, config) {
    const url = `${config.BASE_URL}?id=${postId}&includeMergedPosts=true`;
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
        if (response.status === 200 && response.data && response.data.results && response.data.results.length > 0) {
            return response.data.results[0]; // Assuming the API returns an array with one result
        } else {
            console.error(`   Error fetching details for post ID ${postId}: Status ${response.status} or no results`);
            return null;
        }
    } catch (error) {
        console.error(`   Error fetching details for post ID ${postId}:`, error.message);
        if (error.response) {
            console.error('   Response Status:', error.response.status);
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
                    hasMorePages = false;
                }
            } else {
                console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}): Status ${response.status} or no results`);
                hasMorePages = false;
            }
        } catch (error) {
            console.error(`      Error fetching comments for post ID ${postId} (page ${currentPage}):`, error.message);
            if (error.response) {
                console.error('      Response Status:', error.response.status);
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

// Format post data to extract only the fields we're interested in
function formatPostData(post) {
    if (!post) return null;
    
    // Extract image URLs from content if present
    const imageUrlRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
    const contentStr = post.content || '';
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
    const comments = post.comments && Array.isArray(post.comments) 
        ? post.comments.map(comment => formatComment(comment)) 
        : [];
    
    return {
        id: post.id,
        slug: post.slug,
        title: post.title,
        content: post.content, // Keep the HTML content as is
        contentText: post.content ? post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '', // Plain text version
        submitter: post.user ? {
            id: post.user._id,
            name: post.user.name,
            picture: post.user.picture,
            type: post.user.type
        } : null,
        date: post.date,
        lastModified: post.lastModified,
        status: post.postStatus ? {
            name: post.postStatus.name,
            type: post.postStatus.type
        } : null,
        category: post.postCategory ? {
            name: post.postCategory.category,
            icon: post.postCategory.icon
        } : null,
        upvotes: post.upvotes || 0,
        commentCount: post.commentCount || 0,
        comments: comments,
        tags: post.postTags || [],
        images: imageUrls,
        pinned: post.pinned || false
    };
}

// Format an array of posts
function formatPosts(posts) {
    return posts.map(formatPostData).filter(post => post !== null);
}

// --- Main Execution ---
async function fetchAllPosts(productDomain = DEFAULT_PRODUCT, limit = DEFAULT_LIMIT_POSTS) {
    console.log(`Starting fetch process for ${productDomain}...`);
    
    // Get configuration based on product domain
    const config = getConfig(productDomain);
    
    let allDetailedPosts = [];
    let allFormattedPosts = [];
    let currentPage = 1;
    let totalPages = 1; // Initialize to 1, will be updated by the first response
    
    // Log limit status
    if (limit > 0) {
        console.log(`Post limit configured: Will stop after processing ${limit} posts`);
    } else {
        console.log("No post limit configured: Will process all available posts");
    }

    // Ensure output directories exist
    try {
        await fs.mkdir(config.OUTPUT_DIR, { recursive: true });
        await fs.mkdir(config.OUTPUT_DEBUG_DIR, { recursive: true });
    } catch (error) {
        console.error(`Error creating output directories: ${error.message}`);
        return;
    }

    // Process each page and fetch details before moving to next page
    do {
        console.log(`\n--- Processing Page ${currentPage} ---`);
        const pageData = await fetchPage(currentPage, config);

        if (!pageData) {
            console.error(`Failed to fetch page ${currentPage}. Stopping.`);
            break; // Exit loop on failure
        }

        // Update total pages from the response
        if (pageData.totalPages) {
            totalPages = pageData.totalPages;
            console.log(`Total pages detected: ${totalPages}`);
        }

        // Process posts if available
        const pagePosts = [];
        if (pageData.results && Array.isArray(pageData.results)) {
            console.log(`Found ${pageData.results.length} posts on page ${currentPage}. Fetching details...`);
            
            // Fetch details for each post on this page
            for (const summary of pageData.results) {
                if (summary && summary.id) {
                    const details = await fetchPostDetails(summary.id, config);
                    if (details) {
                        // If post has comments, fetch them
                        if (details.commentCount > 0) {
                            console.log(`   Post has ${details.commentCount} comments. Fetching comment details...`);
                            const comments = await fetchPostComments(details.id, config);
                            details.comments = comments;
                            await delay(COMMENTS_DELAY_MS); // Be polite to the server
                        } else {
                            details.comments = [];
                        }
                        
                        pagePosts.push(details);
                        allDetailedPosts.push(details);
                        
                        // Check if we've hit the post limit
                        if (limit > 0 && allDetailedPosts.length >= limit) {
                            console.log(`\nReached the configured limit of ${limit} posts. Stopping.`);
                            break;
                        }
                    } else {
                        console.warn(`   Skipping post ID ${summary.id} due to fetch error.`);
                    }
                    await delay(DETAIL_DELAY_MS); // Be polite to the server
                } else {
                    console.warn("   Found a summary without an ID, skipping detail fetch.");
                }
            }
            
            console.log(`Processed ${pagePosts.length} posts from page ${currentPage}`);
            
            // Format the post data
            const formattedPagePosts = formatPosts(pagePosts);
            allFormattedPosts = allFormattedPosts.concat(formattedPagePosts);
            
            // Save raw data for this page to debug directory
            const pageFilename = config.PAGE_OUTPUT_TEMPLATE.replace('{page}', currentPage);
            await saveToJson(pagePosts, pageFilename, false, config);
            
            // Save formatted data for this page to debug directory
            const formattedPageFilename = config.FORMATTED_PAGE_OUTPUT_TEMPLATE.replace('{page}', currentPage);
            await saveToJson(formattedPagePosts, formattedPageFilename, false, config);
            
            // Update the main files - raw data goes to debug, formatted to main output
            await saveToJson(allDetailedPosts, config.OUTPUT_FILE, false, config);
            await saveToJson(allFormattedPosts, config.FORMATTED_OUTPUT_FILE, true, config);
            
            // Check again if we've hit the limit after processing this page
            if (limit > 0 && allDetailedPosts.length >= limit) {
                break;
            }
        } else {
            console.warn(`No results found on page ${currentPage}.`);
        }

        if (currentPage >= totalPages) {
            console.log(`Reached the last page (${currentPage} of ${totalPages}). Finishing.`);
            break; // Exit loop if we've reached the last page
        }

        currentPage++;
        console.log(`Waiting before fetching next page...`);
        await delay(PAGE_DELAY_MS); // Be polite to the server

    } while (true); // Loop condition managed inside

    // Group posts by category
    const groupedByCategory = {};

    console.log("\nGrouping posts by category...");
    for (const post of allFormattedPosts) {
        // Group by category
        if (post.category && post.category.name) {
            const categoryName = sanitizeForFilename(post.category.name);
            if (!groupedByCategory[categoryName]) {
                groupedByCategory[categoryName] = [];
            }
            groupedByCategory[categoryName].push(post);
        }
    }

    // Save each category to a separate file
    console.log("\nSaving posts by category...");
    for (const [category, posts] of Object.entries(groupedByCategory)) {
        const categoryFilename = config.CATEGORY_OUTPUT_TEMPLATE.replace('{category}', category);
        console.log(`Saving ${posts.length} posts in category '${category}'...`);
        await saveToJson(posts, categoryFilename, true, config);
    }

    console.log(`\nProcess complete. Total detailed posts fetched: ${allDetailedPosts.length}`);
    console.log(`All raw data has been saved to ${path.join(config.OUTPUT_DEBUG_DIR, config.OUTPUT_FILE)}`);
    console.log(`All formatted data has been saved to ${path.join(config.OUTPUT_DIR, config.FORMATTED_OUTPUT_FILE)}`);
    console.log(`Individual page files have also been saved in the ${config.OUTPUT_DEBUG_DIR} directory.`);
    console.log(`Category-specific files (feedback_category_*.json) have been saved to the ${config.OUTPUT_DIR} directory.`);
    console.log("\nScript finished.");
    
    return allFormattedPosts;
}

// Run the main function
if (require.main === module) {
    // Check if a product domain was passed as an argument
    const productArg = process.argv[2] || DEFAULT_PRODUCT;
    // Check if a limit was passed as an argument
    const limitArg = process.argv[3] ? parseInt(process.argv[3], 10) : DEFAULT_LIMIT_POSTS;
    
    console.log(`Running feedback scraper for ${productArg} with post limit of ${limitArg === 0 ? 'No Limit' : limitArg}...`);
    fetchAllPosts(productArg, limitArg);
}

// Export the main function for use in other modules
module.exports = {
    fetchAllPosts
};