import { expect, test, type Page } from '@playwright/test';

const ROOM = '/?room=eng&token=next-e2e-token';

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
  await card.getByPlaceholder('Evidence or blocking note').fill('Verified in the browser');
  await card.getByRole('button', { name: 'Submit' }).click();
  await expect(card).toContainText('in review');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('done');
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
