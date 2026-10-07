/**
 * Facebook Ultimate All-in-One Extractors (JavaScript / Playwright)
 * Covers all 11 Facebook scraping modules:
 * 1. Pages & B2B Leads
 * 2. Public Groups
 * 3. Posts & Engagements
 * 4. Comments & Replies
 * 5. Reels & Videos
 * 6. Facebook Meta Ads Library
 * 7. Marketplace Listings
 * 8. Events
 * 9. Reviews & Recommendations
 * 10. High-Res Photos & Albums
 * 11. URL to Numeric ID / ID to URL Converter
 */

/**
 * Automatically determines the Facebook module based on the URL structure.
 * @param {string} url
 * @returns {string}
 */
export function detectUrlType(url) {
    if (!url) return 'PAGES';
    const lower = url.toLowerCase();

    if (lower.includes('/marketplace')) return 'MARKETPLACE';
    if (lower.includes('/groups/')) return 'GROUPS';
    if (lower.includes('/events/')) return 'EVENTS';
    if (lower.includes('/reel/') || lower.includes('/videos/') || lower.includes('/watch/')) return 'REELS_VIDEOS';
    if (lower.includes('/ads/library') || lower.includes('ad_delivery_date')) return 'ADS_LIBRARY';
    if (lower.includes('/reviews') || lower.includes('/recommendations')) return 'REVIEWS';
    if (lower.includes('/photos') || lower.includes('/albums')) return 'PHOTOS_ALBUMS';
    if (lower.includes('/posts/') || lower.includes('/permalink/') || lower.includes('story_fbid')) return 'POSTS';

    return 'PAGES';
}

/**
 * Parses numeric strings with K, M, B abbreviations (e.g. "1.5M followers" -> 1500000).
 * @param {string} text
 * @returns {number|null}
 */
export function parseCount(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    const match = clean.match(/([\d.]+)\s*([KkMmBb])?/);
    if (!match) return null;

    let num = parseFloat(match[1]);
    const multiplier = match[2]?.toUpperCase();

    if (multiplier === 'K') num *= 1_000;
    else if (multiplier === 'M') num *= 1_000_000;
    else if (multiplier === 'B') num *= 1_000_000_000;

    return Math.round(num);
}

/**
 * Cleans Facebook tracking parameters and external redirects.
 * @param {string} url
 * @returns {string}
 */
export function cleanExternalUrl(url) {
    if (!url) return '';
    try {
        if (url.includes('l.facebook.com/l.php')) {
            const parsed = new URL(url);
            return decodeURIComponent(parsed.searchParams.get('u') || url);
        }
        return url.split('?')[0];
    } catch {
        return url;
    }
}

/**
 * Dismisses or removes Facebook's login banner/modal overlay and unlocks scrolling.
 * @param {import('playwright').Page} page
 */
export async function dismissLoginOverlay(page) {
    try {
        await page.evaluate(() => {
            // Remove dialogs and overlays
            const dialogs = document.querySelectorAll('div[role="dialog"], [data-nosnippet], ._95ke');
            dialogs.forEach((d) => {
                const text = d.innerText || '';
                if (text.includes('Log In') || text.includes('Se connecter') || text.includes('تسجيل الدخول') || text.includes('Create new account')) {
                    d.remove();
                }
            });

            // Remove fixed bottom/top banners
            const banners = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
            banners.forEach((b) => {
                if (b.innerText && (b.innerText.includes('See more on Facebook') || b.innerText.includes('Log In'))) {
                    b.remove();
                }
            });

            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
        });

        const closeBtn = page.locator('[aria-label="Close"], [aria-label="Fermer"], [aria-label="إغلاق"]').first();
        if (await closeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await closeBtn.click().catch(() => {});
        }
    } catch {
        // Silently continue
    }
}

