# Linear-to-Claude Code Automation System

## Project Overview

Automated orchestration system that receives Linear task events and dispatches them to existing Claude worker tmux sessions, featuring real-time monitoring and worker pool management.

**Goal:** Minimize delay between PMs defining projects and developers executing them.

## Architecture (Leveraging Existing Infrastructure)

### Existing Foundation ✅
- **Claude Workers**: Pre-existing `attachToClaudeWorker()` function for task dispatch
- **Tmux Sessions**: Session isolation via `claude-worker-{num}` sessions
- **Linear Integration**: Full Linear SDK client with webhook verification
- **Task Management**: Comment/blocking utilities for progress tracking

### New Components to Build

**1. Task Dispatcher**
- Receives Linear task events from existing webhooks
- Uses existing `attachToClaudeWorker()` to dispatch tasks
- Worker pool allocation and task queuing
- Linear progress updates via existing comment system

**2. Worker Pool Manager**
- Manages pool of existing tmux sessions (`claude-worker-1`, `claude-worker-2`, etc.)
- Worker status tracking (idle/busy/failed)
- Load balancing and queue management
- Worker health monitoring

**3. Tmux Session Monitor UI**
- Real-time monitoring of existing tmux sessions
- Worker status dashboard
- Session output streaming
- Manual intervention capabilities (attach/restart)

### Dependency-Aware Data Flow
```
Linear Task Creation → Webhook → Dependency Check → Task Dispatcher → Claude Worker → Linear
                                      ↓                                                ↑
                              Blocked Task Queue                            Task Completion
                                      ↑                                                ↓
                              Dependency Resolution ← Task Complete ← PM Approval ← Linear
```

**Flow Logic**:
1. **Task Creation** → Webhook receives Linear task
2. **Dependency Check** → Use existing `isIssueBlocked()` to check dependencies
3. **Dispatch or Queue** → If unblocked → dispatch to worker, if blocked → add to blocked queue
4. **Task Completion** → PM marks Linear task complete
5. **Dependency Resolution** → Check blocked queue for newly unblocked tasks
6. **Auto-Dispatch** → Automatically dispatch unblocked tasks to available workers

## Implementation Plan (Revised)

### Phase 1: Task Dispatcher & Worker Pool (Days 1-3)

#### Day 1: Core Task Dispatcher
- [ ] Create `dispatchLinearTask()` function using existing `attachToClaudeWorker()`
- [ ] Implement `readChangelogContext()` for codebase knowledge sharing
- [ ] Extend existing webhook handler to process Linear task events
- [ ] Task prompt formatting with Linear context + changelog integration
- [ ] Basic task-to-worker assignment

#### Day 2: Worker Pool Manager
- [ ] Build `WorkerPool` class to manage tmux session states
- [ ] Worker availability tracking (idle/busy/failed)
- [ ] Queue system for when all workers are busy
- [ ] Integration with existing tmux session utilities

#### Day 3: Linear Integration & Dependency Management
- [ ] Use existing Linear client for progress updates
- [ ] Implement dependency checking using existing `isIssueBlocked()` function
- [ ] Blocked task queue management system
- [ ] Webhook handler for Linear status changes (Todo → In Progress → Complete)
- [ ] Worker cleanup and dependency resolution when PM marks task as complete
- [ ] Automatic unblocking and dispatch of dependent tasks
- [ ] Error handling and retry logic

### Phase 2: Tmux Session Monitoring (Days 4-6)

#### Day 4: Session Discovery
- [ ] `getTmuxSessions()` function to list active claude-worker sessions
- [ ] Worker health checking and status detection
- [ ] Session output capture and parsing
- [ ] Basic session restart functionality

#### Day 5: Terminal UI Dashboard
- [ ] Grid layout showing all worker sessions
- [ ] Real-time worker status indicators
- [ ] Queue display with pending tasks
- [ ] Worker utilization metrics

