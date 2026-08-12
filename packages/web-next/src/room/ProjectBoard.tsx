import {
  ProjectSteeringProposalSchema,
  projectBoardSnapshot,
  projectSteeringMutation,
  type Delivery,
  type Member,
  type Message,
  type ProjectMutation,
  type ProjectTask,
} from '@codor/protocol';
import { Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { roomSlice, useClientStore } from '../app/store.js';
import { Chip, IconButton, StatusPill } from '../primitives/primitives.js';
import { memberAccent } from '../primitives/identity.js';
import type { Connection } from '../runtime/ws.js';

type PendingMutation = ProjectMutation extends infer Mutation
  ? Mutation extends ProjectMutation ? Omit<Mutation, 'expected_version'> : never
  : never;

export function ProjectBoard(props: { room: string; connection: Connection; onClose: () => void }) {
  const slice = useClientStore((state) => roomSlice(state, props.room));
  const project = slice.project;
  const retainedMembers = useMemo(() => Object.values(slice.members)
    .filter((member) => member.kind === 'human' || member.kind === 'agent')
    .sort((left, right) => left.handle.localeCompare(right.handle)), [slice.members]);
  const members = useMemo(() => retainedMembers.filter((member) => member.removed_ts === undefined), [retainedMembers]);
  const self = slice.selfMemberId ? slice.members[slice.selfMemberId] : undefined;
  const mutate = (mutation: ProjectMutation): void => props.connection.act({ act: 'project_mutate', mutation });

  return (
    <div className="nx-project" data-testid="project-board">
      {project === undefined ? (
        <>
          <header className="nx-project-head is-empty">
            <div><span className="nx-project-kicker">Canonical project</span><h2>Start a project</h2></div>
            <IconButton icon={X} label="Close project board" onClick={props.onClose} />
          </header>
          <ProjectInit members={members} onSubmit={(input) => mutate({ ...input, op: 'init', expected_version: 0 })} />
        </>
      ) : (
        <ProjectView
          project={project}
          deliveries={Object.values(slice.inbox)}
          members={members}
          messages={Object.values(slice.messages)}
          retainedMembers={retainedMembers}
          self={self}
          onClose={props.onClose}
          mutate={(mutation) => mutate({ ...mutation, expected_version: project.version } as ProjectMutation)}
        />
      )}
    </div>
  );
}

function ProjectInit(props: {
  members: Member[];
  onSubmit(input: Omit<Extract<ProjectMutation, { op: 'init' }>, 'op' | 'expected_version'>): void;
}) {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [coordinator, setCoordinator] = useState(props.members.find((member) => member.kind === 'agent')?.id ?? '');
  return (
    <form className="nx-project-form" onSubmit={(event) => {
      event.preventDefault();
      props.onSubmit({ title, objective, coordinator, guarded_autopilot: false });
    }}>
      <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Objective<textarea required rows={4} value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
      <label>Coordinator<MemberSelect members={props.members} value={coordinator} onChange={setCoordinator} required /></label>
      <button className="nx-btn is-primary" type="submit">Create project</button>
    </form>
  );
}

function ProjectView(props: {
  project: NonNullable<ReturnType<typeof roomSlice>['project']>;
  deliveries: Delivery[];
  members: Member[];
  messages: Message[];
  retainedMembers: Member[];
  self?: Member;
  onClose(): void;
  mutate(mutation: PendingMutation): void;
}) {
  const [activeOnly, setActiveOnly] = useState(false);
  const [mobileView, setMobileView] = useState<'now' | 'board' | 'milestones'>('now');
  const canCoordinate = props.self?.id === props.project.coordinator
    || (props.self?.kind === 'human' && props.self.role === 'owner');
  const complete = props.project.tasks.length > 0 && props.project.tasks.every((task) => task.status === 'done');
  const activeTasks = props.project.tasks.filter((task) => task.status !== 'backlog' && task.status !== 'done');
  const workingTasks = workingBoardTasks(activeTasks, props.deliveries);
  const unlinkedDeliveries = unlinkedAgentWork(props.project.tasks, props.deliveries, props.members);
  const doneCount = props.project.tasks.filter((task) => task.status === 'done').length;
  const progress = props.project.tasks.length === 0 ? 0 : Math.round((doneCount / props.project.tasks.length) * 100);
  const coordinator = props.retainedMembers.find((member) => member.id === props.project.coordinator);
  return (
    <>
      <header className="nx-project-head">
        <div className="nx-project-identity">
          <div className="nx-project-title-line">
            <span className="nx-project-mark" aria-hidden="true" />
            <h2>{props.project.title}</h2>
            <StatusPill tone={props.project.status === 'blocked' ? 'error' : props.project.status === 'completed' ? 'live' : 'neutral'}>{props.project.status.replace('_', ' ')}</StatusPill>
            <span className="nx-project-version">v{props.project.version}</span>
          </div>
          <p>{props.project.objective}</p>
        </div>
        <div className="nx-project-progress" aria-label={`${progress}% complete`}>
          <span><strong>{progress}%</strong> complete</span>
          <small>{doneCount} / {props.project.tasks.length} tasks</small>
          <progress value={doneCount} max={Math.max(props.project.tasks.length, 1)} />
        </div>
        <div className="nx-project-coordinator">
          {coordinator && <Chip name={coordinator.display_name || coordinator.handle} accent={memberAccent(coordinator)} size={36} presence={activeMemberStates.has(coordinator.state ?? 'idle') ? 'live' : 'idle'} surface="raised" />}
          <span><strong>{coordinator ? `@${coordinator.handle}` : 'Unassigned'}</strong><small>Coordinator</small></span>
        </div>
        <label className="nx-project-autopilot">
          <span><strong>Autopilot</strong><small>{props.project.guarded_autopilot ? 'Running' : 'Paused'}</small></span>
          <input type="checkbox" checked={props.project.guarded_autopilot} disabled={!canCoordinate} onChange={(event) => props.mutate({ op: 'set_autopilot', enabled: event.target.checked })} />
        </label>
        <details className="nx-project-menu">
          <summary className="nx-btn">Project actions</summary>
          {canCoordinate && props.project.status !== 'completed' && props.project.status !== 'archived' && (
            <div>
              {props.project.status !== 'active' && <button className="nx-btn" onClick={() => props.mutate({ op: 'set_status', status: 'active' })}>Activate</button>}
              <button className="nx-btn" onClick={() => props.mutate({ op: 'set_status', status: 'blocked' })}>Block project</button>
              <button className="nx-btn is-primary" disabled={!complete} onClick={() => props.mutate({ op: 'set_status', status: 'completed' })}>Complete project</button>
            </div>
          )}
        </details>
        <IconButton icon={X} label="Close project board" onClick={props.onClose} />
      </header>
      <div className="nx-project-toolbar">
        <span>Canonical workflow</span>
        <label className="nx-project-toggle"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Active only</label>
      </div>
      <nav className="nx-project-mobile-nav" aria-label="Board views">
        {(['now', 'board', 'milestones'] as const).map((view) => <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{view === 'now' ? 'Now' : view === 'board' ? 'Board' : 'Milestones'}</button>)}
      </nav>
      <section className={`nx-project-mobile-section ${mobileView === 'now' ? 'is-active' : ''}`} data-mobile-view="now">
        <div className="nx-project-command">
          <WorkingNow tasks={workingTasks} unlinkedDeliveries={unlinkedDeliveries} deliveries={props.deliveries} messages={props.messages} members={props.members} />
          <AgentActivity members={props.members} />
        </div>
      </section>
      <section className={`nx-project-mobile-section ${mobileView === 'board' ? 'is-active' : ''}`} data-mobile-view="board">
        {props.project.milestones.length === 0 ? <p className="nx-project-empty">Add the first milestone to begin.</p> : <div className="nx-project-board" aria-label="Task workflow">
          {taskStatuses.filter((status) => !activeOnly || (status !== 'backlog' && status !== 'done')).map((status) => {
            const tasks = props.project.tasks.filter((task) => task.status === status);
            return (
              <section className={`nx-project-column is-${status}`} key={status} aria-labelledby={`project-column-${status}`}>
                <header><h3 id={`project-column-${status}`}>{taskStatusLabels[status]}</h3><span>{tasks.length}</span></header>
                <div className="nx-project-tasks">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      milestoneTitle={props.project.milestones.find((milestone) => milestone.id === task.milestone_id)?.title}
                      project={props.project}
                      members={props.members}
                      self={props.self}
                      canCoordinate={canCoordinate}
                      mutate={props.mutate}
                    />
                  ))}
                  {tasks.length === 0 && <p className="nx-project-empty">No tasks</p>}
                </div>
              </section>
            );
          })}
        </div>}
        {activeOnly && activeTasks.length === 0 && <p className="nx-project-empty">No ready, active, review, or blocked tasks.</p>}
      </section>
      <section className={`nx-project-mobile-section ${mobileView === 'milestones' ? 'is-active' : ''}`} data-mobile-view="milestones">
        <MilestoneProgress project={props.project} />
      </section>
      <details className="nx-project-planning">
        <summary>Planning tools</summary>
        <ProjectSteeringBridge project={props.project} members={props.members} retainedMembers={props.retainedMembers} canCoordinate={canCoordinate} mutate={props.mutate} />
        {canCoordinate && props.project.status !== 'completed' && props.project.status !== 'archived' && <ProjectComposer project={props.project} members={props.members} mutate={props.mutate} />}
      </details>
    </>
  );
}

