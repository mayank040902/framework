/**
 * Pre-publish verification: checks the package that would actually ship.
 *
 *   npm run pack:verify
 *
 * `npm publish` runs this automatically via `prepublishOnly`. It packs a real
 * tarball, extracts it, and imports it, so problems that only exist after packing
 * (a missing file, a broken `exports` map, a source map pointing at an unshipped
 * file) fail here instead of in a consumer's project.
 *
 * No broker and no network access required.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

let passed = 0;
const failures = [];

function ok(name) {
    passed += 1;
    console.log(`  ok   ${name}`);
}

function fail(name, message) {
    failures.push({ name, message });
    console.log(`  FAIL ${name}: ${message}`);
}

function check(name, fn) {
    try {
        const result = fn();
        if (result === false) {
            fail(name, "returned false");
            return;
        }
        ok(name);
    } catch (error) {
        fail(name, error.message);
    }
}

const requiredFiles = ["dist/index.js", "dist/index.d.ts", "dist/client/index.js", "README.md", "CHANGELOG.md", "LICENSE"];

const REQUIRED_EXPORTS = [
    "KafkaClient",
    "createKafkaClient",
    "createKafka",
    "createProducer",
    "createConsumer",
    "createAdmin",
    "subscribeToTopic",
    "consumeMessages",
    "registerShutdown",
    "shutdownClient",
    "createLoggerAdapter",
    "createConfigAdapter",
    "createCodecAdapter",
    "jsonCodec",
    "bytesCodec",
    "silentLogger",
    "KafkaConfigError",
    "KafkaConnectionError",
    "KafkaDecodeError",
];

console.log("Package metadata");
check("name is scoped", () => {
    if (!String(pkg.name).startsWith("@")) throw new Error(`expected a scoped name, got "${pkg.name}"`);
    if (/\s/.test(pkg.name)) throw new Error("name contains whitespace");
});

check("version is a stable semver", () => {
    const v = String(pkg.version);
    if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`"${v}" is not a stable x.y.z version`);
});

check("publish metadata is complete", () => {
    const missing = ["description", "license", "repository", "bugs", "homepage", "engines"]
        .filter((key) => !pkg[key]);
    if (missing.length > 0) throw new Error(`missing: ${missing.join(", ")}`);
    if (pkg.publishConfig?.access !== "public") throw new Error("publishConfig.access must be public");
});

check("kafkajs is the only runtime dependency", () => {
    const names = Object.keys(pkg.dependencies ?? {});
    const extra = names.filter((name) => name !== "kafkajs");
    if (extra.length > 0) throw new Error(`unexpected runtime dependencies: ${extra.join(", ")}`);
});

check("engines require Node 20 or newer", () => {
    if (!/20/.test(pkg.engines?.node ?? "")) throw new Error(`engines.node is "${pkg.engines?.node}"`);
});

check("package name matches the repository directory", () => {
    const declared = String(pkg.repository?.directory ?? "").split("/").pop();
    if (declared && path.basename(root) !== declared) {
        throw new Error(`package.json says "${declared}" but the directory is "${path.basename(root)}"`);
    }
});

console.log("\nChangelog");
check("no unreleased changes are pending", () => {
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    const index = changelog.search(/^##\s+\[?Unreleased\]?/m);
    if (index === -1) return;
    const rest = changelog.slice(index).replace(/^##\s+\[?Unreleased\]?.*$/m, "");
    const nextHeading = rest.search(/^##\s/m);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    const hasContent = section.split("\n").some((line) => /^\s*[-*]\s+\S/.test(line));
    if (hasContent) {
        throw new Error(
            "CHANGELOG.md has content under [Unreleased]. Publish that content under a version heading " +
            `and bump package.json from ${pkg.version} before publishing.`,
        );
    }
});

check("the current version appears in the changelog", () => {
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    if (!new RegExp(`^##\\s+\\[?${pkg.version.replace(/\./g, "\\.")}\\]?`, "m").test(changelog)) {
        throw new Error(`no heading for version ${pkg.version}`);
    }
});

console.log("\nTarball contents");

let tarballPath = null;
let packedFiles = [];
const workdir = mkdtempSync(path.join(tmpdir(), "kafka-pack-verify-"));
process.on("exit", () => rmSync(workdir, { recursive: true, force: true }));

try {
    const raw = execFileSync("npm", ["pack", "--json", "--pack-destination", workdir], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(raw);
    // npm returns an object keyed by package name, but stay tolerant of an array.
    const entry = Array.isArray(parsed) ? parsed[0] : parsed[pkg.name] ?? Object.values(parsed)[0];
    if (!entry?.filename) throw new Error("could not read the tarball name from npm pack --json");
    tarballPath = path.join(workdir, entry.filename);
    packedFiles = entry.files.map((file) => file.path);
} catch (error) {
    fail("npm pack succeeds", error.message);
}

if (tarballPath) {
    ok(`npm pack produced ${path.basename(tarballPath)}`);

    // Extract up front: the source-map check has to read files from inside the tarball.
    const extracted = path.join(workdir, "package");
    try {
        execFileSync("tar", ["-xzf", tarballPath, "-C", workdir], { stdio: "ignore" });
    } catch (error) {
        fail("tarball extracts", error.message);
    }

    check("required files are shipped", () => {
        const missing = requiredFiles.filter((file) => !packedFiles.includes(file));
        if (missing.length > 0) throw new Error(`missing: ${missing.join(", ")}`);
    });

    check("documentation is shipped", () => {
        const wanted = ["ARCHITECTURE.md", ".env.example"];
        const missing = wanted.filter((file) => !packedFiles.includes(file));
        if (missing.length > 0) throw new Error(`missing: ${missing.join(", ")}`);
    });

    check("no development or secret files are shipped", () => {
        const banned = packedFiles.filter((file) =>
            /^(\.kilo|node_modules|test|scripts)\//.test(file) ||
            /\.env$/.test(file) ||
            /(^|\/)(probe|debug|scratch)/i.test(file) ||
            /\.(log|tmp|orig|rej)$/.test(file),
        );
        if (banned.length > 0) throw new Error(`unexpected: ${banned.slice(0, 5).join(", ")}`);
    });

    check("source maps point at shipped sources", () => {
        const maps = packedFiles.filter((file) => file.endsWith(".map"));
        const broken = [];
        for (const map of maps) {
            const parsed = JSON.parse(readFileSync(path.join(workdir, "package", map), "utf8"));
            const base = path.dirname(map);
            for (const source of parsed.sources ?? []) {
                if (!existsSync(path.join(workdir, "package", base, source))) {
                    broken.push(`${map} -> ${source}`);
                }
            }
        }
        if (broken.length > 0) throw new Error(`unresolvable: ${broken.slice(0, 3).join("; ")}`);
    });

    // Import the extracted package the way a consumer does: by package specifier, from
    // a separate project, so the real `exports` map is exercised. A symlink to the real
    // node_modules lets kafkajs resolve without installing or touching the network.
    symlinkSync(path.join(root, "node_modules"), path.join(extracted, "node_modules"), "dir");

    const consumer = path.join(workdir, "consumer");
    const scopeDir = path.join(consumer, "node_modules", ...pkg.name.split("/").slice(0, -1));
    mkdirSync(scopeDir, { recursive: true });
    symlinkSync(extracted, path.join(scopeDir, pkg.name.split("/").pop()));
    writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "verify-consumer", type: "module" }));

    const driver = path.join(consumer, "driver.mjs");
    writeFileSync(driver, `
const main = await import(${JSON.stringify(pkg.name)});
const sub = await import(${JSON.stringify(`${pkg.name}/client`)});
process.stdout.write(JSON.stringify({
    main: Object.keys(main).sort(),
    sub: Object.keys(sub).sort(),
}));
`);

    let result = null;
    try {
        result = JSON.parse(execFileSync(process.execPath, [driver], { encoding: "utf8", cwd: consumer }));
        ok(`\`import "${pkg.name}"\` resolves through the exports map`);
    } catch (error) {
        fail(`\`import "${pkg.name}"\` resolves through the exports map`, (error.stderr || error.message).toString().split("\n").find((line) => line.includes("Error")) ?? "import failed");
    }

    if (result) {
    check("the public API is complete", () => {
        const missing = REQUIRED_EXPORTS.filter((name) => !result.main.includes(name));
        if (missing.length > 0) throw new Error(`not exported: ${missing.join(", ")}`);
    });

    check("the ./client subpath resolves", () => {
        const missing = ["createProducer", "createConsumer", "createAdmin", "createKafka"].filter((name) => !result.sub.includes(name));
        if (missing.length > 0) throw new Error(`not exported: ${missing.join(", ")}`);
    });

    check("README links resolve to shipped files", () => {
        const readme = readFileSync(path.join(extracted, "README.md"), "utf8");
        const links = [...readme.matchAll(/\]\((\.\/[^)#]+|[A-Za-z0-9._-]+\.md)(?:#[^)]*)?\)/g)]
            .map((match) => match[1])
            .filter((href) => !href.includes("/"));
        const broken = links.filter((href) => !existsSync(path.join(extracted, href.replace("./", ""))));
        if (broken.length > 0) throw new Error(`broken: ${broken.join(", ")}`);
    });
    }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
    console.error("\nPre-publish verification failed:");
    for (const { name, message } of failures) {
        console.error(`  ${name}: ${message}`);
    }
    process.exit(1);
}
process.exit(0);
