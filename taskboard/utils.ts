import { LinearClient, LinearDocument } from "@linear/sdk";

// Bun automatically loads .env, so no need for dotenv
const linearClient = new LinearClient({
	apiKey: process.env.LINEAR_API_KEY,
});

/**
 * Creates a blocking relationship between two issues
 * @param blockingIssueId - The ID of the issue that blocks another issue
 * @param blockedIssueId - The ID of the issue that is being blocked
 * @returns The created relation ID
 */
async function createBlockingRelation(
	blockingIssueId: string,
	blockedIssueId: string,
): Promise<string | undefined> {
	try {
		const blockingIssue = await linearClient.issue(blockingIssueId);
		const blockedIssue = await linearClient.issue(blockedIssueId);

		const relation = await linearClient.createIssueRelation({
			issueId: blockingIssue.id,
			relatedIssueId: blockedIssue.id,
			type: LinearDocument.IssueRelationType.Blocks,
		});

		const relationId = (await relation.issueRelation)?.id;
		console.log(
			`Blocking relation created: ${blockingIssueId} blocks ${blockedIssueId} (Relation ID: ${relationId})`,
		);

		return relationId;
	} catch (error) {
		console.error("Error creating blocking relation:", error);
		throw error;
	}
}

async function verifyLinearSignature(
	request: Request,
	body: string,
): Promise<boolean> {
	const signature = request.headers.get("linear-signature");
	const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

	if (!signature || !webhookSecret) {
		return false;
	}

	const crypto = new Bun.CryptoHasher("sha256", webhookSecret);
	crypto.update(body);
	const expectedSignature = crypto.digest("hex");

	return signature === expectedSignature;
}

/**
 * Adds a comment to a Linear issue
 * @param issueId - The ID of the issue to comment on
 * @param comment - The comment body text
 * @returns Whether the comment was successfully created
 */
async function addCommentToIssue(
	issueId: string,
	comment: string,
): Promise<boolean> {
	try {
		const commentPayload = await linearClient.createComment({
			issueId: issueId,
			body: comment,
		});

		const commentResult = await commentPayload.comment;
		if (commentResult) {
			console.log(`Comment added to issue ${issueId}: ${comment}`);
			return true;
		}
		return false;
	} catch (error) {
		console.error(`Error adding comment to issue ${issueId}:`, error);
		return false;
	}
}

/**
 * Checks if an issue is blocked by another issue
 * @param issueId - The ID of the issue to check
 * @returns Whether the issue is blocked by another issue
 */
async function isIssueBlocked(issueId: string): Promise<boolean> {
	try {
		const issue = await linearClient.issue(issueId);
		const incomingRelations = await issue.relations();

		const blockedRelations = incomingRelations.nodes.filter(
			relation => relation.type === LinearDocument.IssueRelationType.Blocks
		);

		return blockedRelations.length > 0;
	} catch (error) {
		console.error(`Error checking if issue ${issueId} is blocked:`, error);
		return false;
	}
}

export { linearClient, verifyLinearSignature, addCommentToIssue, createBlockingRelation, isIssueBlocked };
