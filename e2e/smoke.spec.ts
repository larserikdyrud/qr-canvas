import { expect, test, type Page } from "@playwright/test";

const TEXT = "https://example.com/a/path?with=some&query=1234567890 æøå";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g(oogleapis|static)/.test(m.text())) errors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    if (!/fonts\.g(oogleapis|static)/.test(r.url())) errors.push(`failed: ${r.url()}`);
  });
  await page.goto("./");
  return errors;
}

async function canvasHasInk(page: Page) {
  return page.locator('canvas[role="img"]').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 80) dark += 1;
    return dark > 200;
  });
}

test("renders a code and downloads PNG and SVG", async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole("heading", { name: "QR codes you can draw on" })).toBeVisible();
  await page.getByLabel("Text or URL").fill(TEXT);
  await expect(page.getByText(/Version \d+ · mask \d · \d+×\d+/)).toBeVisible();
  expect(await canvasHasInk(page)).toBe(true);

  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  expect((await png).suggestedFilename()).toBe("example.com.png");

  const svg = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  expect((await svg).suggestedFilename()).toBe("example.com.svg");

  expect(errors).toEqual([]);
});

test("rejects invalid hex and warns about low contrast", async ({ page }) => {
  await open(page);
  const fg = page.getByLabel("Foreground", { exact: true });
  await fg.fill("#12");
  await expect(page.getByText(/Invalid colour/)).toBeVisible();
  await fg.fill("#777777");
  await page.getByLabel("Background", { exact: true }).fill("#888888");
  await expect(page.getByText(/Low contrast/)).toBeVisible();
});

test("a too-small forced version gives a friendly error", async ({ page }) => {
  await open(page);
  await page.getByLabel("Text or URL").fill("x".repeat(300));
  await page.getByLabel("Minimum version").selectOption("2");
  await expect(page.getByRole("alert").filter({ hasText: "does not fit in version 2" })).toBeVisible();
});

test("drawing mode: small edit still reads, heavy damage is flagged", async ({ page }) => {
  const errors = await open(page);
  await page.getByLabel("Text or URL").fill(TEXT);
  await page.getByRole("button", { name: "Draw in the code" }).click();
  await page.getByRole("button", { name: "Switch to H" }).click();

  const editor = page.getByRole("region", { name: "Draw in the code" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("status").first()).toContainText("Readable");

  const header = await editor.getByText(/Version \d+ · \d+×\d+ modules/).innerText();
  const n = Number(/(\d+)×\d+ modules/.exec(header)![1]);
  const grid = editor.getByRole("application");
  const box = (await grid.boundingBox())!;
  const cell = box.width / n;
  const at = (r: number, c: number) => ({ x: box.x + (c + 0.5) * cell, y: box.y + (r + 0.5) * cell });

  // one cell in the data area flips (toggle tool, so it changes whatever it was) and is counted
  await editor.getByRole("button", { name: "Toggle" }).click();
  const p = at(n - 3, n - 3);
  await page.mouse.click(p.x, p.y);
  await expect(editor.getByText(/1 changed/)).toBeVisible();
  await expect(editor.getByRole("status").first()).toContainText("Readable");

  // function patterns are locked
  const f = at(1, 1);
  await page.mouse.click(f.x, f.y);
  await expect(editor.getByText(/1 changed/)).toBeVisible();

  // controls lock once drawn on
  await expect(page.getByText(/The code has been drawn on/)).toBeVisible();
  await expect(page.getByLabel("Text or URL")).toHaveAttribute("readonly", "");

  // erase most of the data area: far beyond what error correction can repair
  await editor.getByRole("button", { name: "Light" }).click();
  const start = at(9, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let r = 9; r < n; r += 1) {
    await page.mouse.move(at(r, 0).x, at(r, 0).y);
    await page.mouse.move(at(r, n - 1).x, at(r, n - 1).y);
  }
  await page.mouse.up();
  await expect(editor.getByRole("status").first()).toContainText(/can no longer be read|something else/, { timeout: 5000 });

  // undo back to a readable state, then clear
  await page.keyboard.press("Control+z");
  await editor.getByRole("button", { name: "Clear drawing" }).click();
  await expect(editor.getByText(/0 changed/)).toBeVisible();
  await expect(editor.getByRole("status").first()).toContainText("Readable");

  expect(errors).toEqual([]);
});
