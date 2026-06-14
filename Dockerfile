FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Expose port (Render uses PORT env var, default to 3001 for local)
EXPOSE 3001

# Start the production server
CMD ["npm", "start"]
