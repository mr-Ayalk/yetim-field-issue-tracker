import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("scenario A: create a report and open it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("role-switcher").selectOption("FIELD_WORKER");
  await page.getByTestId("nav-new").click();
  await page.getByTestId("category").selectOption("WATER_POINT");
  await page.getByTestId("description").fill("The community tap has stopped and families are walking to the next point.");
  await page.getByTestId("location").fill("Hawassa industrial zone, standpipe 4");
  await page.getByRole("radio", { name: "High" }).check();
  await page.getByTestId("submit-report").click();
  await expect(page.getByText("Hawassa industrial zone, standpipe 4")).toBeVisible();
  await expect(page.getByText(/Pending|Syncing|Synchronized|Failed/)).toBeVisible();
});

test("scenario B: an offline report survives refresh", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Toggle offline" }).click();
  await expect(page.getByText("You're offline. Yetim keeps working.")).toBeVisible();
  await page.getByTestId("nav-new").click();
  await page.getByTestId("category").selectOption("SAFETY_CONCERN");
  await page.getByTestId("description").fill("An exposed cable is hanging into the warehouse walkway.");
  await page.getByTestId("location").fill("Dire Dawa warehouse, bay 2");
  await page.getByRole("radio", { name: "Critical" }).check();
  await page.getByTestId("submit-report").click();
  await expect(page.getByText("Pending")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Dire Dawa warehouse, bay 2")).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();
});
