import type { Member, ProjectMutation, ProjectTask } from '@codor/protocol';
import { Check, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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
  const members = useMemo(() => Object.values(slice.members)
    .filter((member) => member.removed_ts === undefined && (member.kind === 'human' || member.kind === 'agent'))
    .sort((left, right) => left.handle.localeCompare(right.handle)), [slice.members]);
  const self = slice.selfMemberId ? slice.members[slice.selfMemberId] : undefined;
  const mutate = (mutation: ProjectMutation): void => props.connection.act({ act: 'project_mutate', mutation });

  return (
    <div className="nx-project" data-testid="project-board">
      <header className="nx-project-head">
        <div>
          <span className="nx-project-kicker">Canonical project</span>
          <h2>{project?.title ?? 'Start a project'}</h2>
          {project && <p>{project.objective}</p>}
        </div>
        <IconButton icon={X} label="Close project board" onClick={props.onClose} />
      </header>
      {project === undefined ? (
        <ProjectInit members={members} onSubmit={(input) => mutate({ ...input, op: 'init', expected_version: 0 })} />
      ) : (
        <ProjectView
          project={project}
          members={members}
          self={self}
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
  members: Member[];
  self?: Member;
  mutate(mutation: PendingMutation): void;
}) {
  const canCoordinate = props.self?.id === props.project.coordinator
    || (props.self?.kind === 'human' && props.self.role === 'owner');
  const complete = props.project.tasks.length > 0 && props.project.tasks.every((task) => task.status === 'done');
  return (
    <>
      <div className="nx-project-meta">
        <StatusPill tone={props.project.status === 'blocked' ? 'error' : props.project.status === 'completed' ? 'live' : 'neutral'}>
          {props.project.status.replace('_', ' ')}
        </StatusPill>
        <span>v{props.project.version}</span>
        <span>{props.project.tasks.filter((task) => task.status === 'done').length}/{props.project.tasks.length} done</span>
        <label className="nx-project-toggle">
          <input
            type="checkbox"
            checked={props.project.guarded_autopilot}
            disabled={!canCoordinate}
            onChange={(event) => props.mutate({ op: 'set_autopilot', enabled: event.target.checked })}
          /> Guarded autopilot
        </label>
      </div>
      {canCoordinate && props.project.status !== 'completed' && props.project.status !== 'archived' && (
        <div className="nx-project-actions">
          {props.project.status !== 'active' && <button className="nx-btn" onClick={() => props.mutate({ op: 'set_status', status: 'active' })}>Activate</button>}
          <button className="nx-btn" onClick={() => props.mutate({ op: 'set_status', status: 'blocked' })}>Block project</button>
          <button className="nx-btn is-primary" disabled={!complete} onClick={() => props.mutate({ op: 'set_status', status: 'completed' })}>Complete project</button>
        </div>
      )}
      <div className="nx-project-board">
        {props.project.milestones.map((milestone) => (
          <section className="nx-project-milestone" key={milestone.id}>
            <header><h3>{milestone.title}</h3><span>{milestone.status}</span></header>
            <div className="nx-project-tasks">
              {props.project.tasks.filter((task) => task.milestone_id === milestone.id).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={props.project}
                  members={props.members}
                  self={props.self}
                  canCoordinate={canCoordinate}
                  mutate={props.mutate}
                />
              ))}
              {props.project.tasks.every((task) => task.milestone_id !== milestone.id) && <p className="nx-project-empty">No tasks yet.</p>}
            </div>
          </section>
        ))}
        {props.project.milestones.length === 0 && <p className="nx-project-empty">Add the first milestone to begin.</p>}
      </div>
      {canCoordinate && props.project.status !== 'completed' && props.project.status !== 'archived' && (
        <ProjectComposer project={props.project} members={props.members} mutate={props.mutate} />
      )}
    </>
  );
}

function TaskCard(props: {
  task: ProjectTask;
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
    <article className={`nx-project-task is-${props.task.status}`} data-testid={`project-task-${props.task.id}`}>
      <header>
        <span className="nx-project-check" aria-label={props.task.status === 'done' ? 'Completed' : props.task.status}>
          {props.task.status === 'done' ? <Check size={14} /> : props.task.revision}
        </span>
        <div><strong>{props.task.title}</strong><span>{props.task.id} · {props.task.status.replace('_', ' ')}</span></div>
        {assigned && <Chip name={assigned.display_name || assigned.handle} accent={memberAccent(assigned)} size={28} />}
      </header>
      <p>{props.task.description}</p>
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
