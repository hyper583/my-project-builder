#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Clears stale locks left behind when the local test database crashes.
 *
 * `prisma dev` runs PGLite and guards its instance with a lock DIRECTORY. If
 * the process dies without releasing it — a hard kill, a machine sleeping, a
 * terminal closing — the directory survives, and every later start blocks on it
 * forever. The symptom is the worst kind: it prints "Starting prisma dev server
 * …", binds its ports, and then never completes a Postgres handshake. Nothing
 * reports an error, so it reads as "slow" rather than "stuck", and the test
 * suite fails with connection errors that point nowhere near the cause.
 *
 * This diagnosed as an hour of confusion the first time. It should be thirty
 * seconds every time after.
 *
 *   npm run db:unstick
 *
 * It refuses to touch anything while a daemon is actually running, because then
 * the locks are real and removing them would corrupt a live database.
 */

const DATA = join(
  process.env.LOCALAPPDATA ?? join(process.env.HOME ?? "", ".local", "share"),
  "prisma-dev-nodejs",
  "Data",
);

/**
 * Whether a daemon is currently running.
 *
 * This check is the whole safety of the script, because `server.lock.lock` is
 * NOT merely a crash artefact — a live daemon holds it and polls it. Deleting
 * it under a running instance kills that instance immediately, with
 * `ENOENT: ... server.lock.lock` and nothing else to explain why.
 *
 * That is not hypothetical. The first version matched command lines against
 * `*@prisma/dev*daemon*`, with forward slashes, while the Windows command line
 * contains backslashes. It never matched, reported "not running" against a live
 * daemon, and killed it.
 *
 * So the port check comes first and is decisive. A bound port is direct
 * evidence of a listener, needs no pattern to be right, and is the same on
 * every platform. The process scan only runs if the ports look free.
 */
const PORTS = [51213, 51214, 51215, 51216];

async function daemonRunning() {
  const net = await import("node:net");

  for (const port of PORTS) {
    const inUse = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      const settle = (result) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(1000);
      socket.once("connect", () => settle(true));
      socket.once("timeout", () => settle(false));
      socket.once("error", () => settle(false));
    });
    if (inUse) return true;
  }

  try {
    // Path-separator agnostic: `daemon.cjs` is distinctive enough on its own,
    // and matching it cannot be defeated by slash direction.
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" |" +
          " Where-Object { $_.CommandLine -like '*daemon.cjs*' } |" +
          " Measure-Object | Select-Object -ExpandProperty Count",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return Number(out.trim()) > 0;
  } catch {
    // If we cannot tell, assume it is running and do nothing. Refusing to act
    // is always recoverable; clearing a live lock is not.
    return true;
  }
}

function human(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

if (!existsSync(DATA)) {
  console.log(`No prisma dev data at ${DATA} — nothing to unstick.`);
  process.exit(0);
}

if (await daemonRunning()) {
  console.error(
    "A prisma dev daemon is running. Stop it first — its locks are real, and\n" +
      "removing them under a live database would corrupt it.",
  );
  process.exit(1);
}

const removed = [];

for (const instance of ["mpb", "default"]) {
  // The lock directory that causes the hang.
  const lockDir = join(DATA, "durable-streams", instance, "server.lock.lock");
  if (existsSync(lockDir)) {
    rmSync(lockDir, { recursive: true, force: true });
    removed.push(`stale lock directory (${instance})`);
  }

  // Postgres refuses to start against a data directory it believes is in use.
  const pid = join(DATA, instance, ".pglite", "postmaster.pid");
  if (existsSync(pid)) {
    rmSync(pid, { force: true });
    removed.push(`stale postmaster.pid (${instance})`);
  }

  // Not removed, only reported: this is prisma dev's own event log, and it
  // grows without bound. At a gigabyte it adds minutes to every start.
  const streams = join(DATA, "durable-streams", instance, "durable-streams.sqlite");
  if (existsSync(streams)) {
    const size = statSync(streams).size;
    if (size > 256 * 1024 * 1024) {
      console.warn(
        `\n  ${instance}: durable-streams.sqlite is ${human(size)}.\n` +
          `  That is prisma dev's internal event log, not your data — your database\n` +
          `  lives in Data/${instance}/.pglite. It slows every start once it is this\n` +
          `  large. Deleting it is safe with the daemon stopped:\n` +
          `    rm "${streams}"*\n`,
      );
    }
  }

  // A registration naming a process that no longer exists.
  const server = join(DATA, instance, "server.json");
  if (existsSync(server)) {
    try {
      const { pid: recorded } = JSON.parse(readFileSync(server, "utf8"));
      if (recorded) console.log(`  ${instance}: last registered as pid ${recorded} (now gone)`);
    } catch {
      // A corrupt registration is rewritten on the next start; leave it.
    }
  }
}

if (removed.length === 0) {
  console.log("No stale locks found. If it still will not start, the cause is elsewhere.");
} else {
  console.log(`\nRemoved: ${removed.join(", ")}`);
  console.log("\nNow start it in a terminal that stays open:\n  npx prisma dev --name mpb\n");
}
