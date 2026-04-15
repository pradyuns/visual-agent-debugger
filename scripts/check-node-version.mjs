const [majorRaw, minorRaw] = process.versions.node.split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);

const supported =
  (major === 18 && minor >= 18) ||
  major === 20 ||
  major === 22;

if (!supported) {
  console.error(
    `Unsupported Node.js runtime ${process.version}. Use Node 18.18+, 20.x, or 22.x.`,
  );
  process.exit(1);
}
