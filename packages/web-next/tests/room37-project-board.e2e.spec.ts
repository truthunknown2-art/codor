import { expect, test, type Page } from '@playwright/test';

const ROOM = '/?room=eng&token=next-e2e-token';
const CONTROL = `http://127.0.0.1:${process.env.CODOR_NEXT_E2E_CONTROL_PORT ?? '28138'}`;

async function openRoom(page: Page): Promise<void> {
  await page.goto(ROOM);
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page.getByTestId('connection')).toHaveText(/Connected/);
}

test('the canonical board survives reload and completes gated work on desktop and mobile', async ({ page }) => {
  await openRoom(page);
  await page.getByTestId('project-board-trigger').click();
  const board = page.getByTestId('project-board');
  await board.getByLabel('Title').fill('Project truth');
  await board.getByLabel('Objective').fill('Keep one durable source of work');
  await board.getByLabel('Coordinator').selectOption({ label: '@fable' });
  await board.getByRole('button', { name: 'Create project' }).click();
  await expect(board.getByRole('heading', { name: 'Project truth' })).toBeVisible();

  const milestone = board.locator('.nx-project-compose form').filter({ hasText: 'Add milestone' });
  await milestone.getByLabel('ID').fill('m1');
  await milestone.getByLabel('Title').fill('Release');
  await milestone.getByRole('button', { name: /Milestone/ }).click();
  await expect(board.getByRole('heading', { name: 'Release' })).toBeVisible();

  const task = board.locator('.nx-project-compose form').filter({ hasText: 'Add task' });
  await task.getByLabel('ID').fill('t1');
  await task.getByLabel('Title').fill('Build board');
  await task.getByLabel('Description').fill('Implement the authoritative board');
  await task.getByLabel('Acceptance criteria').fill('Persists after reload');
  await task.getByLabel('Assignee').selectOption({ label: '@fable' });
  await task.getByLabel('Gatekeeper').selectOption({ label: '@scout' });
  await task.getByRole('button', { name: /Task/ }).click();

  const card = board.getByTestId('project-task-t1');
  await expect(card).toContainText('ready');
  await board.getByLabel('Active only').check();
  await expect(card).toBeVisible();
  await board.getByLabel('Active only').uncheck();
  await board.getByText('Pro steering bridge').click();
  const packet = JSON.parse(await board.getByLabel('Board packet for Pro').inputValue());
  packet.pro_steering_template.summary = 'Pro tightened the first task';
  packet.pro_steering_template.tasks[0].title = 'Build Board bridge';
  await board.getByTestId('pro-steering-input').fill(JSON.stringify(packet.pro_steering_template));
  await board.getByRole('button', { name: 'Preview' }).click();
  await expect(board.getByRole('status')).toContainText('Valid proposal 1');
  await board.getByRole('button', { name: 'Apply atomically' }).click();
  await expect(card).toContainText('Build Board bridge');
  await expect(board.getByRole('status')).toContainText('Applied proposal 1');

  await card.getByPlaceholder('Evidence or blocking note').fill('Verified in the browser');
  await card.getByRole('button', { name: 'Submit' }).click();
  await expect(card).toContainText('in review');
  const working = board.getByRole('region', { name: 'Working now' });
  await expect(working).toContainText('t1 — Build Board bridge');
  await expect(working).toContainText('Review by: @scout · running');
  await expect(working.getByRole('button', { name: /Jump to task/ })).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('done');
  await expect(working).toContainText('No task is currently marked in progress or review.');
  await board.getByLabel('Active only').check();
  await expect(card).toBeHidden();
  await expect(board).toContainText('No ready, active, review, or blocked tasks.');
  await board.getByLabel('Active only').uncheck();

  const removed = await page.request.post(`${CONTROL}/remove-agent`, { data: { handle: 'scout' } });
  expect(removed.ok()).toBe(true);
  await expect(board).toBeVisible();
  const historicalPacket = JSON.parse(await board.getByLabel('Board packet for Pro').inputValue());
  expect(historicalPacket.tasks[0].gatekeepers).toEqual(['scout']);
  await expect(board.getByLabel('Gatekeeper').locator('option', { hasText: '@scout' })).toHaveCount(0);

  await board.getByRole('button', { name: 'Complete project' }).click();
  await expect(board).toContainText('completed');

  await page.getByRole('button', { name: 'Close project board' }).click();
  await page.reload();
  await expect(page.getByTestId('connection')).toHaveText(/Connected/);
  await page.getByTestId('project-board-trigger').click();
  await expect(page.getByTestId('project-task-t1')).toContainText('done');

  await page.getByRole('button', { name: 'Close project board' }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId('project-board-trigger')).toBeVisible();
  await page.getByTestId('project-board-trigger').click();
  await expect(page.getByTestId('project-task-t1')).toBeVisible();
});
