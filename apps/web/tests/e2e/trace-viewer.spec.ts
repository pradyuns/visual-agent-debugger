import path from "node:path";
import { expect, test } from "@playwright/test";

const rawFixture = path.resolve(
  process.cwd(),
  "fixtures/traces/raw/canonical-trace.json",
);
const handoffFixture = path.resolve(
  process.cwd(),
  "fixtures/traces/agents-sdk/handoff-run.json",
);

test("imports a canonical trace, inspects spans, deletes it, and shows the missing state", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("No traces loaded yet.")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(rawFixture);

  await page.waitForURL(/\/runs\//, { timeout: 15_000 });
  const traceId = page.url().split("/").pop();
  expect(traceId).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Canonical raw trace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Canonical import root" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Answer agent/i }).click();
  await expect(page.getByRole("heading", { name: "Answer agent" })).toBeVisible();

  await page.getByRole("button", { name: "payload" }).click();
  await expect(page.getByText('"agentName": "Answer agent"')).toBeVisible();
  await expect(
    page.getByText('"question": "How do I reset my password?"'),
  ).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Canonical raw trace/i })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(
    page.getByText("No traces loaded yet.", { exact: true }),
  ).toBeVisible();

  await page.goto(`/runs/${traceId}`);
  await expect(
    page.getByRole("heading", { name: "This run is no longer available." }),
  ).toBeVisible();
});

test("imports an Agents SDK handoff trace and exposes handoff payload details", async ({
  page,
}) => {
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles(handoffFixture);

  await page.waitForURL(/\/runs\//, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Billing handoff run" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Escalate to billing/i }).click();
  await expect(
    page.getByRole("heading", { name: "Escalate to billing" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "payload" }).click();
  await expect(page.getByText('"fromAgent": "Triage Agent"')).toBeVisible();
  await expect(page.getByText('"toAgent": "Billing Agent"')).toBeVisible();

  await page.getByRole("button", { name: "raw" }).click();
  await expect(page.getByText('"toSpanId": "agent_billing"')).toBeVisible();
});
