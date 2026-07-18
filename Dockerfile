FROM node:20-slim
WORKDIR /app
COPY keeper/package.json keeper/package-lock.json keeper/
RUN cd keeper && npm ci
COPY . .
CMD ["bash", "keeper/railway-start.sh"]
