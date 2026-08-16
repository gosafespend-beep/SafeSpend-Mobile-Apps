const fs = require('fs');
const path = require('path');

/**
 * On Android, `adjustsFontSizeToFit` without `minimumFontScale` lets the text
 * shrink toward zero instead of stopping at a readable size — the text is still
 * present in the accessibility tree, so it looks fine to any automated check,
 * but nothing is painted.
 *
 * This was live on the Dashboard: the INCOME and NET headline numbers rendered
 * as a bare "≈" with no digits, while ACCOUNTS and EXPENSES (a couple of pixels
 * wider, so they never entered the shrink path) rendered normally. Two of the
 * four headline numbers on the main screen were simply invisible.
 */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') sourceFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('every adjustsFontSizeToFit sets a minimumFontScale floor', () => {
  const src = path.join(__dirname, '..', '..');
  const offenders = [];

  for (const file of sourceFiles(src)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('adjustsFontSizeToFit')) return;
      if (line.includes('minimumFontScale')) return;
      offenders.push(`${path.relative(src, file)}:${i + 1}`);
    });
  }

  expect(offenders).toEqual([]);
});
