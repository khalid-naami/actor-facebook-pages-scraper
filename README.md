# Facebook Ultimate All-in-One Scraper (Enterprise Edition)

The most comprehensive, reliable, and stealthy **Facebook Intelligence & Data Scraper** on Apify.  
Built with **JavaScript (Node.js), Crawlee, and Playwright**, featuring automatic URL routing, anti-blocking measures, and 11 specialized extraction modules.

---

## 🌟 11 All-in-One Scraping Modules

1. **Pages & B2B Leads Scraper**: Official page bio, verification badge, follower counts, like counts, category, and direct contact leads (Email, Phone, WhatsApp, Website, Address).
2. **Public Groups Scraper**: Group name, privacy status, member counts, and public feed posts.
3. **Posts & Engagements Scraper**: Post text content, publication timestamps, reaction counts (Likes, Loves), comment counts, and share counts.
4. **Comments & Replies Scraper**: Post comments, author profiles, comment text, and engagement likes.
5. **Reels & Videos Scraper**: Facebook Reels and video posts, view counts, captions, and thumbnails.
6. **Facebook Ads Library Scraper**: Meta Ads Library data (Ad ID, active/inactive status, creative media, ad copy text, start running dates).
7. **Marketplace Scraper**: E-commerce products on Facebook Marketplace (item title, price, city/location, seller info, image).
8. **Events Scraper**: Public Facebook events, dates, location venues, and attendee statistics.
9. **Reviews & Recommendations Scraper**: Customer ratings out of 5, recommendation percentages, and reviewer comments.
10. **High-Res Photos & Albums Scraper**: High-definition image URLs from albums and timeline photo feeds.
11. **URL to Numeric ID Converter**: Converts vanity profile/page/group usernames into permanent Facebook Numeric IDs (FBID) and deep app URIs (`fb://page/<id>`).

---

## ⚡ Smart `AUTO_DETECT` Engine

You can paste **ANY Facebook URL** into `startUrls` and leave `scrapeMode: "AUTO_DETECT"`. The scraper will automatically inspect the URL pattern and dispatch the exact matching extractor!

---

## 📥 Input Configuration

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `scrapeMode` | Select | `"AUTO_DETECT"` | Choose from `AUTO_DETECT`, `PAGES`, `GROUPS`, `POSTS`, `COMMENTS`, `REELS_VIDEOS`, `ADS_LIBRARY`, `MARKETPLACE`, `EVENTS`, `REVIEWS`, `PHOTOS_ALBUMS`, or `URL_ID_CONVERTER`. |
| `startUrls` | Array | Required | List of Facebook URLs to scrape. |
| `maxItems` | Integer | `15` | Maximum items/posts/listings per target URL. |
| `maxComments` | Integer | `10` | Maximum comments per post. |
| `marketplaceCity` | String | `""` | Optional city filter for Marketplace searches. |
| `adsCountry` | String | `"ALL"` | Target country code for Meta Ads Library. |
| `proxyConfiguration` | Object | `RESIDENTIAL` | Apify Residential Proxy configuration. |
| `customCookies` | String | `""` | Optional Facebook session cookies for authenticated scraping. |

---

## 📤 Sample Outputs

### 1. Facebook Page & Lead Output
```json
{
  "type": "PAGE",
  "pageName": "Nike",
  "pageUrl": "https://www.facebook.com/Nike",
  "verified": true,
  "followersCount": 35000000,
  "likesCount": 34000000,
  "email": "media.relations@nike.com",
  "phone": "+1 800 806 6453",
  "website": "https://www.nike.com",
  "category": "Sportswear & Footwear",
  "recentPosts": [
    {
      "postIndex": 1,
      "text": "Greatness is not born. It's made.",
      "reactions": "45K",
      "comments": "1.2K"
    }
  ],
  "scrapedAt": "2026-10-07T21:30:00.000Z"
}
```

### 2. Marketplace Output
```json
{
  "type": "MARKETPLACE",
  "sourceUrl": "https://www.facebook.com/marketplace/category/electronics",
  "totalItems": 12,
  "items": [
    {
      "itemIndex": 1,
      "title": "iPhone 15 Pro Max 256GB",
      "price": "$950",
      "location": "Paris, France",
      "imageUrl": "https://scontent...jpg",
      "itemUrl": "https://www.facebook.com/marketplace/item/..."
    }
  ]
}
```

---

## 🛡️ Anti-Block & Stealth Technology
- Automatic dismissal of Facebook's "Log In / See More" modal dialog.
- Headless Chromium with customized canvas, navigator, and headers.
- Built-in Residential Proxy rotation.

---

## 📄 License
Apache-2.0
