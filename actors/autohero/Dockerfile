# Playwright-Actor (Chrome) — Fahrzeuge laden clientseitig per GraphQL.
FROM apify/actor-node-playwright-chrome:20 AS builder

COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false && npm install --include=dev --audit=false

COPY --chown=myuser . ./
RUN npm run build

FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false \
  && npm install --omit=dev --omit=optional --audit=false \
  && rm -rf ~/.npm

COPY --chown=myuser --from=builder /home/myuser/dist ./dist
COPY --chown=myuser . ./

CMD ./start_xvfb_and_run_cmd.sh && npm run start --silent