#### Day 6: Interactive Controls
- [ ] Manual session attach/detach capabilities
- [ ] Worker restart and recovery controls
- [ ] Task reassignment between workers
- [ ] Session log viewing and export

### Phase 3: Production Features (Days 7-10)

#### Day 7-8: Advanced Features
- [ ] Priority-based task scheduling
- [ ] Worker load balancing
- [ ] Automatic worker scaling (create new sessions as needed)
- [ ] Task timeout and failure handling

#### Day 9-10: Polish & Documentation
- [ ] Configuration file for worker pool size and settings
- [ ] Error monitoring and alerting
- [ ] Usage documentation and deployment guide
- [ ] Integration tests with existing taskboard system

## Technical Specifications

### Task Dispatcher (Building on Existing Utils)
```typescript
// Extend existing taskboard/utils.ts
async function dispatchLinearTask(task: LinearTask, workerNum: number): Promise<void> {
  // Check if task is blocked by incomplete dependencies
  const isBlocked = await isIssueBlocked(task.id);
  if (isBlocked) {
    await addCommentToIssue(task.id, `⏸️ Task blocked by incomplete dependencies - will retry when dependencies are resolved`);
    // Add to dependency-waiting queue instead of failing
    addToBlockedQueue(task);
    return;
  }
  
  // Read existing changelog to understand available tools/functions
  const changelog = await readChangelogContext();
  
  const prompt = `
    Linear Task: ${task.title} (${task.identifier})
    Description: ${task.description}
    Priority: ${task.priority}
    Project: ${task.project?.name}
    
    EXISTING CODEBASE CONTEXT:
    ${changelog}
    
    Please implement this task. Use /git commands to create branch: linear-${task.identifier}
    
    IMPORTANT: 
    1. Review the changelog above to understand what tools/functions already exist
    2. Leverage existing utilities instead of recreating functionality
    3. Post progress updates to Linear as you work:
       - When you start a major step, comment with your plan
       - When you encounter issues or need clarification, ask questions
       - When you complete significant milestones, share what was accomplished
       - When you think the task is ready, comment "✅ Task complete - ready for PM review"
    4. Update changelog.md with your changes when complete:
       - Document new functions/utilities you create
       - Explain how other agents can use your work
       - Include usage examples and integration points
    
    The PM will review your work and mark the Linear task as "Complete" when satisfied.
    Do NOT mark the task complete yourself - wait for PM approval.
  `;
  
  await attachToClaudeWorker(workerNum, prompt);
  await addCommentToIssue(task.id, `🤖 Dispatched to claude-worker-${workerNum}`);
}

async function readChangelogContext(): Promise<string> {
  try {
    const changelogPath = './changelog.md';
    const changelog = await Bun.file(changelogPath).text();
    
    // Extract recent entries (last 10 or recent 30 days) for context
    const entries = changelog.split('###').slice(-10);
    return `Recent codebase changes and available utilities:\n${entries.join('###')}`;
  } catch (error) {
    return 'No changelog found - you may be working on a new codebase.';
  }
}

// Handle Linear webhook events for status changes
async function handleLinearStatusChange(event: LinearWebhookEvent): Promise<void> {
  if (event.type === 'Issue' && event.action === 'update') {
    const { data } = event;
    
    // Check if status changed to "Complete"
    if (data.state?.name === 'Done' || data.state?.name === 'Complete') {
      await handleTaskCompletion(data.id);
    }
    
    // Check if task was moved back to "In Progress" (rework needed)
    if (data.state?.name === 'In Progress' && data.previousState?.name === 'Done') {
      await handleTaskRework(data.id);
    }
  }
}

async function handleTaskCompletion(taskId: string): Promise<void> {
  // Find worker handling this task and mark as idle
  const worker = findWorkerByTask(taskId);
  if (worker) {
    await addCommentToIssue(taskId, `✅ Task approved by PM - claude-worker-${worker.num} is now available`);
    markWorkerIdle(worker.num);
    
    // Check if this task completion unblocks any waiting tasks
    await checkForUnblockedTasks(taskId);
    
    // Process next queued task
    processNextQueuedTask();
  }
}

// New dependency management functions
const blockedTaskQueue = new Map<string, LinearTask>();

async function addToBlockedQueue(task: LinearTask): Promise<void> {
  blockedTaskQueue.set(task.id, task);
  console.log(`Task ${task.identifier} added to blocked queue`);
}

async function checkForUnblockedTasks(completedTaskId: string): Promise<void> {
  // Check all blocked tasks to see if any can now proceed
  for (const [taskId, task] of blockedTaskQueue) {
    const stillBlocked = await isIssueBlocked(taskId);
    if (!stillBlocked) {
      // Task is now unblocked, move to main queue
      blockedTaskQueue.delete(taskId);
      await addCommentToIssue(taskId, `🚀 Dependencies resolved - task now ready for dispatch`);
      
      // Try to assign to available worker
      const workerPool = getWorkerPool();
      await workerPool.assignTask(task);
    }
  }
}
```

