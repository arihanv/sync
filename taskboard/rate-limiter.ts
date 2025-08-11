import { LinearClient } from "@linear/sdk";

/**
 * Rate limiting configuration for Linear API
 */
interface RateLimitConfig {
	maxRequestsPerSecond: number;
	maxBurstRequests: number;
	retryDelayMs: number;
	maxRetries: number;
}

/**
 * Queue entry for pending requests
 */
interface QueuedRequest {
	execute: () => Promise<any>;
	resolve: (value: any) => void;
	reject: (error: any) => void;
	priority: number;
	timestamp: number;
}

/**
 * Rate-limited Linear API client
 * Coordinates API calls to respect Linear's rate limits and prevent 429 errors
 */
export class RateLimitedLinearClient {
	private client: LinearClient;
	private config: RateLimitConfig;
	private requestQueue: QueuedRequest[] = [];
	private requestTimestamps: number[] = [];
	private processing = false;

	constructor(client: LinearClient, config?: Partial<RateLimitConfig>) {
		this.client = client;
		this.config = {
			maxRequestsPerSecond: 10,
			maxBurstRequests: 50,
			retryDelayMs: 1000,
			maxRetries: 3,
			...config,
		};
	}

	/**
	 * Wraps Linear API calls with rate limiting
	 */
	private async executeWithRateLimit<T>(
		operation: () => Promise<T>,
		priority = 1,
	): Promise<T> {
		return new Promise((resolve, reject) => {
			this.requestQueue.push({
				execute: operation,
				resolve,
				reject,
				priority,
				timestamp: Date.now(),
			});

			// Sort queue by priority (higher = more important)
			this.requestQueue.sort((a, b) => b.priority - a.priority);

			if (!this.processing) {
				this.processQueue();
			}
		});
	}

	/**
	 * Process the request queue with rate limiting
	 */
	private async processQueue(): Promise<void> {
		if (this.processing || this.requestQueue.length === 0) {
			return;
		}

		this.processing = true;

		while (this.requestQueue.length > 0) {
			const now = Date.now();

			// Clean up old timestamps (older than 1 second)
			this.requestTimestamps = this.requestTimestamps.filter(
				(timestamp) => now - timestamp < 1000,
			);

			// Check if we can make a request
			if (this.requestTimestamps.length >= this.config.maxRequestsPerSecond) {
				// Wait until we can make another request
				const oldestTimestamp = Math.min(...this.requestTimestamps);
				const waitTime = 1000 - (now - oldestTimestamp);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				continue;
			}

			const request = this.requestQueue.shift();
			if (!request) continue;

			try {
				this.requestTimestamps.push(now);
				const result = await this.executeWithRetry(request.execute);
				request.resolve(result);
			} catch (error) {
				request.reject(error);
			}

			// Small delay between requests to avoid overwhelming the API
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		this.processing = false;
	}

	/**
	 * Execute operation with retry logic
	 */
	private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
		let lastError: any;

		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error: any) {
				lastError = error;

				// If it's a 429 (rate limit) error, wait longer
				if (error?.status === 429 || error?.message?.includes("rate limit")) {
					const retryAfter = error?.headers?.["retry-after"];
					const delayMs = retryAfter
						? parseInt(retryAfter) * 1000
						: this.config.retryDelayMs * Math.pow(2, attempt);

					console.warn(
						`Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${
							this.config.maxRetries + 1
						})`,
					);
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					continue;
				}

				// For other errors, don't retry
				throw error;
			}
		}

		throw lastError;
	}

	// Wrap common Linear API methods with rate limiting

	async issue(issueId: string, priority = 1) {
		return this.executeWithRateLimit(() => this.client.issue(issueId), priority);
	}

	async createComment(input: any, priority = 2) {
		return this.executeWithRateLimit(
			() => this.client.createComment(input),
			priority,
		);
	}

	async createIssueRelation(input: any, priority = 2) {
		return this.executeWithRateLimit(
			() => this.client.createIssueRelation(input),
			priority,
		);
	}

	async team(teamId: string, priority = 1) {
		return this.executeWithRateLimit(() => this.client.team(teamId), priority);
	}

	async viewer(priority = 1) {
		return this.executeWithRateLimit(() => this.client.viewer, priority);
	}

	/**
	 * Get queue status for monitoring
	 */
	getQueueStatus() {
		return {
			queueLength: this.requestQueue.length,
			processing: this.processing,
			recentRequestCount: this.requestTimestamps.length,
			oldestPendingRequest: this.requestQueue.length > 0 
				? Date.now() - this.requestQueue[this.requestQueue.length - 1].timestamp
				: 0,
		};
	}

	/**
	 * Clear the request queue (for emergency stops)
	 */
	clearQueue() {
		this.requestQueue.forEach(request => {
			request.reject(new Error('Queue cleared'));
		});
		this.requestQueue = [];
	}
}