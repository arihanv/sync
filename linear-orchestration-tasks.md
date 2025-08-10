# Linear Orchestration System - Task Breakdown

## Project: Claude Code Orchestration System

### Core Infrastructure Tasks (Independent)

#### HAR-ORH-1: Dependency Checker Utility
**Description**: Create utility function to check Linear task dependencies
**Acceptance Criteria**:
- Extend `taskboard/utils.ts` with `checkTaskDependencies(taskId)` function  
- Use existing `isIssueBlocked()` to determine if task has incomplete dependencies
- Return clear status object: `{ isBlocked: boolean, blockingTasks: string[] }`
- Add unit test to verify dependency detection
**Estimated Effort**: 2-3 hours
**Files**: `taskboard/utils.ts`

#### HAR-ORH-2: Changelog Reader Utility  
**Description**: Create utility to extract recent changelog entries for context
**Acceptance Criteria**:
- Create `readChangelogContext()` function in `taskboard/utils.ts`
- Parse `changelog.md` and return recent entries (last 10 or 30 days)
- Format output for inclusion in Claude prompts
- Handle missing/malformed changelog gracefully
- Add usage example in docstring
**Estimated Effort**: 2 hours
**Files**: `taskboard/utils.ts`

#### HAR-ORH-3: Worker Pool State Manager
**Description**: Create class to manage Claude worker session states
**Acceptance Criteria**:
- Create `WorkerPool` class with worker status tracking (idle/busy/failed)
- Support configurable pool size (default 4 workers)
- Methods: `getAvailableWorker()`, `markWorkerBusy()`, `markWorkerIdle()`
- Worker status includes: current task, last activity timestamp
- In-memory implementation (no persistence needed yet)
**Estimated Effort**: 3 hours  
**Files**: `taskboard/worker-pool.ts` (new file)

#### HAR-ORH-4: Tmux Session Query Utilities
**Description**: Create functions to interact with tmux claude-worker sessions
**Acceptance Criteria**:
- `getTmuxSessions()` - list all claude-worker sessions with status
- `getWorkerOutput(workerNum)` - capture recent output from specific worker
- `checkWorkerHealth(workerNum)` - verify worker session is responsive
- Handle tmux errors gracefully (session not found, etc.)
- Return structured data, not raw tmux output
**Estimated Effort**: 3 hours
**Files**: `taskboard/tmux-utils.ts` (new file)

#### HAR-ORH-5: Task Queue Manager
**Description**: Create queue classes for ready and blocked task management
**Acceptance Criteria**:
- `TaskQueue` class for ready tasks (FIFO)
- `BlockedTaskQueue` class for dependency-waiting tasks  
- Methods: `add()`, `remove()`, `peek()`, `list()`, `size()`
- Priority support for ready queue (Urgent > High > Normal > Low)
- Task deduplication (no duplicate task IDs in queues)
**Estimated Effort**: 2-3 hours
**Files**: `taskboard/task-queues.ts` (new file)

### Integration Tasks (Build on Core)

#### HAR-ORH-6: Enhanced Task Dispatcher
**Description**: Orchestrate full task dispatch flow with dependency checking
**Acceptance Criteria**:
- Create `dispatchLinearTask(task, workerNum)` function
- Use dependency checker to validate task can run
- Include changelog context in Claude prompts
- Handle blocked tasks by adding to blocked queue
- Post dispatch confirmation comment to Linear issue
- Integration with all core utilities (tasks 1-5)
**Estimated Effort**: 4 hours
**Dependencies**: Requires HAR-ORH-1, HAR-ORH-2, HAR-ORH-3, HAR-ORH-5
**Files**: `taskboard/task-dispatcher.ts` (new file)

#### HAR-ORH-7: Linear Webhook Handler Enhancement
**Description**: Process Linear events and trigger task orchestration
**Acceptance Criteria**:
- Extend existing webhook in `taskboard/server.ts`
- Handle task creation events (dispatch to available workers)
- Handle task completion events (resolve dependencies, dispatch blocked tasks)
- Handle task status changes (PM approval workflow)
- Use enhanced task dispatcher from HAR-ORH-6
- Error handling and logging for webhook failures
**Estimated Effort**: 4 hours
**Dependencies**: Requires HAR-ORH-6
**Files**: `taskboard/server.ts`

#### HAR-ORH-8: Terminal Monitoring UI  
**Description**: Create blessed.js dashboard for worker and queue monitoring
**Acceptance Criteria**:
- Grid layout showing: Ready Queue, Blocked Queue, Active Workers
- Real-time worker status (idle/busy with current task)
- Live session output streaming from tmux
- Keyboard navigation between panes
- Manual worker restart capability
- Uses tmux utilities from HAR-ORH-4
**Estimated Effort**: 5-6 hours
**Dependencies**: Requires HAR-ORH-3, HAR-ORH-4, HAR-ORH-5  
**Files**: `taskboard/monitor-ui.ts` (new file)

## Implementation Order

**Phase 1** (Parallel): HAR-ORH-1, HAR-ORH-2, HAR-ORH-3, HAR-ORH-4, HAR-ORH-5
**Phase 2** (Sequential): HAR-ORH-6 → HAR-ORH-7, HAR-ORH-8

## Success Criteria

- All utilities have basic unit tests
- Integration tasks successfully use core utilities  
- System can dispatch tasks and respect dependencies
- Monitoring UI provides real-time visibility
- Changelog integration prevents duplicate functionality