// ==================== 1. PAGES & LEADS ====================
export async function extractPageAndLeads(page, url) {
    return await page.evaluate((canonicalUrl) => {
        let pageName = '';
        const h1 = document.querySelector('h1');
        if (h1) pageName = h1.innerText.trim();
        if (!pageName) {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            pageName = ogTitle ? ogTitle.getAttribute('content') : document.title.split('|')[0].split('-')[0].trim();
        }

        const verifiedBadge = !!document.querySelector('svg[aria-label*="Verified"], svg[aria-label*="Vérifié"], svg[aria-label*="مؤكد"]');

        let avatarUrl = '';
        const avatarImg = document.querySelector('image[*|href], div[role="img"] img, svg image, [aria-label*="profile picture" i] img');
        if (avatarImg) avatarUrl = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('src') || '';
        if (!avatarUrl) {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) avatarUrl = ogImage.getAttribute('content') || '';
        }

        let coverPhotoUrl = '';
        const coverImg = document.querySelector('img[data-imgperflogname="profileCoverPhoto"], img[alt*="Cover" i]');
        if (coverImg) coverPhotoUrl = coverImg.getAttribute('src') || '';

        const bodyText = document.body.innerText || '';

        let likesRaw = null;
        const likesMatch = bodyText.match(/([\d.,\s]+[KkMmBb]?)\s*(?:likes|personnes aiment ça|معجب)/i);
        if (likesMatch) likesRaw = likesMatch[1].trim();

        let followersRaw = null;
        const followersMatch = bodyText.match(/([\d.,\s]+[KkMmBb]?)\s*(?:followers|personnes suivent|متابع)/i);
        if (followersMatch) followersRaw = followersMatch[1].trim();

        // Contact Leads: Email & Phone & Website
        let email = null;
        const emailMatch = bodyText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/);
        if (emailMatch && !emailMatch[0].includes('facebook.com') && !emailMatch[0].includes('sentry.io')) {
            email = emailMatch[0];
        }

        let phone = null;
        const phoneMatch = bodyText.match(/(?:\+?\d{1,4}[ -]?)?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}/);
        if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8) {
            phone = phoneMatch[0].trim();
        }

        let website = null;
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            if (href.includes('l.facebook.com/l.php?u=') || a.innerText?.match(/^https?:\/\//i)) {
                if (!href.includes('facebook.com') && !href.includes('instagram.com')) {
                    website = href.includes('l.php?u=') ? decodeURIComponent(new URL(href).searchParams.get('u') || href) : href;
                    break;
                }
            }
        }

        return {
            type: 'PAGE',
            pageName,
            pageUrl: canonicalUrl,
            verified: verifiedBadge,
            followersRaw,
            likesRaw,
            email,
            phone,
            website,
            avatarUrl,
            coverPhotoUrl,
            introBio: (bodyText.match(/Intro\n([^\n]+)/i)?.[1] || '').slice(0, 300)
        };
    }, url);
}

