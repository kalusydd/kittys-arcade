import { expect, test } from "@playwright/test";
import { games } from "../data/games";

const first = games[0];
const second = games[1 % games.length];
const last = games[games.length - 1];
const comingSoon = games.find((g) => g.comingSoon);

const selectedTitle = (page: import("@playwright/test").Page) => page.locator("#selected-title");

test("home page shows the marquee and the records", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kitty's Arcade");
  await expect(page.locator('[aria-roledescription="slide"]')).toHaveCount(games.length);
  await expect(selectedTitle(page)).toHaveText(first.title);
  expect(errors).toEqual([]);
});

test("next and previous buttons and arrow keys change the selected game", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Next game" }).click();
  await expect(selectedTitle(page)).toHaveText(second.title);

  await page.getByRole("button", { name: "Previous game" }).click();
  await expect(selectedTitle(page)).toHaveText(first.title);

  await page.keyboard.press("ArrowLeft");
  await expect(selectedTitle(page)).toHaveText(last.title);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(selectedTitle(page)).toHaveText(second.title);
});

test("dragging the records flicks to another game", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByRole("region", { name: "Games" });
  const box = (await stage.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
  await page.mouse.up();
  await expect(selectedTitle(page)).not.toHaveText(first.title);
});

test("a placeholder record says coming soon and cannot be played", async ({ page }) => {
  test.skip(!comingSoon, "No coming soon records in the games list");
  await page.goto("/");
  while ((await selectedTitle(page).textContent()) !== comingSoon!.title) {
    await page.getByRole("button", { name: "Next game" }).click();
  }
  await expect(page.getByText("Coming soon.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coming soon" })).toBeDisabled();
  await expect(page.getByRole("link", { name: /^Play / })).toHaveCount(0);
});

test("playing Planet 13 opens its play page and loads the game", async ({ page }) => {
  const gameResponse = page.waitForResponse((r) => r.url().endsWith("/games/planet-13/index.html"));
  await page.goto("/");
  await page.getByRole("link", { name: "Play Planet 13" }).click();

  await expect(page).toHaveURL(/\/play\/planet-13$/);
  const frame = page.locator('iframe[title="Planet 13: Interdimensional Escape, the game"]');
  await expect(frame).toHaveAttribute("src", "/games/planet-13/index.html");
  expect((await gameResponse).status()).toBe(200);
  await expect(page.getByRole("link", { name: "Back to the arcade" })).toBeVisible();
});

test("Enter plays the selected game", async ({ page }) => {
  await page.goto("/");
  // A round trip on the arrow keys proves the page is interactive before Enter is pressed.
  await page.keyboard.press("ArrowRight");
  await expect(selectedTitle(page)).toHaveText(second.title);
  await page.keyboard.press("ArrowLeft");
  await expect(selectedTitle(page)).toHaveText(first.title);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/play\/planet-13$/);
});

test("an unknown game shows the 404 page", async ({ page }) => {
  const response = await page.goto("/play/nope");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That record isn't in the jukebox" })).toBeVisible();
});

test("a coming soon game has no play page", async ({ page }) => {
  test.skip(!comingSoon, "No coming soon records in the games list");
  const response = await page.goto(`/play/${comingSoon!.slug}`);
  expect(response?.status()).toBe(404);
});

test("the play page has link preview tags for the game", async ({ page }) => {
  await page.goto("/play/planet-13");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Planet 13: Interdimensional Escape",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /^https?:\/\/.+\/games\/planet-13\/cover\.jpg$/,
  );
});
