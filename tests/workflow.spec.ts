import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

type Account = { email: string; password: string; name: string }
const demo = (): Account[] => JSON.parse(readFileSync(process.env.CRM_DEMO_FILE!, 'utf8'))

async function signIn(page: Page, account: Account) {
  await page.goto('/')
  await page.getByLabel('Электронная почта').fill(account.email)
  await page.getByLabel('Пароль', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible()
}

test('A manager assigns work and reviews a resubmission', async ({ page, browser }) => {
  const [manager, executor, other] = demo()
  await signIn(page, manager)
  const title = 'Проверка интерфейса ' + Date.now()
  await page.getByRole('button', { name: 'Новый объект' }).click()
  await page.getByLabel('Название').fill(title)
  await page.getByLabel('Адрес').fill('Тестовый адрес')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Новая задача' }).click()
  await page.getByLabel('Название').fill('Проверить план')
  await page.getByLabel('Описание').fill('Сверить с фактическими размерами.')
  await page.getByRole('combobox', { name: 'Исполнитель', exact: true }).selectOption({ label: executor.name })
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Проверить план' })).toBeVisible()
  const taskUrl = page.url()
  const worker = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const outsider = await browser.newPage()
  try {
    await signIn(outsider, other)
    await outsider.goto(taskUrl)
    await expect(outsider.getByText('Запись недоступна или удалена.')).toBeVisible()
    await signIn(worker, executor)
    await worker.getByRole('link', { name: 'Мои задачи' }).click()
    await worker.getByRole('link', { name: /Проверить план/ }).click()
    await expect(worker.getByRole('button', { name: 'Редактировать' })).toHaveCount(0)
    await worker.getByRole('button', { name: 'Взять в работу' }).click()
    await worker.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(worker.getByText('В работе → На проверке')).toBeVisible()
    await page.getByRole('button', { name: 'Обновить' }).click()
    await page.getByRole('button', { name: 'Вернуть на доработку' }).click()
    await page.getByLabel('Что нужно доработать').fill('Уточните ширину прохода.')
    await page.getByRole('button', { name: 'Вернуть', exact: true }).click()
    await expect(page.getByText('Уточните ширину прохода.')).toBeVisible()
    await worker.getByRole('button', { name: 'Обновить' }).click()
    await worker.getByRole('button', { name: 'Взять в работу' }).click()
    await worker.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(worker.getByText('В работе → На проверке')).toHaveCount(2)
    await page.getByRole('button', { name: 'Обновить' }).click()
    await page.getByRole('button', { name: 'Принять', exact: true }).click()
    await expect(page.getByText('На проверке → Принята')).toBeVisible()
    if (process.env.CRM_SCREENSHOTS) {
      await page.screenshot({ path: process.env.CRM_SCREENSHOTS + '/mini-crm-task.png', fullPage: true })
      await worker.getByRole('button', { name: 'Обновить' }).click()
      await expect(worker.getByText('На проверке → Принята')).toBeVisible()
      await worker.screenshot({ path: process.env.CRM_SCREENSHOTS + '/mini-crm-mobile.png', fullPage: true })
    }
  } finally {
    await worker.close()
    await outsider.close()
  }
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
})
