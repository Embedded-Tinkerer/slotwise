# Slotwise server: the web app plus the sync API, in one small container.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx expo export -p web --output-dir dist

FROM node:22-alpine
WORKDIR /app
COPY server/server.mjs server/server.mjs
COPY --from=build /app/dist dist
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server/server.mjs"]
