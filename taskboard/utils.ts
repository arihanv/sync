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
		const targetIssue = await linearClient.issue(issueId);
		const targetInternalId = targetIssue.id;
		
		// Get the team to search for all issues that might block this one
		const team = await targetIssue.team;
		if (!team) {
			console.warn(`No team found for issue ${issueId}`);
			return false;
		}
		
		// Get all issues in the team and check their blocking relationships
		const teamIssues = await team.issues();
		
		for (const teamIssue of teamIssues.nodes) {
			const relations = await teamIssue.relations();
			
			// Check if this issue has a blocking relationship targeting our issue
			const blockingRelations = relations.nodes.filter(
				relation => relation.type === LinearDocument.IssueRelationType.Blocks &&
							relation.relatedIssueId === targetInternalId
			);
			
			if (blockingRelations.length > 0) {
				return true;
			}
		}
		
		return false;
	} catch (error) {
		console.error(`Error checking if issue ${issueId} is blocked:`, error);
		return false;
	}
}

/**
 * Detailed dependency status for task orchestration
 */
interface DependencyStatus {
	isBlocked: boolean;
	blockingTasks: Array<{
		id: string;
		identifier: string;
		title: string;
		state: string;
	}>;
	readyToDispatch: boolean;
}

/**
 * Checks task dependencies and returns detailed status for orchestration
 * @param taskId - The ID of the Linear issue to check
 * @returns Detailed dependency status object
 */
async function checkTaskDependencies(taskId: string): Promise<DependencyStatus> {
	try {
		const targetIssue = await linearClient.issue(taskId);
		const targetInternalId = targetIssue.id;
		
		// Get the team to search for all issues that might block this one
		const team = await targetIssue.team;
		if (!team) {
			console.warn(`No team found for issue ${taskId}`);
			return {
				isBlocked: false,
				blockingTasks: [],
				readyToDispatch: true,
			};
		}
		
		// Get all issues in the team and find ones that block our target issue
		const teamIssues = await team.issues();
		const blockingIssueIds: string[] = [];
		
		for (const teamIssue of teamIssues.nodes) {
			const relations = await teamIssue.relations();
			
			// Check if this issue has a blocking relationship targeting our issue
			const blockingRelations = relations.nodes.filter(
				relation => relation.type === LinearDocument.IssueRelationType.Blocks &&
							relation.relatedIssueId === targetInternalId
			);
			
			if (blockingRelations.length > 0) {
				blockingIssueIds.push(teamIssue.id);
			}
		}

		if (blockingIssueIds.length === 0) {
			return {
				isBlocked: false,
				blockingTasks: [],
				readyToDispatch: true,
			};
		}

		// Get details of blocking tasks
		const blockingTasks = await Promise.all(
			blockingIssueIds.map(async (blockingIssueId) => {
				const blockingIssue = await linearClient.issue(blockingIssueId);
				const state = await blockingIssue.state;
				
				return {
					id: blockingIssue.id,
					identifier: blockingIssue.identifier,
					title: blockingIssue.title,
					state: state?.name || 'Unknown',
				};
			})
		);

		// Check if any blocking tasks are still incomplete
		const incompleteBlockingTasks = blockingTasks.filter(
			task => task.state !== 'Done' && task.state !== 'Complete'
		);

		return {
			isBlocked: incompleteBlockingTasks.length > 0,
			blockingTasks: incompleteBlockingTasks,
			readyToDispatch: incompleteBlockingTasks.length === 0,
		};
	} catch (error) {
		console.error(`Error checking task dependencies for ${taskId}:`, error);
		return {
			isBlocked: true,
			blockingTasks: [],
			readyToDispatch: false,
		};
	}
}

/**
 * Creates a tmux session and runs claude with the given prompt
 * @param prompt - The prompt to send to claude
 * @returns Promise that resolves when the subprocess completes
 */
async function runClaudeInTmux(prompt: string): Promise<void> {
	const sessionName = `claude-${Date.now()}`;
	
	try {
		const proc = Bun.spawn([
			"tmux",
			"new-session",
			"-d",
			"-s",
			sessionName,
			"claude",
			prompt
		], {
			stdio: ["pipe", "pipe", "pipe"]
		});
		
		await proc.exited;
		console.log(`Claude session created in tmux session: ${sessionName}`);
	} catch (error) {
		console.error("Error creating tmux session with claude:", error);
		throw error;
	}
}

/**
 * Attaches to an existing claude-worker tmux session and restarts claude with new prompt
 * All commands are executed on the remote SSH instance
 * @param workerNum - The worker number for the session name (claude-worker-{num})
 * @param prompt - The new prompt to send to claude
 * @returns Promise that resolves when the command is sent
 */
async function attachToClaudeWorker(workerNum: number, prompt: string): Promise<void> {
	const sessionName = `claude-worker-${workerNum}`;
	const sshCommand = "sshpass -p 'modal123' ssh -o ProxyCommand=\"openssl s_client -quiet -connect by3ub7t3766now.r432.modal.host:443\" root@by3ub7t3766now.r432.modal.host";
	
	try {
		// Kill any existing claude process in the session (send Ctrl+C twice for containers)
		await Bun.spawn([
			"bash", "-c",
			`${sshCommand} "tmux send-keys -t ${sessionName} C-c"`
		], {
			stdio: ["pipe", "pipe", "pipe"]
		}).exited;

		// Send second Ctrl+C for container exit
		await Bun.spawn([
			"bash", "-c", 
			`${sshCommand} "tmux send-keys -t ${sessionName} C-c"`
		], {
			stdio: ["pipe", "pipe", "pipe"]
		}).exited;

		// Wait a moment for process to terminate
		await new Promise(resolve => setTimeout(resolve, 200));

		// Send new claude command with prompt on remote instance
		await Bun.spawn([
			"bash", "-c",
			`${sshCommand} "tmux send-keys -t ${sessionName} 'claude --dangerously-skip-permissions \\"${prompt}\\"' Enter"`
		], {
			stdio: ["pipe", "pipe", "pipe"]
		}).exited;

		console.log(`Restarted claude in remote session: ${sessionName}`);
	} catch (error) {
		console.error(`Error attaching to claude worker ${workerNum}:`, error);
		throw error;
	}
}

await attachToClaudeWorker(3, "make a file called test.md");

export { 
	linearClient, 
	verifyLinearSignature, 
	addCommentToIssue, 
	createBlockingRelation, 
	isIssueBlocked, 
	checkTaskDependencies,
	runClaudeInTmux, 
	attachToClaudeWorker 
};

export type { DependencyStatus };
