/**
 * Apify Actor: Facebook Ultimate Scraper (All-in-One Enterprise Edition)
 * Technology: JavaScript (ES Modules), Crawlee, Playwright
 * Supports 11 distinct scraping modules with Auto-Detection & Stealth.
 */

import { Actor } from 'apify';
import { PlaywrightCrawler, log } from 'crawlee';
import {
    detectUrlType,
    parseCount,
    cleanExternalUrl,
    dismissLoginOverlay,
    extractPageAndLeads,
    extractGroupDetails,
    extractPostsFeed,
    extractCommentsAndReplies,
    extractReelsAndVideos,
    extractAdsLibrary,
    extractMarketplaceListings,
    extractEvents,
    extractReviewsAndRecommendations,
    extractPhotosAndAlbums,
    convertUrlToNumericId
} from './extractors.js';

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const {
        scrapeMode = 'AUTO_DETECT',
        startUrls = [{ url: 'https://www.facebook.com/Nike' }],
        maxItems = 15,
        maxComments = 10,
        marketplaceCity = '',
        adsCountry = 'ALL',
        proxyConfiguration: proxyInput,
        customCookies = ''
    } = input;

    log.info(`🚀 Starting Facebook Ultimate Scraper | Mode: ${scrapeMode} | Targets: ${startUrls.length}`);

    // Setup Apify Residential Proxy
    let proxyConfiguration;
    if (proxyInput) {
        proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
    } else {
        proxyConfiguration = await Actor.createProxyConfiguration({
            groups: ['RESIDENTIAL']
        }).catch(() => undefined);
    }

    const scrapedRecords = [];

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 75,
        navigationTimeoutSecs: 45,
        headless: true,

        launchContext: {
            launchOptions: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--window-size=1280,850'
                ]
            }
        },

        preNavigationHooks: [
            async ({ page, context }) => {
                await page.setExtraHTTPHeaders({
                    'accept-language': 'en-US,en;q=0.9',
                    'sec-ch-ua': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"'
                });

                // Apply custom session cookies if provided
                if (customCookies && typeof customCookies === 'string') {
                    try {
                        let parsedCookies = [];
                        if (customCookies.trim().startsWith('[')) {
                            parsedCookies = JSON.parse(customCookies);
                        } else {
                            parsedCookies = customCookies.split(';').map((pair) => {
                                const [name, ...val] = pair.trim().split('=');
                                return {
                                    name: name.trim(),
                                    value: val.join('=').trim(),
                                    domain: '.facebook.com',
                                    path: '/'
                                };
                            }).filter(c => c.name && c.value);
                        }
                        if (parsedCookies.length > 0) {
                            await context.addCookies(parsedCookies);
                            log.info(`🔑 Applied ${parsedCookies.length} Facebook session cookies.`);
                        }
                    } catch (cookieErr) {
                        log.warning(`Failed to parse custom cookies: ${cookieErr.message}`);
                    }
                }

                // Block heavy media/video tracking
                await page.route('**/*.{mp4,avi,webm,woff,woff2}', (route) => route.abort());
            }
        ],

        async requestHandler({ page, request }) {
            const url = request.url;
            
            // Determine active mode (either explicit or auto-detected)
            const activeMode = scrapeMode === 'AUTO_DETECT' ? detectUrlType(url) : scrapeMode;
            log.info(`⚡ Processing URL [${activeMode}]: ${url}`);

            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(2000);

            // Dismiss floating login popups
            await dismissLoginOverlay(page);

            // Perform incremental scrolling if extracting lists/posts
            if (['POSTS', 'GROUPS', 'MARKETPLACE', 'REELS_VIDEOS', 'PHOTOS_ALBUMS', 'ADS_LIBRARY'].includes(activeMode)) {
                log.info(`📜 Scrolling page to load more ${activeMode.toLowerCase()} items...`);
                for (let i = 0; i < 3; i++) {
                    await page.mouse.wheel(0, 900);
                    await page.waitForTimeout(1000);
                    await dismissLoginOverlay(page);
                }
            }

            let resultRecord = null;

            switch (activeMode) {
                case 'PAGES': {
                    const pageData = await extractPageAndLeads(page, url);
                    // Also scrape latest posts preview
                    const posts = await extractPostsFeed(page, url, Math.min(maxItems, 5));
                    resultRecord = {
                        ...pageData,
                        followersCount: parseCount(pageData.followersRaw),
                        likesCount: parseCount(pageData.likesRaw),
                        website: cleanExternalUrl(pageData.website),
                        recentPosts: posts,
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'GROUPS': {
                    resultRecord = {
                        ...(await extractGroupDetails(page, url, maxItems)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'POSTS': {
                    const postsList = await extractPostsFeed(page, url, maxItems);
                    resultRecord = {
                        type: 'POSTS_FEED',
                        sourceUrl: url,
                        totalPosts: postsList.length,
                        posts: postsList,
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'COMMENTS': {
                    const commentsList = await extractCommentsAndReplies(page, maxComments);
                    resultRecord = {
                        type: 'COMMENTS_FEED',
                        sourceUrl: url,
                        totalComments: commentsList.length,
                        comments: commentsList,
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'REELS_VIDEOS': {
                    resultRecord = {
                        ...(await extractReelsAndVideos(page, url, maxItems)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'ADS_LIBRARY': {
                    resultRecord = {
                        ...(await extractAdsLibrary(page, url, maxItems)),
                        targetCountry: adsCountry,
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'MARKETPLACE': {
                    resultRecord = {
                        ...(await extractMarketplaceListings(page, url, maxItems)),
                        locationFilter: marketplaceCity || 'Global',
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'EVENTS': {
                    resultRecord = {
                        ...(await extractEvents(page, url, maxItems)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'REVIEWS': {
                    resultRecord = {
                        ...(await extractReviewsAndRecommendations(page, url, maxItems)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'PHOTOS_ALBUMS': {
                    resultRecord = {
                        ...(await extractPhotosAndAlbums(page, url, maxItems)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                case 'URL_ID_CONVERTER': {
                    resultRecord = {
                        ...(await convertUrlToNumericId(page, url)),
                        scrapedAt: new Date().toISOString()
                    };
                    break;
                }
                default: {
                    resultRecord = {
                        type: 'GENERIC_PAGE',
                        url,
                        title: await page.title(),
                        scrapedAt: new Date().toISOString()
                    };
                }
            }

            if (resultRecord) {
                log.info(`✅ Successfully scraped [${activeMode}] from: ${url}`);
                await Actor.pushData(resultRecord);
                scrapedRecords.push(resultRecord);
            }
        },

        async failedRequestHandler({ request, error }) {
            log.error(`❌ Request ${request.url} failed: ${error.message}`);
        }
    });

    await crawler.run(startUrls);

    // Save summary OUTPUT in Key-Value store
    const summary = {
        totalRecordsScraped: scrapedRecords.length,
        executionMode: scrapeMode,
        recordsSummary: scrapedRecords.map((r) => ({
            type: r.type,
            url: r.pageUrl || r.sourceUrl || r.groupUrl || r.libraryUrl || r.originalUrl,
            name: r.pageName || r.groupName || r.title || r.numericId
        })),
        finishedAt: new Date().toISOString()
    };

    await Actor.setValue('OUTPUT', summary);
    log.info(`🎉 Scraped ${scrapedRecords.length} record(s). Data pushed to Dataset & OUTPUT Key-Value store.`);

} catch (error) {
    log.error(`Actor failed: ${error.message}`, { stack: error.stack });
    throw error;
} finally {
    await Actor.exit();
}