### Worker Pool Manager
```typescript
interface WorkerStatus {
  status: 'idle' | 'busy' | 'failed';
  currentTask?: string;
  lastActivity?: Date;
}

class WorkerPool {
  private workers = new Map<number, WorkerStatus>();
  private taskQueue: LinearTask[] = [];
  
  constructor(size = 4) {
    for (let i = 1; i <= size; i++) {
      this.workers.set(i, { status: 'idle' });
    }
  }
  
  async assignTask(task: LinearTask): Promise<boolean> {
    const workerNum = this.getNextAvailableWorker();
    if (workerNum) {
      await dispatchLinearTask(task, workerNum);
      this.workers.set(workerNum, { 
        status: 'busy', 
        currentTask: task.identifier,
        lastActivity: new Date()
      });
      return true;
    }
    
    this.taskQueue.push(task);
    return false; // Queued
  }
}
```

### Tmux Session Integration
```typescript
async function getTmuxSessions(): Promise<TmuxSession[]> {
  const proc = Bun.spawn([
    "tmux", "list-sessions", "-F", 
    "#{session_name}:#{?session_attached,attached,not_attached}"
  ]);
  const output = await new Response(proc.stdout).text();
  
  return output.trim().split('\n')
    .filter(line => line.includes('claude-worker-'))
    .map(line => {
      const [name, status] = line.split(':');
      const workerNum = parseInt(name.split('-')[2]);
      return { name, workerNum, active: status === 'attached' };
    });
}

async function getWorkerOutput(workerNum: number): Promise<string> {
  const proc = Bun.spawn([
    "tmux", "capture-pane", "-t", `claude-worker-${workerNum}`, "-p"
  ]);
  return await new Response(proc.stdout).text();
}
```

### Session Lifecycle (Human-in-the-Loop)
1. **Dispatch**: Use existing `attachToClaudeWorker()` with formatted prompt including progress update instructions
2. **Work**: Claude implements task while posting progress comments to Linear
3. **Ready**: Claude posts "✅ Task complete - ready for PM review" comment
4. **Review**: PM reviews Claude's work in git branch and Linear comments
5. **Approve**: PM moves Linear task status to "Complete"
6. **Cleanup**: Webhook triggers worker cleanup, marks worker as idle, processes next queued task

### Progress Update Examples
```typescript
// Claude will be instructed to post comments like:
await addCommentToIssue(taskId, "🏗️ Starting implementation - created branch linear-HAR-123");
await addCommentToIssue(taskId, "🔍 Found existing `createBlockingRelation` utility in taskboard/utils.ts - will leverage this");
await addCommentToIssue(taskId, "📝 Completed user model, now working on authentication endpoints");
await addCommentToIssue(taskId, "⚠️ Need clarification: Should password reset emails be HTML or plain text?");
await addCommentToIssue(taskId, "🧪 All tests passing, ready for code review");
await addCommentToIssue(taskId, "📚 Updated changelog.md with new `validateUserInput()` utility for future agents");
await addCommentToIssue(taskId, "✅ Task complete - ready for PM review");
```

