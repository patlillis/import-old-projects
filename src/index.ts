import { Octokit } from "@octokit/rest";

import chalk from "chalk";
import fs from "fs-extra";
import { sortBy } from "lodash";
import path from "path";

import type { ProjectInfo } from "./types";
import { getProjectInfo, printProjectInfo } from "./status";
import { importProject, revertImport } from "./import";

const main = async () => {
  // Get list of projects to check/import.
  let args = process.argv.slice(2);
  const importArg = args.includes("--import");
  const revertImportArg = args.includes("--revert-import");
  const statusArg = args.includes("--status");
  const writeStatusFileArg = args.includes("--write-status-file");
  const readStatusFileArg = args.includes("--read-status-file");
  const showCommentsArg = args.includes("--show-comments");
  const namesOnlyArg = args.includes("--names-only");
  args = args.filter(
    (a) =>
      a !== "--import" &&
      a !== "--revert-import" &&
      a !== "--status" &&
      a !== "--write-status-file" &&
      a !== "--read-status-file" &&
      a !== "--show-comments" &&
      a !== "--names-only"
  );

  // Check that only one action command was passed.
  const argSum =
    (importArg ? 1 : 0) +
    (revertImportArg ? 1 : 0) +
    (statusArg ? 1 : 0) +
    (writeStatusFileArg ? 1 : 0) +
    (readStatusFileArg ? 1 : 0);
  if (argSum === 0) {
    console.log(
      chalk.red(
        "Error: no action specfied. Use --import, --revert-import, --status, --write-status-file, or --read-status-file"
      )
    );
    return;
  }
  if (argSum > 1) {
    console.log(
      chalk.red(
        "Error: multiple actions specified. Use --import, --revert-import, --status, --write-status-file, or --read-status-file"
      )
    );
    return;
  }

  // Read token from "token.txt" file.
  let token: string;
  try {
    const tokenFile = await fs.readFile(
      path.join(__dirname, "..", "token.txt")
    );
    token = tokenFile.toString();
  } catch (err) {
    console.error("Error reading token", err);
    return;
  }

  // Set up authed API.
  const api = new Octokit({ auth: token });

  const fetchAllProjects = async (): Promise<string[]> => {
    const projectsResponse = await api.repos.listForUser({
      username: "patlillis-xx",
      per_page: 100,
    });
    return projectsResponse.data.map((p) => p.name);
  };

  // Import projects if "--import" is specified.
  if (importArg) {
    const projects = [];
    if (args.length === 0) {
      projects.push(...(await fetchAllProjects()));
      console.log(chalk.underline("Importing all projects\n"));
    } else {
      projects.push(...args);
      console.log(
        chalk.underline(`Importing projects: ${projects.join(", ")}\n`)
      );
    }
    // Import projects in parallel so we don't have any issues.
    for (const project of projects) {
      try {
        await importProject(api, project);
      } catch (err) {
        console.log(chalk.red(err.stack));
      }
    }
    return;
  }

  // Revert import if "--revert" is specified.
  if (revertImportArg) {
    const projects = [];
    if (args.length === 0) {
      projects.push(...(await fetchAllProjects()));
      console.log(chalk.underline("Reverting all projects\n"));
    } else {
      projects.push(...args);
      console.log(
        chalk.underline(`Reverting projects: ${projects.join(", ")}\n`)
      );
    }
    for (const project of projects) {
      try {
        await revertImport(api, project);
      } catch (err) {
        console.log(chalk.red(err.stack));
      }
    }
    return;
  }

  // Read status from a file.
  if (readStatusFileArg) {
    const projectInfos = await fs.readJson(path.join("data", "projects.json"));

    projectInfos.projects
      .filter(
        (projectInfo) => args.length === 0 || args.includes(projectInfo.repo)
      )
      .forEach((projectInfo) =>
        printProjectInfo({
          api,
          projectInfo,
          printComments: showCommentsArg,
          namesOnly: namesOnlyArg,
        })
      );
    return;
  }

  // Check project status.
  if (statusArg || writeStatusFileArg) {
    const projectInfos: ProjectInfo[] = [];
    const projects = [];

    if (writeStatusFileArg && args.length !== 0) {
      console.log(
        chalk.red("Error: --write-status-file action takes no parameters")
      );
      return;
    }

    if (args.length === 0) {
      projects.push(...(await fetchAllProjects()));
      console.log(chalk.underline("Checking all projects\n"));
    } else {
      projects.push(...args);
      console.log(
        chalk.underline(`Checking projects: ${projects.join(", ")}\n`)
      );
    }
    await Promise.all(
      projects.map(async (project) => {
        try {
          projectInfos.push(
            await getProjectInfo({ api, owner: "patlillis-xx", repo: project })
          );
        } catch (err) {
          console.log(chalk.red(err.stack));
        }
      })
    );
    const sortedProjectInfos = sortBy(projectInfos, [
      (p) => p.repo.owner.login.toLocaleLowerCase(),
      (p) => p.repo.name.toLocaleLowerCase(),
    ]);

    if (statusArg) {
      sortedProjectInfos.forEach((projectInfo) =>
        printProjectInfo({
          api,
          projectInfo,
          printComments: showCommentsArg,
          namesOnly: namesOnlyArg,
        })
      );
    } else if (writeStatusFileArg) {
      console.log(
        `Wrote output to ${chalk.cyan(path.join("data", "projects.json"))}`
      );
      await fs.writeJson(
        path.join("data", "projects.json"),
        { projects: sortedProjectInfos },
        { spaces: 2 }
      );
    }
  }
};

main();
