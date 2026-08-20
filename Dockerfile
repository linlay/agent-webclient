FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN rm -rf /app/dist/export/assets
RUN rm -f /app/dist/export/conversation-assets.json

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext jq

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf.template
COPY scripts/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh

EXPOSE 80

CMD ["/usr/local/bin/nginx-entrypoint.sh"]
