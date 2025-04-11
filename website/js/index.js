// Global state
let currentProduct = null;
let currentTab = 'feedback';

// Data storage for dynamically loaded feedback and roadmap data
const feedbackDataStore = {};
const roadmapDataStore = {};

// DOM Elements
const mainContent = document.getElementById('main-content');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Capture any loaded feedback data that might be in window.feedbackData
    if (window.feedbackData) {
        console.log("Capturing initial feedback data from global scope");
        // Store in a safe place in case it gets overwritten
        if (productIndex && productIndex.products) {
            productIndex.products.forEach(product => {
                feedbackDataStore[product.id] = [...window.feedbackData];
            });
        }
    }

    // Check if a product is specified in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('product');
    
    if (productId) {
        loadProduct(productId);
    } else {
        loadProductList();
    }
});

// Load the list of available products
function loadProductList() {
    try {
        mainContent.innerHTML = '<div class="loading">Loading products...</div>';
        
        // Use the productIndex variable defined in the HTML
        const data = productIndex;
        
        // Display the products
        let html = `
            <div class="product-header">
                <div class="container">
                    <div class="product-header-content">
                        <h1 class="product-header-title">Feedback & Roadmap</h1>
                    </div>
                </div>
            </div>
            
            <div class="container">
                <div class="product-select-info">Select a product to view its feedback and roadmap</div>
                <div class="product-grid">
        `;
        
        data.products.forEach(product => {
            html += `
                <div class="product-card" onclick="loadProduct('${product.id}')">
                    <img src="${product.logo}" alt="${product.name} logo" class="product-logo" onerror="this.src='https://via.placeholder.com/100?text=${product.name.charAt(0)}'">
                    <h2 class="product-name">${product.name}</h2>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        mainContent.innerHTML = html;
        
    } catch (error) {
        mainContent.innerHTML = `
            <div class="container">
                <div class="error">
                    <h2>Error loading products</h2>
                    <p>${error.message}</p>
                </div>
            </div>
        `;
        console.error('Error loading products:', error);
    }
}

// Load a specific product
function loadProduct(productId) {
    try {
        // Update URL without reloading the page
        const url = new URL(window.location);
        url.searchParams.set('product', productId);
        window.history.pushState({}, '', url);
        
        mainContent.innerHTML = '<div class="loading">Loading product data...</div>';
        
        // Find the product from the product index
        const product = productIndex.products.find(p => p.id === productId);
        
        if (!product) {
            throw new Error(`Product "${productId}" not found`);
        }
        
        currentProduct = product;
        
        // Dynamically load the product's data files if not already loaded
        loadProductData(productId);
        
        // Display the product header and tabs
        const headerHtml = `
            <div class="product-header">
                <div class="container">
                    <div class="back-nav">
                        <span class="back-text" onclick="loadProductList()">All Products</span>
                    </div>
                    <div class="product-header-content">
                        <img src="${product.logo}" alt="${product.name} logo" class="product-header-logo" onerror="this.src='https://via.placeholder.com/50?text=${product.name.charAt(0)}'">
                        <h1 class="product-header-title">${product.name}</h1>
                    </div>
                    <div class="tabs">
                        <div class="tab ${currentTab === 'feedback' ? 'active' : ''}" 
                             onclick="switchTab('feedback')">Feedback</div>
                        <div class="tab ${currentTab === 'roadmap' ? 'active' : ''}" 
                             onclick="switchTab('roadmap')">Roadmap</div>
                    </div>
                </div>
            </div>
        `;
        
        // Initialize content area
        const contentHtml = `
            <div class="container">
                <div id="tab-content">
                    <div class="loading">Loading ${currentTab} data...</div>
                </div>
            </div>
        `;
        
        mainContent.innerHTML = headerHtml + contentHtml;
        
        // Load the current tab content
        loadTabContent();
        
    } catch (error) {
        mainContent.innerHTML = `
            <div class="container">
                <div class="error">
                    <h2>Error loading product</h2>
                    <p>${error.message}</p>
                    <button onclick="loadProductList()">Back to Products</button>
                </div>
            </div>
        `;
        console.error('Error loading product:', error);
    }
}

// Dynamically load product data files
function loadProductData(productId) {
    // Clear any previously loaded global data
    window.feedbackData = null;
    window.roadmapData = null;
    window.organizationData = null;
    
    // Check if we already have the data cached
    if (feedbackDataStore[productId] && roadmapDataStore[productId]) {
        console.log(`Using cached data for ${productId}`);
        return;
    }
    
    console.log(`Loading data files for ${productId}...`);
    
    // Define the data files to load
    const dataFiles = [
        `data/${productId}/feedback_data.js`,
        `data/${productId}/roadmap_data.js`,
        `data/${productId}/organization_data.js`
    ];
    
    // Function to load a script dynamically
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`Loaded ${src}`);
                resolve();
            };
            script.onerror = () => {
                console.warn(`Failed to load ${src}`);
                resolve(); // We resolve anyway to continue with other files
            };
            document.head.appendChild(script);
        });
    };
    
    // Load all data files sequentially
    Promise.all(dataFiles.map(file => loadScript(file)))
        .then(() => {
            // Store the loaded data
            if (window.feedbackData) {
                feedbackDataStore[productId] = [...window.feedbackData];
                console.log(`Stored ${window.feedbackData.length} feedback items for ${productId}`);
            }
            
            if (window.roadmapData) {
                roadmapDataStore[productId] = window.roadmapData;
                console.log(`Stored roadmap data for ${productId}`);
            }
            
            if (window.organizationData && currentProduct) {
                currentProduct.orgData = window.organizationData;
                console.log(`Stored organization data for ${productId}`);
            }
            
            // Refresh the current tab content
            loadTabContent();
        });
}

// Switch between feedback and roadmap tabs
function switchTab(tab) {
    if (tab === currentTab) return;
    
    currentTab = tab;
    
    // Update active tab
    document.querySelectorAll('.tab').forEach(tabEl => {
        if (tabEl.textContent.toLowerCase() === tab) {
            tabEl.classList.add('active');
        } else {
            tabEl.classList.remove('active');
        }
    });
    
    // Load the tab content
    loadTabContent();
}

// Load content for the current tab
function loadTabContent() {
    const tabContent = document.getElementById('tab-content');
    
    if (!currentProduct) {
        tabContent.innerHTML = '<div class="error">No product selected</div>';
        return;
    }
    
    tabContent.innerHTML = `<div class="loading">Loading ${currentTab} data...</div>`;
    
    try {
        if (currentTab === 'feedback') {
            loadFeedbackContent();
        } else if (currentTab === 'roadmap') {
            loadRoadmapContent();
        }
    } catch (error) {
        tabContent.innerHTML = `
            <div class="error">
                <h2>Error loading ${currentTab} data</h2>
                <p>${error.message}</p>
            </div>
        `;
        console.error(`Error loading ${currentTab} data:`, error);
    }
}

// Load feedback content
function loadFeedbackContent() {
    const tabContent = document.getElementById('tab-content');
    const productId = currentProduct.id;
    
    try {
        // Try to get data from either the feedbackDataStore or from window.feedbackData
        let feedbackItems = feedbackDataStore[productId] || window.feedbackData;
        
        // If we still don't have data, show a loading message and return
        if (!feedbackItems) {
            tabContent.innerHTML = `
                <div class="loading">
                    <p>Loading feedback data for ${currentProduct.name}...</p>
                    <p>If you continue to see this message, make sure the data file exists at data/${productId}/feedback_data.js</p>
                </div>
            `;
            return;
        }
        
        console.log(`Displaying ${feedbackItems.length} feedback items for ${productId}`);
        
        // Extract unique categories and statuses for filters
        const categories = [...new Set(feedbackItems.map(item => item.category?.name).filter(Boolean))];
        const statuses = [...new Set(feedbackItems.map(item => item.status?.name).filter(Boolean))];
        
        // Create filter and sort UI
        let html = `
            <div class="filter-search">
                <input type="text" id="search-filter" placeholder="Search feedback..." onkeyup="applyFeedbackFilters()">
            </div>
            
            <div class="feedback-filters">
                <div class="filter-group">
                    <label>Filter by:</label>
                    <select id="category-filter" onchange="applyFeedbackFilters()">
                        <option value="">All Categories</option>
                        ${categories.map(category => `<option value="${category}">${category}</option>`).join('')}
                    </select>
                    
                    <select id="status-filter" onchange="applyFeedbackFilters()">
                        <option value="">All Statuses</option>
                        ${statuses.map(status => `<option value="${status}">${status}</option>`).join('')}
                    </select>
                </div>
                
                <div class="sort-group">
                    <label>Sort by:</label>
                    <select id="sort-by" onchange="applyFeedbackFilters()">
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="upvotes">Most Upvotes</option>
                        <option value="comments">Most Comments</option>
                    </select>
                </div>
            </div>
            
            <div class="feedback-results">
                <div id="feedback-count"></div>
                <button id="clear-filters" class="btn-clear-filters" onclick="clearFeedbackFilters()">Clear Filters</button>
            </div>
            
            <div id="feedback-list" class="feedback-list">
        `;
        
        if (feedbackItems.length === 0) {
            html += '<p style="text-align:center">No feedback items found.</p>';
        } else {
            // Store the feedback items in a global variable for filtering
            window.allFeedbackItems = [...feedbackItems];
            
            // Display all items initially
            feedbackItems.forEach(item => {
                html += createFeedbackItemHtml(item);
            });
        }
        
        html += '</div>';
        tabContent.innerHTML = html;
        
        // Update feedback count
        updateFeedbackCount(feedbackItems.length);
        
    } catch (error) {
        tabContent.innerHTML = `
            <div class="error">
                <h2>Error loading feedback data</h2>
                <p>${error.message}</p>
            </div>
        `;
        console.error('Error loading feedback data:', error);
    }
}

// Function to update the feedback count display
function updateFeedbackCount(count) {
    const countElement = document.getElementById('feedback-count');
    if (countElement) {
        countElement.textContent = `Showing ${count} ${count === 1 ? 'item' : 'items'}`;
    }
}

// Function to apply filters and sorting to feedback items
function applyFeedbackFilters() {
    const searchQuery = document.getElementById('search-filter').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const sortBy = document.getElementById('sort-by').value;
    const feedbackList = document.getElementById('feedback-list');
    
    // Get all feedback items
    let filteredItems = [...window.allFeedbackItems];
    
    // Apply search filter
    if (searchQuery) {
        filteredItems = filteredItems.filter(item => 
            (item.title && item.title.toLowerCase().includes(searchQuery)) || 
            (item.contentText && item.contentText.toLowerCase().includes(searchQuery))
        );
    }
    
    // Apply category filter
    if (categoryFilter) {
        filteredItems = filteredItems.filter(item => item.category && item.category.name === categoryFilter);
    }
    
    // Apply status filter
    if (statusFilter) {
        filteredItems = filteredItems.filter(item => item.status && item.status.name === statusFilter);
    }
    
    // Apply sorting
    switch (sortBy) {
        case 'newest':
            filteredItems.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
        case 'oldest':
            filteredItems.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
        case 'upvotes':
            filteredItems.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
            break;
        case 'comments':
            filteredItems.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
            break;
    }
    
    // Update the UI
    if (filteredItems.length === 0) {
        feedbackList.innerHTML = '<p style="text-align:center">No matching feedback items found.</p>';
    } else {
        feedbackList.innerHTML = '';
        filteredItems.forEach(item => {
            feedbackList.innerHTML += createFeedbackItemHtml(item);
        });
    }
    
    // Update feedback count
    updateFeedbackCount(filteredItems.length);
    
    console.log(`Filtered to ${filteredItems.length} items`);
}

// Function to clear all feedback filters
function clearFeedbackFilters() {
    document.getElementById('search-filter').value = '';
    document.getElementById('category-filter').value = '';
    document.getElementById('status-filter').value = '';
    document.getElementById('sort-by').value = 'newest';
    
    applyFeedbackFilters();
}

// Load roadmap content
function loadRoadmapContent() {
    const tabContent = document.getElementById('tab-content');
    const productId = currentProduct.id;
    
    try {
        // Try to get data from either the roadmapDataStore or from window.roadmapData
        const roadmapData = roadmapDataStore[productId] || window.roadmapData;
        
        // If we still don't have data, show a loading message and return
        if (!roadmapData) {
            tabContent.innerHTML = `
                <div class="loading">
                    <p>Loading roadmap data for ${currentProduct.name}...</p>
                    <p>If you continue to see this message, make sure the data file exists at data/${productId}/roadmap_data.js</p>
                </div>
            `;
            return;
        }
        
        // Get all sections from the roadmap data
        const sections = Object.keys(roadmapData);
        
        if (sections.length === 0) {
            tabContent.innerHTML = '<p style="text-align:center">No roadmap data found.</p>';
            return;
        }
        
        // Set default active section (first one)
        let activeSection = 0;
        
        // Create roadmap navigation bar with tabs
        let html = `
            <div class="roadmap-tabs">
                ${sections.map((section, index) => {
                    const itemCount = roadmapData[section] ? roadmapData[section].length : 0;
                    return `
                        <div class="roadmap-tab ${index === activeSection ? 'active' : ''}" 
                             data-section="${index}">
                            ${section}
                            <span class="roadmap-tab-count">${itemCount}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // Add container for the roadmap content with only the active section visible
        html += '<div class="roadmap-container">';
        
        sections.forEach((section, index) => {
            const items = roadmapData[section] || [];
            
            html += `
                <div class="roadmap-section ${index === activeSection ? 'active' : ''}" data-section="${index}">
                    <div class="roadmap-section-header">
                        <h2 class="section-title">${section}</h2>
                        <span class="roadmap-item-count">${items.length} items</span>
                    </div>
                    <div class="roadmap-list">
            `;
            
            if (items.length === 0) {
                html += '<p class="roadmap-empty-message">No items in this section</p>';
            } else {
                items.forEach(item => {
                    html += createRoadmapItemHtml(item);
                });
            }
            
            html += `
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        tabContent.innerHTML = html;
        
        // Add click functionality to the tab navigation
        document.querySelectorAll('.roadmap-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const sectionIndex = parseInt(this.getAttribute('data-section'));
                
                // Update active tab
                document.querySelectorAll('.roadmap-tab').forEach(t => {
                    t.classList.remove('active');
                });
                this.classList.add('active');
                
                // Show selected section, hide others
                document.querySelectorAll('.roadmap-section').forEach(section => {
                    const index = parseInt(section.getAttribute('data-section'));
                    if (index === sectionIndex) {
                        section.classList.add('active');
                    } else {
                        section.classList.remove('active');
                    }
                });
            });
        });
        
        console.log(`Displayed roadmap with ${sections.length} sections for ${productId}`);
        
    } catch (error) {
        tabContent.innerHTML = `
            <div class="error">
                <h2>Error loading roadmap data</h2>
                <p>${error.message}</p>
            </div>
        `;
        console.error('Error loading roadmap data:', error);
    }
}

// Create HTML for a roadmap item
function createRoadmapItemHtml(item) {
    // Format date
    const date = new Date(item.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Get category information
    const categoryName = item.category ? item.category.name : '';
    const categoryIcon = item.category && item.category.icon ? item.category.icon.value : '';
    
    // Get comments count
    const commentCount = item.commentCount || 0;
    
    // Get upvotes
    const upvotes = item.upvotes || 0;
    
    // Get content, maintaining HTML if present
    const content = item.contentText || item.content || '';
    
    return `
        <div class="roadmap-item">
            <div class="roadmap-item-header">
                <h3 class="roadmap-item-title">${item.title}</h3>
                ${item.category ? 
                    `<span class="roadmap-item-category" data-category="${item.category.name}">
                        ${categoryIcon} ${categoryName}
                    </span>` : 
                    ''
                }
            </div>
            
            <div class="roadmap-item-meta">
                ${item.submitter ? `
                    <div class="roadmap-item-submitter">
                        <img src="${item.submitter.picture}" alt="${item.submitter.name}" class="submitter-img" onerror="this.src='https://via.placeholder.com/24?text=${item.submitter.name.charAt(0)}'">
                        <span>${item.submitter.name}</span>
                    </div>
                ` : ''}
                
                <div class="roadmap-item-date">${formattedDate}</div>
                
                ${item.status ? `
                    <div class="roadmap-item-status" data-status="${item.status.type}">
                        ${item.status.name}
                    </div>
                ` : ''}
            </div>
            
            ${content ? `
                <div class="roadmap-item-content">${content}</div>
            ` : ''}
            
            <div class="roadmap-item-stats">
                <div class="roadmap-item-upvotes">
                    <i>👍</i> ${upvotes} upvotes
                </div>
                
                <div class="roadmap-item-comments">
                    <i>💬</i> ${commentCount} comments
                </div>
            </div>
            
            <!-- Comments Section -->
            <div class="roadmap-comments-section">
                <h3 class="comments-heading">Comments (${commentCount})</h3>
                
                ${item.comments && item.comments.length > 0 ? `
                    <div class="comments-list">
                        ${item.comments.map(comment => createCommentHtml(comment)).join('')}
                    </div>
                ` : `
                    <div class="no-comments">
                        <p>No comments yet</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

// Create HTML for a feedback item
function createFeedbackItemHtml(item) {
    // Format date
    const date = new Date(item.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Get category information
    const categoryName = item.category ? item.category.name : '';
    const categoryIcon = item.category && item.category.icon ? item.category.icon.value : '';
    
    // Get content, maintaining HTML if present
    const content = item.contentText || item.content || '';
    
    return `
        <div class="feedback-item">
            <div class="feedback-header">
                <h2 class="feedback-title">${item.title}</h2>
            </div>
            
            <div class="feedback-meta">
                ${item.submitter ? `
                    <div class="feedback-submitter">
                        <img src="${item.submitter.picture}" alt="${item.submitter.name}" class="submitter-img" onerror="this.src='https://via.placeholder.com/24?text=${item.submitter.name.charAt(0)}'">
                        <span>${item.submitter.name}</span>
                    </div>
                ` : ''}
                
                <div class="feedback-date">${formattedDate}</div>
                
                ${item.category ? `
                    <div class="feedback-category">${categoryIcon} ${categoryName}</div>
                ` : ''}
            </div>
            
            ${content ? `
                <div class="feedback-content">${content}</div>
            ` : ''}
            
            <div class="feedback-stats">
                <div class="feedback-upvotes">
                    <i>👍</i> ${item.upvotes} upvotes
                </div>
                
                <div class="feedback-comments">
                    <i>💬</i> ${item.commentCount} comments
                </div>
            </div>
            
            <!-- Comments Section -->
            <div class="feedback-comments-section">
                <h3 class="comments-heading">Comments (${item.commentCount})</h3>
                
                ${item.comments && item.comments.length > 0 ? `
                    <div class="comments-list">
                        ${item.comments.map(comment => createCommentHtml(comment)).join('')}
                    </div>
                ` : `
                    <div class="no-comments">
                        <p>No comments yet</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

// Create HTML for a comment
function createCommentHtml(comment) {
    // Format date
    const date = new Date(comment.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Get content, maintaining HTML if present
    let content = comment.contentText || comment.content || '';
    
    // Process content to ensure proper handling of image data attributes
    // The content is already expected to be HTML, so we don't need to sanitize it here
    // In a production app, you would want to sanitize any user-generated HTML
    
    return `
        <div class="comment-item">
            <div class="comment-header">
                ${comment.author ? `
                    <div class="comment-author">
                        <img src="${comment.author.picture}" alt="${comment.author.name}" class="author-img" onerror="this.src='https://via.placeholder.com/24?text=${comment.author.name.charAt(0)}'">
                        <span>${comment.author.name}</span>
                    </div>
                ` : ''}
                
                <div class="comment-date">${formattedDate}</div>
            </div>
            
            <div class="comment-content">
                ${content}
            </div>
        </div>
    `;
} 