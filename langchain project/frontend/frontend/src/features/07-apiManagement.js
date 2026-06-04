/**
 * MANAGING LARGE-SCALE API CALLS
 * Production patterns for handling API requests at scale
 * Includes caching, retries, request management, and error handling
 */

/**
 * 1. CENTRALIZED FETCH INSTANCE WITH INTERCEPTORS
 * All API calls go through one place for consistent handling
 */
export class ApiClient {
  constructor(baseURL = "https://api.example.com") {
    this.baseURL = baseURL;
    this.defaultTimeout = 30000; // 30 seconds
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
  }

  /**
   * Add a request interceptor (runs before request)
   * Useful for adding auth tokens, tracking requests, etc.
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
    return () => {
      this.requestInterceptors = this.requestInterceptors.filter(
        (i) => i !== interceptor,
      );
    };
  }

  /**
   * Add a response interceptor (runs after successful response)
   * Useful for transforming data, caching, etc.
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
    return () => {
      this.responseInterceptors = this.responseInterceptors.filter(
        (i) => i !== interceptor,
      );
    };
  }

  /**
   * Add an error interceptor (runs on error)
   * Useful for error handling, retry logic, auth token refresh, etc.
   */
  addErrorInterceptor(interceptor) {
    this.errorInterceptors.push(interceptor);
    return () => {
      this.errorInterceptors = this.errorInterceptors.filter(
        (i) => i !== interceptor,
      );
    };
  }

  async request(method, endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || this.defaultTimeout,
    );

    let config = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
      ...(options.body && { body: JSON.stringify(options.body) }),
    };

    // Run request interceptors
    for (const interceptor of this.requestInterceptors) {
      config = (await interceptor(config)) || config;
    }

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response,
        );
      }

      let data = await response.json();

      // Run response interceptors
      for (const interceptor of this.responseInterceptors) {
        data = (await interceptor(data, response)) || data;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Run error interceptors
      for (const interceptor of this.errorInterceptors) {
        const handled = await interceptor(error);
        if (handled) return handled;
      }

      throw error;
    }
  }

  get(endpoint, options) {
    return this.request("GET", endpoint, options);
  }

  post(endpoint, body, options) {
    return this.request("POST", endpoint, { ...options, body });
  }

  put(endpoint, body, options) {
    return this.request("PUT", endpoint, { ...options, body });
  }

  patch(endpoint, body, options) {
    return this.request("PATCH", endpoint, { ...options, body });
  }

  delete(endpoint, options) {
    return this.request("DELETE", endpoint, options);
  }
}

class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.status = status;
    this.response = response;
    this.name = "ApiError";
  }
}

/**
 * 2. REQUEST CACHING STRATEGY
 * Cache responses to avoid duplicate API calls
 */
export class CachedApiClient extends ApiClient {
  constructor(baseURL) {
    super(baseURL);
    this.cache = new Map();
    this.cacheConfig = new Map(); // Per-endpoint cache config
  }

  /**
   * Set cache duration for specific endpoints
   */
  setCacheDuration(endpoint, durationMs) {
    this.cacheConfig.set(endpoint, { duration: durationMs });
  }

  /**
   * Get from cache if available and not expired
   */
  getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const { data, timestamp, duration } = entry;
    if (Date.now() - timestamp > duration) {
      this.cache.delete(key);
      return null;
    }

    return data;
  }

  /**
   * Set cache entry
   */
  setCache(key, data, duration = 5 * 60 * 1000) {
    // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration,
    });
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Clear specific endpoint cache
   */
  clearCacheForEndpoint(endpoint) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.includes(endpoint)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  async request(method, endpoint, options = {}) {
    // Only cache GET requests
    if (method === "GET") {
      const cacheKey = `${method}:${endpoint}`;
      const cached = this.getFromCache(cacheKey);

      if (cached) {
        console.log(`Cache hit: ${endpoint}`);
        return cached;
      }

      const data = await super.request(method, endpoint, options);

      // Cache the response
      const config = this.cacheConfig.get(endpoint) || {};
      const duration = config.duration || 5 * 60 * 1000;
      this.setCache(cacheKey, data, duration);

      return data;
    }

    // For non-GET requests, don't cache
    return super.request(method, endpoint, options);
  }
}

