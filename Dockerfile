# Node.js base image
FROM node:20-alpine

# Working directory set করো
WORKDIR /app

# package.json এবং package-lock.json copy করো
COPY package*.json ./

# Dependencies install করো
RUN npm ci --only=production

# সব files copy করো
COPY . .

# Port expose করো
EXPOSE 4000

# App start করো
CMD ["node", "server.js"]
