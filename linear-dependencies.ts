#!/usr/bin/env bun

import { createBlockingRelation } from "./taskboard/utils.ts";

/**
 * CLI tool to manage Linear issue dependencies
 * Usage: bun linear-dependencies.ts <blockingIssueId> <blockedIssueId>
 * Example: bun linear-dependencies.ts HAR-8 HAR-10
 */

async function main() {
	const args = process.argv.slice(2);
	
	if (args.length !== 2) {
		console.error("Usage: bun linear-dependencies.ts <blockingIssueId> <blockedIssueId>");
		console.error("Example: bun linear-dependencies.ts HAR-8 HAR-10");
		console.error("\nThis will create a dependency where HAR-8 blocks HAR-10");
		process.exit(1);
	}

	const [blockingIssueId, blockedIssueId] = args as [string, string];

	console.log(`Setting up dependency: ${blockingIssueId} blocks ${blockedIssueId}`);
	
	try {
		const relationId = await createBlockingRelation(blockingIssueId, blockedIssueId);
		if (relationId) {
			console.log(`✅ Successfully created blocking relationship (ID: ${relationId})`);
		} else {
			console.log("⚠️  Relation created but no ID returned");
		}
	} catch (error) {
		console.error(`❌ Failed to create blocking relationship: ${error}`);
		process.exit(1);
	}
}

// Run if this file is executed directly
if (import.meta.main) {
	main();
}