/**
 * 3. REQUEST DEDUPLICATION
 * Prevent multiple identical requests from being sent simultaneously
 */
export class DedupedApiClient extends CachedApiClient {
  constructor(baseURL) {
    super(baseURL);
    this.pendingRequests = new Map();
  }

  async request(method, endpoint, options = {}) {
    const requestKey = `${method}:${endpoint}:${JSON.stringify(
      options.body || {},
    )}`;

    // If request is already pending, return the same promise
    if (this.pendingRequests.has(requestKey)) {
      console.log(`Deduped request: ${endpoint}`);
      return this.pendingRequests.get(requestKey);
    }

    // Create new promise and store it
    const promise = super.request(method, endpoint, options);
    this.pendingRequests.set(requestKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Remove from pending when done
      this.pendingRequests.delete(requestKey);
    }
  }
}

/**
 * 4. REQUEST RETRY WITH EXPONENTIAL BACKOFF
 * Automatically retry failed requests with increasing delays
 */
export class RetryableApiClient extends DedupedApiClient {
  constructor(baseURL) {
    super(baseURL);
    this.maxRetries = 3;
    this.baseDelay = 100; // milliseconds
    this.maxDelay = 10000; // milliseconds
  }

  async request(method, endpoint, options = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await super.request(method, endpoint, options);
      } catch (error) {
        lastError = error;

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          // Calculate exponential backoff with jitter
          const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.1 * exponentialDelay;
          const delay = Math.min(exponentialDelay + jitter, this.maxDelay);

          console.log(
            `Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

/**
 * 5. AUTH TOKEN MANAGEMENT
 * Automatically add and refresh auth tokens
 */
export class AuthenticatedApiClient extends RetryableApiClient {
  constructor(baseURL, getToken, refreshToken) {
    super(baseURL);
    this.getToken = getToken;
    this.refreshToken = refreshToken;
    this.isRefreshing = false;
    this.refreshSubscribers = [];

    // Add auth interceptor
    this.addRequestInterceptor(async (config) => {
      const token = await this.getToken();
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add error interceptor for 401 handling
    this.addErrorInterceptor(async (error) => {
      if (error.status === 401) {
        // Token expired, try to refresh
        if (!this.isRefreshing) {
          this.isRefreshing = true;

          try {
            await this.refreshToken();
            this.notifyRefreshSubscribers();
            // Retry the original request
            return null; // Let the parent handle retry
          } catch (refreshError) {
            console.error("Token refresh failed");
            throw refreshError;
          } finally {
            this.isRefreshing = false;
          }
        } else {
          // Wait for token refresh to complete
          return new Promise((resolve) => {
            this.subscribeTokenRefresh(resolve);
          });
        }
      }

      return null;
    });
  }

  subscribeTokenRefresh(callback) {
    this.refreshSubscribers.push(callback);
  }

  notifyRefreshSubscribers() {
    this.refreshSubscribers.forEach((callback) => callback());
    this.refreshSubscribers = [];
  }
}

/**
 * 6. ABORT STALE REQUESTS
 * Cancel requests that are no longer needed
 */
export class AbortableApiClient extends AuthenticatedApiClient {
  constructor(baseURL, getToken, refreshToken) {
    super(baseURL, getToken, refreshToken);
    this.activeRequests = new Map();
  }

  /**
   * Create an abort controller for a request
   */
  createAbortController(key) {
    const controller = new AbortController();
    this.activeRequests.set(key, controller);
    return controller;
  }

  /**
   * Abort a specific request
   */
  abortRequest(key) {
    const controller = this.activeRequests.get(key);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(key);
    }
  }

  /**
   * Abort all requests
   */
  abortAll() {
    this.activeRequests.forEach((controller) => controller.abort());
    this.activeRequests.clear();
  }

  async request(method, endpoint, options = {}) {
    const requestKey = `${method}:${endpoint}`;
    const controller = this.createAbortController(requestKey);

    try {
      return await super.request(method, endpoint, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      this.activeRequests.delete(requestKey);
    }
  }
}

/**
 * 7. BATCH REQUEST HANDLING
 * Combine multiple requests into one
 */
export class BatchApiClient extends AbortableApiClient {
  constructor(baseURL, getToken, refreshToken) {
    super(baseURL, getToken, refreshToken);
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchSize = 10; // Max requests per batch
    this.batchDelay = 50; // Milliseconds to wait before sending batch
  }

  /**
   * Add request to batch queue
   */
  addToBatch(method, endpoint, options) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        method,
        endpoint,
        options,
        resolve,
        reject,
      });

      // Send batch if queue is full or start timer
      if (this.batchQueue.length >= this.batchSize) {
        this.sendBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.sendBatch(), this.batchDelay);
      }
    });
  }

  /**
   * Send all queued requests
   */
  async sendBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const requests = this.batchQueue.splice(0);
    if (requests.length === 0) return;

    try {
      const results = await Promise.all(
        requests.map(({ method, endpoint, options }) =>
          super.request(method, endpoint, options),
        ),
      );

      requests.forEach((request, index) => {
        request.resolve(results[index]);
      });
    } catch (error) {
      requests.forEach((request) => {
        request.reject(error);
      });
    }
  }

  async request(method, endpoint, options = {}) {
    if (method === "GET" && options.batch) {
      return this.addToBatch(method, endpoint, options);
    }

    return super.request(method, endpoint, options);
  }
}

/**
 * EXAMPLE USAGE PATTERN
 */
export function createApiClient() {
  const client = new BatchApiClient(
    "https://api.example.com",
    () => localStorage.getItem("authToken"),
    async () => {
      // Refresh token logic
      const response = await fetch("/auth/refresh");
      const { token } = await response.json();
      localStorage.setItem("authToken", token);
    },
  );

  // Configure caching
  client.setCacheDuration("/users", 10 * 60 * 1000); // 10 minutes
  client.setCacheDuration("/posts", 5 * 60 * 1000); // 5 minutes

  // Add custom error handling
  client.addErrorInterceptor(async (error) => {
    console.error("API Error:", error);
    // Could notify user, log to analytics, etc.
    return null;
  });

  return client;
}

export const apiPatternsGuide = `
╔══════════════════════════════════════════════════════════════╗
║      MANAGING LARGE-SCALE API CALLS PATTERNS                 ║
╚══════════════════════════════════════════════════════════════╝

TIER 1: BASIC CLIENT
├─ Centralized fetch instance
├─ Global interceptors for auth
└─ Error handling

TIER 2: CACHING
├─ Response caching per endpoint
├─ Cache invalidation strategies
└─ TTL (Time-To-Live) support

TIER 3: REQUEST MANAGEMENT
├─ Deduplication (prevent duplicate requests)
├─ Retry with exponential backoff
├─ Request timeout handling
└─ Abort stale requests (AbortController)

TIER 4: AUTHENTICATION
├─ Automatic token injection
├─ Token refresh on 401
├─ Queue requests during refresh
└─ Logout on 403

TIER 5: BATCH OPERATIONS
├─ Batch multiple requests
├─ Combine into single network call
└─ Reduce network overhead

ADVANCED PATTERNS:
├─ React Query / SWR - Full caching solution
├─ GraphQL - Query optimization
├─ gRPC - Binary protocol efficiency
└─ WebSockets - Real-time updates

MONITORING:
├─ Request/response timing
├─ Error rates and types
├─ Cache hit rates
└─ Network bandwidth usage
`;
