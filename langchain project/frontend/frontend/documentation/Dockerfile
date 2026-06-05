# SAST Fix — CWE-16 (Insecure base image version)
#
# Root cause: "node:18-alpine" and "nginx:alpine" use floating tags — the
# resolved image can change on every pull, potentially introducing vulnerable
# layers without any code change.
#
# Fix: pin every base image to a MAJOR.MINOR.PATCH tag.
#   • node:18.20.8-alpine3.21  — Node 18 LTS latest patch, Alpine 3.21
#   • nginx:1.27.5-alpine3.21  — nginx stable latest patch, Alpine 3.21
#
# To update: run  docker pull node:18-alpine  and record the digest with
#   docker inspect --format='{{index .RepoDigests 0}}' node:18-alpine
# then substitute the SHA256 digest for the tag (even more robust):
#   FROM node@sha256:<digest> AS build

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:18.20.8-alpine3.21 AS build

WORKDIR /app

# Copy dependency manifests first (layer-cache friendly)
COPY package.json package-lock.json ./

# Install dependencies (ci = clean install, respects package-lock.json)
RUN npm ci --omit=dev

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: serve ──────────────────────────────────────────────────────────
FROM nginx:1.27.5-alpine3.21

# Copy compiled assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config (set security headers server-side: X-Frame-Options,
# Content-Security-Policy, X-Content-Type-Options, etc.)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
