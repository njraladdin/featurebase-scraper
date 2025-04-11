# Featurebase Scraper

A Node.js tool that scrapes data from Featurebase-hosted products (feedback.[product].com) and collects:
- Feedback posts
- Roadmap items

## Installation

```bash
# Clone repository
git clone [repository-url]
cd featurebase-scraper

# Install dependencies
npm install
```

## Usage

### Basic Usage

Run the scraper with default options:

```bash
node main.js [product-domain]
```

For example:
```bash
node main.js civitai.com
```
This will scrape data from feedback.civitai.com

### Options

```bash
node main.js [product-domain] [options]
```

Available options:
- `--feedback-only`: Run only the feedback scraper
- `--roadmap-only`: Run only the roadmap scraper
- `--item-limit=N`: Limit the number of items to fetch (default: no limit)

### Examples

```bash
# Scrape only feedback posts from feedback.civitai.com
node main.js civitai.com --feedback-only

# Scrape roadmap with a limit of 10 items per section from feedback.civitai.com
node main.js civitai.com --roadmap-only --item-limit=10
```

## Output

Data is saved to:
- `output/[product-domain]/`: JSON data files
- `output_debug/`: Debug logs and additional information 