const activeMemberStates = new Set(['running', 'queued', 'awaiting_input', 'custody_uncertain']);
const taskAnchor = (task: ProjectTask): string => `project-task-${encodeURIComponent(task.id)}`;
const taskStatuses: ProjectTask['status'][] = ['backlog', 'ready', 'in_progress', 'in_review', 'blocked', 'done'];
const taskStatusLabels: Record<ProjectTask['status'], string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
};

export function workingBoardTasks(tasks: ProjectTask[], deliveries: Delivery[]): ProjectTask[] {
  const deliveryStates = new Map(deliveries.map((delivery) => [delivery.id, delivery.state]));
  return tasks.filter((task) => {
    if (task.status === 'in_progress' || task.status === 'in_review' || task.status === 'blocked') return true;
    if (task.status !== 'ready') return false;
    return task.dispatches?.work.some((dispatch) => dispatch.revision === task.revision
      && ['queued', 'delivering', 'held'].includes(deliveryStates.get(dispatch.delivery_id) ?? '')) ?? false;
  });
}

export function unlinkedAgentWork(tasks: ProjectTask[], deliveries: Delivery[], members: Member[]): Delivery[] {
  const agents = new Set(members.filter((member) => member.kind === 'agent').map((member) => member.id));
  const linked = new Set(tasks.flatMap((task) => [
    ...(task.dispatches?.work.map((dispatch) => dispatch.delivery_id) ?? []),
    ...(task.dispatches?.reviews.map((dispatch) => dispatch.delivery_id) ?? []),
  ]));
  return deliveries.filter((delivery) => delivery.state === 'delivering' && agents.has(delivery.recipient) && !linked.has(delivery.id));
}

