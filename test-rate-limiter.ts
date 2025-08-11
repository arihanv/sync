#!/usr/bin/env bun

import { RateLimitedLinearClient } from "./taskboard/rate-limiter";

// Mock LinearClient for testing
const mockLinearClient = {
	issue: async (id: string) => {
		console.log(`Mock: Fetching issue ${id}`);
		return { id, identifier: `TEST-${id}`, title: `Test Issue ${id}` };
	},
	createComment: async (input: any) => {
		console.log(`Mock: Creating comment on issue ${input.issueId}`);
		return { comment: { id: 'comment-123', body: input.body } };
	},
	createIssueRelation: async (input: any) => {
		console.log(`Mock: Creating relation between ${input.issueId} and ${input.relatedIssueId}`);
		return { issueRelation: { id: 'relation-123' } };
	}
} as any;

async function testRateLimiter() {
	console.log('🧪 Testing Rate Limiter...');
	
	const rateLimitedClient = new RateLimitedLinearClient(mockLinearClient, {
		maxRequestsPerSecond: 2, // Low limit for testing
		maxBurstRequests: 5,
		retryDelayMs: 500,
		maxRetries: 2,
	});

	// Test multiple concurrent requests
	console.log('\n📊 Making 5 concurrent requests (should be rate limited to 2/sec)...');
	const startTime = Date.now();
	
	const promises = [
		rateLimitedClient.issue('1'),
		rateLimitedClient.issue('2'),
		rateLimitedClient.issue('3'),
		rateLimitedClient.createComment({ issueId: '1', body: 'Test comment' }),
		rateLimitedClient.issue('4'),
	];

	try {
		const results = await Promise.all(promises);
		const endTime = Date.now();
		const duration = endTime - startTime;
		
		console.log(`\n✅ All requests completed in ${duration}ms`);
		console.log('📈 Queue status:', rateLimitedClient.getQueueStatus());
		
		// Should take at least 2 seconds due to rate limiting (5 requests / 2 per second)
		if (duration >= 2000) {
			console.log('✅ Rate limiting working correctly - requests were delayed');
		} else {
			console.log('⚠️  Rate limiting may not be working - requests completed too quickly');
		}
		
	} catch (error) {
		console.error('❌ Test failed:', error);
	}
}

// Run the test if this file is executed directly
if (import.meta.main) {
	testRateLimiter();
}