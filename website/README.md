# Featurebase Feedback Viewer

A static website for viewing feedback and roadmap data from Featurebase portals.

## Setup Instructions

1. Place your scraped data in the appropriate folders:
   ```
   website/data/
   ├── index.json             # List of available products
   ├── lovable.dev/           # Folder for lovable.dev data
   │   ├── feedback.json      # Feedback posts data
   │   └── roadmap.json       # Roadmap data
   └── base44/                # Folder for base44 data
       ├── feedback.json      # Feedback posts data
       └── roadmap.json       # Roadmap data
   ```

2. Ensure that your `index.json` contains entries for each product:
   ```json
   {
     "products": [
       {
         "id": "lovable.dev",
         "name": "Lovable.dev",
         "description": "Lovable.dev Feedback Portal",
         "logo": "URL to logo"
       },
       {
         "id": "base44",
         "name": "Base44",
         "description": "Base44 Feedback Portal",
         "logo": "URL to logo"
       }
     ]
   }
   ```

3. Open `index.html` in a web browser or serve the entire `website` folder using a local web server.

## Features

- Browse multiple products' feedback data
- View detailed feedback posts with:
  - Title
  - Status
  - Submitter information
  - Submission date
  - Category
  - Vote counts
  - Comment counts
- Simple, responsive UI design

## Local Development Server

For the best experience, serve this website using a local web server to avoid CORS issues. You can use tools like:

- Python's built-in server: `python -m http.server`
- Node.js live-server: `npx live-server`
- VS Code's Live Server extension

## Future Improvements

- Roadmap visualization
- Sorting and filtering options
- Search functionality
- Detailed comment view
- Pagination for large datasets 