# Base image containing Node.js 20, Playwright, and Chromium dependencies
FROM apify/actor-node-playwright:20

# Copy package definitions
COPY package*.json ./

# Install NPM dependencies
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy actor source files
COPY . ./

# Run actor
CMD ["npm", "start"]