### Changelog Knowledge Sharing System

**Purpose**: Enable Claude instances to build on each other's work instead of duplicating functionality.

**Integration Points**:
1. **Task Dispatch**: Every Claude worker receives recent changelog entries in their prompt
2. **Work Completion**: Workers required to document new utilities/functions they create
3. **Context Building**: Changelog serves as growing institutional memory of codebase capabilities

**Changelog Entry Format** (extending existing pattern):
```markdown
### **Date**: YYYY-MM-DD HH:MM
**Agent**: claude-worker-{num}
**Changes**: Brief description of what was modified
- **Created**: New functions/utilities with usage examples
- **Enhanced**: Improvements to existing functionality  
- **Integration**: How other agents can leverage this work
- **Status**: Current state and next steps
```

**Benefits**:
- ✅ **Prevents Duplicate Work**: Workers check existing utilities before creating new ones
- ✅ **Accelerates Development**: Workers can build on previous agents' contributions
- ✅ **Maintains Code Quality**: Consistent patterns and reusable utilities
- ✅ **Knowledge Persistence**: Institutional memory survives across different worker sessions

### Multi-Terminal Layout with Dependency Status
```
┌─ Ready (2) ──┬─ Session 1: HAR-123 ──┬─ Session 2: HAR-124 ─┐
│ HAR-125      │ > Implementing auth   │ > Running tests     │
│ HAR-126      │ ✅ Created models     │ ⚠️  Test failures   │
├─ Blocked (2)─┼───────────────────────┼─────────────────────┤
│ HAR-127 ⏸️   │ Session 3: HAR-129    │ Session 4: HAR-130  │
│ HAR-128 ⏸️   │ > Analyzing codebase  │ > Waiting for deps  │
└──────────────┤ 🔍 Found 3 issues    │ ⏳ Queue position 1 │
               └───────────────────────┴─────────────────────┘
```

**Queue Management Strategy**:

1. **Ready Queue**: Tasks with no blocking dependencies, ready for immediate dispatch
2. **Blocked Queue**: Tasks waiting for dependencies, not assigned to workers
3. **Active Workers**: Currently executing tasks
4. **Dependency Resolution**: When tasks complete, check blocked queue for newly unblocked tasks

**Benefits**:
- ✅ **No Wasted Cycles**: Workers only get tasks they can actually complete
- ✅ **Automatic Flow**: Tasks automatically move from blocked → ready → active as dependencies resolve
- ✅ **Clear Visibility**: Dashboard shows why tasks are waiting
- ✅ **Efficient Resource Usage**: Workers stay busy with actionable tasks

## Technology Stack (Revised)

- **Runtime**: Bun (existing infrastructure)
- **Backend**: TypeScript (extending existing taskboard/utils.ts)
- **Session Management**: Tmux (existing claude-worker sessions)
- **Process Control**: Bun.spawn for tmux commands
- **Terminal UI**: blessed.js for monitoring dashboard
- **Integration**: Existing Linear SDK + webhook infrastructure
- **Queue**: In-memory Map/Array structures
- **Monitoring**: Tmux session polling + output parsing

## Success Metrics

- **Latency**: < 10 seconds from webhook to worker dispatch (vs 30s before)
- **Throughput**: 4+ concurrent workers with existing hardware
- **Reliability**: 90%+ task dispatch success rate
- **Visibility**: Real-time worker status and output monitoring
- **Recovery**: Automatic worker restart and task reassignment

## Future Enhancements

- Web-based dashboard alternative to terminal UI
- Integration with additional project management tools
- Advanced session optimization and resource management
- Machine learning for task complexity estimation
- Distributed execution across multiple machines