// ==================== 2. GROUPS SCRAPER ====================
export async function extractGroupDetails(page, url, maxItems = 10) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        let groupName = document.querySelector('h1')?.innerText?.trim() || document.title.split('|')[0].trim();
        const fullText = document.body.innerText || '';

        // Privacy (Public / Private)
        const isPublic = fullText.includes('Public group') || fullText.includes('Groupe public') || fullText.includes('مجموعة عامة');
        
        // Members count
        const membersMatch = fullText.match(/([\d.,\s]+[KkMm]?)\s*(?:members|membres|عضو)/i);
        const membersCount = membersMatch ? membersMatch[1].trim() : null;

        // Group Posts
        const postArticles = Array.from(document.querySelectorAll('div[role="article"]')).slice(0, max);
        const groupPosts = postArticles.map((art, idx) => {
            const text = art.innerText || '';
            const author = art.querySelector('h2, h3, strong, a[role="link"]')?.innerText?.trim() || 'Member';
            return {
                postIndex: idx + 1,
                author,
                content: text.slice(0, 400),
                reactions: text.match(/([\d.,\s]+[KkMm]?)\s*(?:likes|reactions)/i)?.[1] || '0',
                comments: text.match(/([\d.,\s]+[KkMm]?)\s*(?:comments)/i)?.[1] || '0'
            };
        });

        return {
            type: 'GROUP',
            groupName,
            groupUrl: canonicalUrl,
            privacy: isPublic ? 'Public' : 'Private',
            membersCount,
            postsCount: groupPosts.length,
            posts: groupPosts
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 3. POSTS SCRAPER ====================
export async function extractPostsFeed(page, url, maxItems = 15) {
    return await page.evaluate((max) => {
        const articles = Array.from(document.querySelectorAll('div[role="article"]')).slice(0, max);
        return articles.map((art, idx) => {
            const text = art.innerText || '';
            const msgElem = art.querySelector('div[data-ad-preview="message"], div[dir="auto"]');
            const postText = msgElem ? msgElem.innerText.trim() : text.slice(0, 400);

            const images = Array.from(art.querySelectorAll('img'))
                .map(img => img.getAttribute('src'))
                .filter(src => src && src.includes('scontent') && !src.includes('emoji.php'));

            return {
                type: 'POST',
                postIndex: idx + 1,
                text: postText,
                images: images.slice(0, 4),
                reactions: text.match(/([\d.,\s]+[KkMm]?)\s*(?:reactions|likes)/i)?.[1] || '0',
                comments: text.match(/([\d.,\s]+[KkMm]?)\s*(?:comments|commentaires)/i)?.[1] || '0',
                shares: text.match(/([\d.,\s]+[KkMm]?)\s*(?:shares|partages)/i)?.[1] || '0'
            };
        });
    }, maxItems);
}

// ==================== 4. COMMENTS & REPLIES ====================
export async function extractCommentsAndReplies(page, maxComments = 20) {
    return await page.evaluate((max) => {
        const commentElements = Array.from(document.querySelectorAll('div[role="article"] div[dir="auto"], ul > li div[dir="auto"]')).slice(0, max);
        return commentElements.map((c, idx) => {
            const text = c.innerText?.trim() || '';
            const parentBlock = c.closest('div[role="article"]') || c.parentElement;
            const author = parentBlock?.querySelector('a, span[dir="auto"]')?.innerText?.trim() || 'Facebook User';

            return {
                type: 'COMMENT',
                commentIndex: idx + 1,
                author,
                commentText: text,
                likes: parentBlock?.innerText?.match(/(\d+)\s*like/i)?.[1] || '0'
            };
        }).filter(c => c.commentText && c.commentText.length > 1);
    }, maxComments);
}

// ==================== 5. REELS & VIDEOS ====================
export async function extractReelsAndVideos(page, url, maxItems = 15) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        const videoCards = Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/videos/"], div[role="article"]')).slice(0, max);
        const videos = videoCards.map((card, idx) => {
            const href = card.getAttribute('href') || canonicalUrl;
            const fullText = card.innerText || '';
            const viewsMatch = fullText.match(/([\d.,\s]+[KkMm]?)\s*(?:views|vues|مشاهدة)/i);
            const thumb = card.querySelector('img')?.getAttribute('src') || '';

            return {
                videoIndex: idx + 1,
                videoUrl: href.startsWith('http') ? href : `https://www.facebook.com${href}`,
                thumbnail: thumb,
                views: viewsMatch ? viewsMatch[1].trim() : 'N/A',
                caption: fullText.slice(0, 200).replace(/\n+/g, ' ')
            };
        });

        return {
            type: 'REELS_VIDEOS',
            sourceUrl: canonicalUrl,
            totalVideos: videos.length,
            videos
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 6. FACEBOOK ADS LIBRARY ====================
export async function extractAdsLibrary(page, url, maxItems = 20) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        // Ads Library Cards
        const adCards = Array.from(document.querySelectorAll('div[class*="_7jvw"], div[role="region"], div[data-testid*="ad"]')).slice(0, max);
        const ads = adCards.map((card, idx) => {
            const text = card.innerText || '';
            const adIdMatch = text.match(/ID:\s*(\d+)/i) || text.match(/Library ID:\s*(\d+)/i);
            const status = text.includes('Active') ? 'Active' : (text.includes('Inactive') ? 'Inactive' : 'Active');
            const startedMatch = text.match(/Started running on\s*([^\n]+)/i);

            const creativeImage = card.querySelector('img[src*="scontent"], img')?.getAttribute('src') || '';
            const ctaLink = card.querySelector('a[href*="l.facebook.com"], a[target="_blank"]')?.getAttribute('href') || '';

            return {
                adIndex: idx + 1,
                adId: adIdMatch ? adIdMatch[1] : `AD-${idx+1}`,
                status,
                startedRunningOn: startedMatch ? startedMatch[1].trim() : 'N/A',
                creativeImage,
                adBodyText: text.slice(0, 350).replace(/\n+/g, ' '),
                landingPageUrl: ctaLink
            };
        });

        return {
            type: 'ADS_LIBRARY',
            libraryUrl: canonicalUrl,
            totalAdsFound: ads.length,
            ads
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 7. MARKETPLACE SCRAPER ====================
export async function extractMarketplaceListings(page, url, maxItems = 25) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        const itemLinks = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]')).slice(0, max);
        const items = itemLinks.map((link, idx) => {
            const href = link.getAttribute('href') || '';
            const textLines = (link.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
            
            // In Marketplace: line 0 is usually price (e.g. $150 or €90), line 1 is title, line 2 is city/location
            const price = textLines[0] || 'N/A';
            const title = textLines[1] || textLines[0] || 'Marketplace Item';
            const location = textLines[2] || '';
            const img = link.querySelector('img')?.getAttribute('src') || '';

            return {
                itemIndex: idx + 1,
                title,
                price,
                location,
                imageUrl: img,
                itemUrl: href.startsWith('http') ? href : `https://www.facebook.com${href}`
            };
        });

        return {
            type: 'MARKETPLACE',
            sourceUrl: canonicalUrl,
            totalItems: items.length,
            items
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 8. EVENTS SCRAPER ====================
export async function extractEvents(page, url, maxItems = 10) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        const eventCards = Array.from(document.querySelectorAll('a[href*="/events/"], div[role="article"]')).slice(0, max);
        const events = eventCards.map((card, idx) => {
            const text = card.innerText || '';
            const title = card.querySelector('h2, span[dir="auto"]')?.innerText?.trim() || 'Event';
            const href = card.getAttribute('href') || '';

            return {
                eventIndex: idx + 1,
                title,
                eventUrl: href.startsWith('http') ? href : `https://www.facebook.com${href}`,
                details: text.slice(0, 250).replace(/\n+/g, ' • ')
            };
        });

        return {
            type: 'EVENTS',
            sourceUrl: canonicalUrl,
            totalEvents: events.length,
            events
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 9. REVIEWS & RECOMMENDATIONS ====================
export async function extractReviewsAndRecommendations(page, url, maxItems = 20) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        const fullText = document.body.innerText || '';
        const ratingMatch = fullText.match(/([\d.]+\s*(?:out of 5|sur 5|من 5))/i);
        const recommendationMatch = fullText.match(/(\d+%\s*(?:recommend|recommandent))/i);

        const reviewArticles = Array.from(document.querySelectorAll('div[role="article"]')).slice(0, max);
        const reviews = reviewArticles.map((art, idx) => {
            const text = art.innerText || '';
            const author = art.querySelector('h2, h3, a[role="link"]')?.innerText?.trim() || 'Reviewer';
            return {
                reviewIndex: idx + 1,
                author,
                content: text.slice(0, 350).replace(/\n+/g, ' ')
            };
        });

        return {
            type: 'REVIEWS',
            pageUrl: canonicalUrl,
            overallRating: ratingMatch ? ratingMatch[1] : null,
            recommendationRate: recommendationMatch ? recommendationMatch[1] : null,
            totalReviews: reviews.length,
            reviews
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 10. PHOTOS & ALBUMS ====================
export async function extractPhotosAndAlbums(page, url, maxItems = 30) {
    return await page.evaluate(({ canonicalUrl, max }) => {
        const photoImgs = Array.from(document.querySelectorAll('img[src*="scontent"]')).slice(0, max);
        const photos = photoImgs.map((img, idx) => {
            const src = img.getAttribute('src') || '';
            const alt = img.getAttribute('alt') || 'Facebook Photo';
            const link = img.closest('a')?.getAttribute('href') || '';

            return {
                photoIndex: idx + 1,
                imageUrl: src,
                altCaption: alt.slice(0, 150),
                photoPageUrl: link.startsWith('http') ? link : (link ? `https://www.facebook.com${link}` : canonicalUrl)
            };
        });

        return {
            type: 'PHOTOS_ALBUMS',
            sourceUrl: canonicalUrl,
            totalPhotos: photos.length,
            photos
        };
    }, { canonicalUrl: url, max: maxItems });
}

// ==================== 11. URL TO NUMERIC ID CONVERTER ====================
export async function convertUrlToNumericId(page, url) {
    return await page.evaluate((canonicalUrl) => {
        let numericId = null;
        let entityType = 'PAGE_OR_PROFILE';

        // 1. Check meta tags
        const metaAndroid = document.querySelector('meta[property="al:android:url"]')?.getAttribute('content') || '';
        const metaIos = document.querySelector('meta[property="al:ios:url"]')?.getAttribute('content') || '';
        
        const idMatch = (metaAndroid + metaIos).match(/fb:\/\/(?:page|profile|group)\/(\d+)/i) || (metaAndroid + metaIos).match(/id=(\d+)/i);
        if (idMatch) {
            numericId = idMatch[1];
        }

        // 2. Check HTML scripts
        if (!numericId) {
            const html = document.documentElement.innerHTML || '';
            const scriptMatch = html.match(/"entity_id":"(\d+)"/) || html.match(/"pageID":"(\d+)"/) || html.match(/"userID":"(\d+)"/);
            if (scriptMatch) {
                numericId = scriptMatch[1];
            }
        }

        if (canonicalUrl.includes('/groups/')) entityType = 'GROUP';
        else if (canonicalUrl.includes('/marketplace/')) entityType = 'MARKETPLACE';
        else if (canonicalUrl.includes('/events/')) entityType = 'EVENT';

        return {
            type: 'URL_ID_CONVERTER',
            originalUrl: canonicalUrl,
            numericId: numericId || 'Unable to resolve (Private/Protected)',
            entityType,
            canonicalAppUri: numericId ? `fb://${entityType.toLowerCase()}/${numericId}` : null
        };
    }, url);
}
