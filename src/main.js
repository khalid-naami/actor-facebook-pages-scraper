/**
 * Apify Actor: Facebook Ultimate Scraper (All-in-One Enterprise Edition)
 * Technology: JavaScript (ES Modules), Crawlee, Playwright
 * Supports 11 distinct scraping modules with Auto-Detection & Stealth.
 */

import { Actor } from 'apify';
import { PlaywrightCrawler, RequestQueue, log } from 'crawlee';
import {
    sanitizeRecord,
    normalizeFacebookUrl,
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
    convertUrlToNumericId,
} from './extractors.js';

function parseCookieString(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
    const trimmed = raw.trim();
    let rawList = [];
    if (trimmed.startsWith('[')) {
        rawList = JSON.parse(trimmed);
    } else {
        rawList = trimmed.split(';').map((pair) => {
            const eqIdx = pair.indexOf('=');
            if (eqIdx <= 0) return null;
            return {
                name: pair.slice(0, eqIdx).trim(),
                value: pair.slice(eqIdx + 1).trim(),
            };
        }).filter(Boolean);
    }

    const out = [];
    for (const c of rawList) {
        if (!c?.name || c?.value === undefined) continue;
        const sameSiteRaw = String(c.sameSite || '').toLowerCase();
        const sameSite = sameSiteRaw === 'no_restriction' || sameSiteRaw === 'none'
            ? 'None'
            : (sameSiteRaw === 'strict' ? 'Strict' : 'Lax');
        out.push({
            name: String(c.name),
            value: String(c.value),
            domain: c.domain || '.facebook.com',
            path: c.path || '/',
            secure: sameSite === 'None' ? true : Boolean(c.secure ?? true),
            sameSite,
        });
    }
    return out;
}

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
        customCookies = '',
    } = input;

    const safeMaxItems = Math.max(1, Math.min(200, Number(maxItems) || 15));
    const safeMaxComments = Math.max(0, Math.min(100, Number(maxComments) || 10));

    const targets = [];
    for (const item of Array.isArray(startUrls) ? startUrls : []) {
        const rawUrl = typeof item === 'string' ? item : item?.url;
        const normalized = normalizeFacebookUrl(rawUrl);
        if (normalized) targets.push(normalized);
    }
    if (targets.length === 0) {
        targets.push('https://www.facebook.com/Nike');
    }

    log.info(`🚀 Starting Facebook Ultimate Scraper | Mode: ${scrapeMode} | Targets: ${targets.length}`);

    let proxyConfiguration;
    try {
        if (proxyInput) {
            proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
        } else {
            proxyConfiguration = await Actor.createProxyConfiguration({
                groups: ['RESIDENTIAL'],
            }).catch(() => undefined);
        }
    } catch (proxyErr) {
        log.warning(`⚠️ Proxy configuration skipped (${proxyErr.message}). Continuing directly.`);
    }

    const scrapedRecords = [];
    const diagnostics = [];

    async function pushClean(record) {
        const cleaned = sanitizeRecord({
            ...record,
            scrapedAt: record.scrapedAt || new Date().toISOString(),
        });
        await Actor.pushData(cleaned);
        scrapedRecords.push(cleaned);
        return cleaned;
    }

    const queueName = `fb-scraper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const requestQueue = await RequestQueue.open(queueName);

    try {
        const crawler = new PlaywrightCrawler({
            requestQueue,
            proxyConfiguration,
            maxConcurrency: 1,
            maxRequestRetries: 2,
            requestHandlerTimeoutSecs: 80,
            navigationTimeoutSecs: 45,
            headless: true,

            launchContext: {
                launchOptions: {
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-infobars',
                        '--window-size=1280,850',
                    ],
                },
            },

            preNavigationHooks: [
                async ({ page, context }, gotoOptions) => {
                    gotoOptions.waitUntil = 'domcontentloaded';

                    await page.setExtraHTTPHeaders({
                        'accept-language': 'en-US,en;q=0.9',
                    });

                    if (customCookies && typeof customCookies === 'string' && customCookies.trim()) {
                        try {
                            const parsedCookies = parseCookieString(customCookies);
                            if (parsedCookies.length > 0) {
                                await context.addCookies(parsedCookies);
                                log.info(`🔑 Applied ${parsedCookies.length} Facebook session cookies.`);
                            }
                        } catch (cookieErr) {
                            log.warning(`Failed to parse custom cookies: ${cookieErr.message}`);
                        }
                    }

                    await page.route('**/*.{mp4,avi,webm,woff,woff2}', (route) => route.abort());
                },
            ],

            async requestHandler({ page, request }) {
                const url = request.url;
                const activeMode = detectUrlType(url, scrapeMode);
                log.info(`⚡ Processing URL [${activeMode}]: ${url}`);

                await page.waitForLoadState('domcontentloaded');
                await page.waitForTimeout(2000);
                await dismissLoginOverlay(page);

                let workingUrl = url;
                if (activeMode === 'MARKETPLACE' && url.includes('/marketplace/category/')) {
                    const targetCity = (marketplaceCity || 'paris').toLowerCase().replace(/\s+/g, '');
                    const cityMarketplaceUrl = url.replace('/marketplace/category/', `/marketplace/${targetCity}/`);
                    log.info(`📍 Facebook Marketplace requires a city. Redirecting to: ${cityMarketplaceUrl}`);
                    await page.goto(cityMarketplaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
                    await page.waitForTimeout(2000);
                    await dismissLoginOverlay(page);
                    workingUrl = page.url() || cityMarketplaceUrl;
                }

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
                        const posts = await extractPostsFeed(page, url, Math.min(safeMaxItems, 5));
                        const { followersRaw, likesRaw, ...rest } = pageData;

                        resultRecord = sanitizeRecord({
                            ...rest,
                            followersCount: parseCount(followersRaw),
                            likesCount: parseCount(likesRaw),
                            website: cleanExternalUrl(rest.website),
                            recentPosts: posts.length > 0 ? posts : undefined,
                            scrapedAt: new Date().toISOString(),
                        });

                        if (!resultRecord.pageName && !resultRecord.recentPosts?.length && resultRecord.followersCount === undefined) {
                            throw new Error(`Unable to extract Facebook page content for ${url} (possible login wall — provide customCookies or Residential Proxy)`);
                        }
                        break;
                    }
                    case 'GROUPS': {
                        resultRecord = {
                            ...(await extractGroupDetails(page, url, safeMaxItems)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'POSTS': {
                        const postsList = await extractPostsFeed(page, url, safeMaxItems);
                        resultRecord = {
                            type: 'POSTS_FEED',
                            sourceUrl: url,
                            totalPosts: postsList.length,
                            posts: postsList,
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'COMMENTS': {
                        const commentsList = await extractCommentsAndReplies(page, safeMaxComments);
                        resultRecord = {
                            type: 'COMMENTS_FEED',
                            sourceUrl: url,
                            totalComments: commentsList.length,
                            comments: commentsList,
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'REELS_VIDEOS': {
                        resultRecord = {
                            ...(await extractReelsAndVideos(page, url, safeMaxItems)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'ADS_LIBRARY': {
                        resultRecord = {
                            ...(await extractAdsLibrary(page, url, safeMaxItems)),
                            targetCountry: adsCountry,
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'MARKETPLACE': {
                        resultRecord = {
                            ...(await extractMarketplaceListings(page, workingUrl, safeMaxItems)),
                            locationFilter: marketplaceCity || 'paris',
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'EVENTS': {
                        resultRecord = {
                            ...(await extractEvents(page, url, safeMaxItems)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'REVIEWS': {
                        resultRecord = {
                            ...(await extractReviewsAndRecommendations(page, url, safeMaxItems)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'PHOTOS_ALBUMS': {
                        resultRecord = {
                            ...(await extractPhotosAndAlbums(page, url, safeMaxItems)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    case 'URL_ID_CONVERTER': {
                        resultRecord = {
                            ...(await convertUrlToNumericId(page, url)),
                            scrapedAt: new Date().toISOString(),
                        };
                        break;
                    }
                    default: {
                        resultRecord = {
                            type: 'GENERIC_PAGE',
                            url,
                            title: (await page.title()) || 'Facebook',
                            scrapedAt: new Date().toISOString(),
                        };
                    }
                }

                if (resultRecord) {
                    await pushClean(resultRecord);
                    log.info(`✅ Successfully scraped [${activeMode}] from: ${url}`);
                }
            },

            async failedRequestHandler({ request }, error) {
                const msg = error?.message || 'Unknown crawler error';
                log.error(`❌ Request ${request.url} failed: ${msg}`);
                diagnostics.push(`${request.url}: ${msg}`);
            },
        });

        await crawler.run(targets);
    } finally {
        await requestQueue.drop().catch(() => {});
    }

    const summary = {
        status: scrapedRecords.length > 0 ? 'COMPLETED' : 'FAILED',
        totalRecordsScraped: scrapedRecords.length,
        executionMode: scrapeMode,
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
        recordsSummary: scrapedRecords.map((r) => sanitizeRecord({
            type: r.type,
            url: r.pageUrl || r.sourceUrl || r.groupUrl || r.libraryUrl || r.originalUrl || r.url,
            name: r.pageName || r.groupName || r.title || r.numericId,
            followers: r.followersCount,
            email: r.email,
            phone: r.phone,
            totalItems: r.totalItems ?? r.totalPosts ?? r.postsCount,
        })),
        finishedAt: new Date().toISOString(),
    };

    await Actor.setValue('OUTPUT', summary);
    log.info(`🎉 Scraped ${scrapedRecords.length} record(s). Data pushed to Dataset & OUTPUT Key-Value store.`);

    if (scrapedRecords.length === 0) {
        const reason = diagnostics.length > 0 ? diagnostics.join('; ') : 'No Facebook records extracted (login wall or block).';
        await Actor.fail(`Extracted 0 Facebook records. ${reason}`);
    }
} catch (error) {
    log.error(`Actor failed: ${error.message}`, { stack: error.stack });
    await Actor.fail(error.message);
} finally {
    await Actor.exit();
}