function WorkingNow(props: { tasks: ProjectTask[]; unlinkedDeliveries: Delivery[]; deliveries: Delivery[]; messages: Message[]; members: Member[] }) {
  const byId = new Map(props.members.map((member) => [member.id, member]));
  const deliveryById = new Map(props.deliveries.map((delivery) => [delivery.id, delivery]));
  const messageById = new Map(props.messages.map((message) => [message.id, message]));
  const itemCount = props.tasks.length + props.unlinkedDeliveries.length;
  return (
    <section className="nx-project-now" aria-labelledby="project-working-now">
      <header><div><span className="nx-project-kicker">Live Board state</span><h3 id="project-working-now">Working now</h3></div><span>{itemCount} item(s)</span></header>
      {itemCount === 0 ? <p>No Board task or agent delivery is currently active.</p> : (
        <div className="nx-project-now-list">
          {props.tasks.map((task) => {
            const assignee = task.assignee ? byId.get(task.assignee) : undefined;
            const gatekeepers = task.gatekeepers.map((id) => byId.get(id)).filter((member): member is Member => member !== undefined);
            const participants = task.status === 'in_review' ? gatekeepers : assignee ? [assignee] : [];
            const mismatch = task.status === 'in_review' && assignee && activeMemberStates.has(assignee.state ?? 'idle');
            const tone = task.status === 'blocked' ? 'error' : mismatch || task.status === 'in_review' ? 'warn' : 'live';
            const workDelivery = task.dispatches?.work.find((dispatch) => dispatch.revision === task.revision);
            const deliveryState = workDelivery ? deliveryById.get(workDelivery.delivery_id)?.state : undefined;
            const statusLabel = task.status === 'ready' && deliveryState
              ? deliveryState === 'delivering' ? 'starting' : deliveryState
              : task.status.replace('_', ' ');
            return (
              <button className={`nx-project-now-item is-${task.status}`} key={task.id} type="button" onClick={() => document.getElementById(taskAnchor(task))?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <span><StatusPill tone={tone}>{statusLabel}</StatusPill></span>
                <span className="nx-project-now-copy"><strong>{task.id} — {task.title}</strong><small>{task.status === 'in_review' ? 'Review by' : 'Working agent'}: {participants.length > 0 ? participants.map((member) => `@${member.handle} · ${member.state ?? 'idle'}`).join(', ') : 'unassigned'}</small>{mismatch && <small className="is-warning">State mismatch: @{assignee.handle} is {assignee.state} while this task is marked in review.</small>}</span>
                <span>Jump to task</span>
              </button>
            );
          })}
          {props.unlinkedDeliveries.map((delivery) => {
            const recipient = byId.get(delivery.recipient);
            const source = messageById.get(delivery.message_id);
            return (
              <article className="nx-project-now-item is-unlinked" key={delivery.id}>
                <span><StatusPill tone="warn">outside Board</StatusPill></span>
                <span className="nx-project-now-copy"><strong>@{recipient?.handle ?? 'agent'} is working</strong><small>{source?.body ?? `Delivery ${delivery.id}`}</small><small className="is-warning">This live assignment is not linked to a Board task.</small></span>
                <span>Live chat work</span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgentActivity(props: { members: Member[] }) {
  const agents = [...props.members]
    .filter((member) => member.kind === 'agent')
    .sort((left, right) => Number(activeMemberStates.has(right.state ?? 'idle')) - Number(activeMemberStates.has(left.state ?? 'idle')) || left.handle.localeCompare(right.handle));
  return (
    <aside className="nx-project-agents" aria-labelledby="project-agent-activity">
      <header><h3 id="project-agent-activity">Agent activity</h3><span>{agents.filter((member) => activeMemberStates.has(member.state ?? 'idle')).length} active</span></header>
      {agents.length === 0 ? <p>No agents in this channel.</p> : agents.map((member) => {
        const active = activeMemberStates.has(member.state ?? 'idle');
        return (
          <div className="nx-project-agent" key={member.id}>
            <Chip name={member.display_name || member.handle} accent={memberAccent(member)} size={30} presence={active ? 'live' : member.state === 'dead' ? 'error' : 'idle'} surface="raised" />
            <span><strong>@{member.handle}</strong><small>{member.state?.replace('_', ' ') ?? 'idle'}</small></span>
          </div>
        );
      })}
    </aside>
  );
}

function MilestoneProgress(props: { project: NonNullable<ReturnType<typeof roomSlice>['project']> }) {
  return (
    <section className="nx-project-milestones" aria-labelledby="project-milestones">
      <header><div><span className="nx-project-kicker">Delivery path</span><h3 id="project-milestones">Milestones</h3></div><span>{props.project.milestones.length} total</span></header>
      <div>
        {props.project.milestones.map((milestone, index) => {
          const tasks = props.project.tasks.filter((task) => task.milestone_id === milestone.id);
          const done = tasks.filter((task) => task.status === 'done').length;
          const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);
          return (
            <article key={milestone.id}>
              <span>{index + 1}</span>
              <div><strong>{milestone.title}</strong><small>{done} / {tasks.length} tasks · {percent}%</small><progress aria-label={`${milestone.title} ${percent}% complete`} value={done} max={Math.max(tasks.length, 1)} /></div>
            </article>
          );
        })}
        {props.project.milestones.length === 0 && <p className="nx-project-empty">No milestones yet.</p>}
      </div>
    </section>
  );
}

function ProjectSteeringBridge(props: {
  project: NonNullable<ReturnType<typeof roomSlice>['project']>;
  members: Member[];
  retainedMembers: Member[];
  canCoordinate: boolean;
  mutate(mutation: PendingMutation): void;
}) {
  const [proposalText, setProposalText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [applying, setApplying] = useState<number>();
  const packet = useMemo(() => JSON.stringify(projectBoardSnapshot(props.project, props.retainedMembers), null, 2), [props.project, props.retainedMembers]);
  useEffect(() => {
    if (applying !== undefined && props.project.steering?.proposal_version === applying) {
      setFeedback(`Applied proposal ${applying}. Board is now v${props.project.version}.`);
      setApplying(undefined);
    }
  }, [applying, props.project.steering?.proposal_version, props.project.version]);
  const parse = () => {
    const proposal = ProjectSteeringProposalSchema.parse(JSON.parse(proposalText));
    if (proposal.based_on_board_version !== props.project.version) {
      throw new Error(`This proposal targets Board v${proposal.based_on_board_version}; export current v${props.project.version} and ask Pro to revise it.`);
    }
    return { proposal, mutation: projectSteeringMutation(proposal, props.members) };
  };
  const preview = (): void => {
    try {
      const { proposal } = parse();
      const existing = new Set(props.project.tasks.map((task) => task.id));
      const additions = proposal.tasks.filter((task) => !existing.has(task.id)).length;
      const updates = proposal.tasks.length - additions;
      setFeedback(`Valid proposal ${proposal.proposal_version}: ${additions} new and ${updates} existing task(s). Applying is atomic; unsafe active-work edits will be rejected.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  };
  const apply = (): void => {
    try {
      const { proposal, mutation } = parse();
      const { expected_version: _expected, ...pending } = mutation;
      props.mutate(pending as PendingMutation);
      setApplying(proposal.proposal_version);
      setFeedback(`Applying proposal ${proposal.proposal_version}…`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <details className="nx-project-steering" data-testid="project-steering-bridge">
      <summary>Pro steering bridge</summary>
      <p>Copy this credential-free Board packet to Pro. Ask Pro to return only the edited <code>pro_steering_template</code> JSON object.</p>
      <div className="nx-project-actions">
        <button className="nx-btn" type="button" onClick={() => {
          void navigator.clipboard.writeText(packet).then(
            () => setFeedback(`Copied Board v${props.project.version} for Pro.`),
            () => setFeedback('Clipboard access failed. Select the packet below and copy it manually.'),
          );
        }}>Copy Board packet</button>
      </div>
      <textarea aria-label="Board packet for Pro" readOnly rows={6} value={packet} />
      {props.project.steering && <small>Last applied: proposal {props.project.steering.proposal_version}, based on Board v{props.project.steering.based_on_board_version}.</small>}
      {props.canCoordinate && (
        <>
          <label>Pro proposal<textarea data-testid="pro-steering-input" rows={8} placeholder='{"format":"codor.pro-steering.v1",…}' value={proposalText} onChange={(event) => {
            setProposalText(event.target.value);
            setFeedback('');
          }} /></label>
          <div className="nx-project-actions">
            <button className="nx-btn" type="button" disabled={!proposalText.trim()} onClick={preview}>Preview</button>
            <button className="nx-btn is-primary" type="button" disabled={!proposalText.trim()} onClick={apply}>Apply atomically</button>
          </div>
        </>
      )}
      {feedback && <p role="status">{feedback}</p>}
    </details>
  );
}

function TaskCard(props: {
  task: ProjectTask;
  milestoneTitle?: string;
  project: NonNullable<ReturnType<typeof roomSlice>['project']>;
  members: Member[];
  self?: Member;
  canCoordinate: boolean;
  mutate(mutation: PendingMutation): void;
}) {
  const [assignee, setAssignee] = useState(props.task.assignee ?? '');
  const [note, setNote] = useState('');
  const assigned = props.members.find((member) => member.id === props.task.assignee);
  const canSubmit = props.self?.id === props.task.assignee || (props.self?.kind === 'human' && props.self.role === 'owner');
  const canReview = props.task.gatekeepers.includes(props.self?.id ?? '') || (props.self?.kind === 'human' && props.self.role === 'owner');
  return (
    <article id={taskAnchor(props.task)} className={`nx-project-task is-${props.task.status}`} data-testid={`project-task-${props.task.id}`}>
      <header>
        <span className="nx-project-check" aria-label={props.task.status === 'done' ? 'Completed' : props.task.status}>
          {props.task.status === 'done' ? <Check size={14} /> : props.task.revision}
        </span>
        <div><strong>{props.task.title}</strong><span>{props.task.id} · {props.task.status.replace('_', ' ')}</span></div>
        {assigned && <Chip name={assigned.display_name || assigned.handle} accent={memberAccent(assigned)} size={28} />}
      </header>
      <p>{props.task.description}</p>
      <div className="nx-project-task-meta">
        {props.milestoneTitle && <span>{props.milestoneTitle}</span>}
        {assigned && <span>@{assigned.handle}</span>}
        {props.task.gatekeepers.length > 0 && <span>{props.task.gatekeepers.length} gate(s)</span>}
      </div>
      <details className="nx-project-task-detail">
        <summary>View details</summary>
        <h4>Acceptance criteria</h4>
        <ul>{props.task.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
        {props.task.dependencies.length > 0 && <small>Depends on: {props.task.dependencies.join(', ')}</small>}
        {props.task.evidence.length > 0 && (
          <details><summary>{props.task.evidence.length} evidence item(s)</summary><ul>
            {props.task.evidence.map((evidence, index) => (
              <li key={index}>{evidence.type === 'commit'
                ? <>Verified Git commit at submission: <code>{evidence.sha}</code></>
                : <code>{JSON.stringify(evidence)}</code>}
              </li>
            ))}
          </ul></details>
        )}
      </details>
      {props.canCoordinate && props.task.status !== 'done' && (
        <div className="nx-project-inline">
          <MemberSelect members={props.members.filter((member) => member.kind === 'agent')} value={assignee} onChange={setAssignee} />
          <button className="nx-btn" disabled={!assignee || assignee === props.task.assignee} onClick={() => props.mutate({ op: 'assign', task_id: props.task.id, assignee })}>Assign</button>
        </div>
      )}
      {props.task.status !== 'done' && (canSubmit || props.canCoordinate) && (
        <div className="nx-project-inline">
          <input aria-label={`Evidence or blocking note for ${props.task.title}`} placeholder="Evidence or blocking note" value={note} onChange={(event) => setNote(event.target.value)} />
          {canSubmit && <button className="nx-btn is-primary" disabled={!note.trim()} onClick={() => {
            props.mutate({ op: 'submit', task_id: props.task.id, evidence: [{ type: 'note', text: note }] });
            setNote('');
          }}>Submit</button>}
          <button className="nx-btn" disabled={!note.trim()} onClick={() => {
            props.mutate({ op: 'block', task_id: props.task.id, note });
            setNote('');
          }}>Block</button>
        </div>
      )}
      {props.task.status === 'in_review' && canReview && (
        <div className="nx-project-actions">
          <button className="nx-btn" onClick={() => props.mutate({ op: 'review', task_id: props.task.id, decision: 'changes_requested' })}>Request changes</button>
          <button className="nx-btn is-primary" onClick={() => props.mutate({ op: 'review', task_id: props.task.id, decision: 'approved' })}>Approve</button>
        </div>
      )}
    </article>
  );
}

function ProjectComposer(props: {
  project: NonNullable<ReturnType<typeof roomSlice>['project']>;
  members: Member[];
  mutate(mutation: PendingMutation): void;
}) {
  const [milestoneId, setMilestoneId] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [taskMilestone, setTaskMilestone] = useState(props.project.milestones[0]?.id ?? '');
  const [assignee, setAssignee] = useState('');
  const [gatekeeper, setGatekeeper] = useState('');
  const selectedMilestone = taskMilestone || props.project.milestones[0]?.id || '';
  return (
    <div className="nx-project-compose">
      <form onSubmit={(event) => {
        event.preventDefault();
        props.mutate({ op: 'add_milestone', id: milestoneId, title: milestoneTitle });
        setMilestoneId(''); setMilestoneTitle('');
      }}>
        <h3>Add milestone</h3>
        <label>ID<input required value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)} /></label>
        <label>Title<input required value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} /></label>
        <button className="nx-btn" type="submit"><Plus size={14} /> Milestone</button>
      </form>
      {props.project.milestones.length > 0 && (
        <form onSubmit={(event) => {
          event.preventDefault();
          props.mutate({
            op: 'add_task', id: taskId, milestone_id: selectedMilestone, title, description,
            acceptance_criteria: acceptance.split('\n').map((line) => line.trim()).filter(Boolean),
            dependencies: [], ...(assignee && { assignee }),
            gatekeepers: gatekeeper ? [gatekeeper] : [], workspace_mode: gatekeeper ? 'write' : 'read_only',
          });
          setTaskId(''); setTitle(''); setDescription(''); setAcceptance('');
        }}>
          <h3>Add task</h3>
          <label>Milestone<select value={selectedMilestone} onChange={(event) => setTaskMilestone(event.target.value)}>{props.project.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>
          <label>ID<input required value={taskId} onChange={(event) => setTaskId(event.target.value)} /></label>
          <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Description<textarea required rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Acceptance criteria<textarea required rows={3} placeholder="One criterion per line" value={acceptance} onChange={(event) => setAcceptance(event.target.value)} /></label>
          <label>Assignee<MemberSelect members={props.members.filter((member) => member.kind === 'agent')} value={assignee} onChange={setAssignee} /></label>
          <label>Gatekeeper<MemberSelect members={props.members} value={gatekeeper} onChange={setGatekeeper} /></label>
          <button className="nx-btn is-primary" type="submit"><Plus size={14} /> Task</button>
        </form>
      )}
    </div>
  );
}

function MemberSelect(props: { members: Member[]; value: string; onChange(value: string): void; required?: boolean }) {
  return (
    <select required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
      <option value="">Select member</option>
      {props.members.map((member) => <option key={member.id} value={member.id}>@{member.handle}</option>)}
    </select>
  );
}
