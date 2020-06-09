import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import fs from "fs-extra";
import { sortBy } from "lodash";
import path from "path";

let api: Octokit;

const IMPORT_IN_PROGRESS_STATUSES = [
  "detecting",
  "importing",
  "mapping",
  "pushing",
];
const IMPORT_ERROR_STATUSES = [
  "auth_failed",
  "error",
  "detection_needs_auth",
  "detection_found_nothing",
  "detection_found_multiple",
];
const IMPORT_COMPLETE_STATUS = "complete";

const IMPORT_POLL_INTERVAL = 200;

type ProjectInfo = {
  owner: string;
  repo: string;
  stargazers: string[];
  watchers: string[];
  topics: string[];
  forks: string[];
  issues: string[];
  pages: string | null;
  downloads: string[];
};

const checkPermissions = async (projectName: string, username: string) => {
  const permission = await api.repos.getCollaboratorPermissionLevel({
    owner: "patlillis",
    repo: projectName,
    username,
  });
  console.log(
    `\t${chalk.gray("user")} ${chalk.cyan(username)} ${chalk.gray(
      "has permission"
    )} ${chalk.cyan(permission.data.permission)}`
  );
};

const getProjectInfo = async (projectName: string): Promise<ProjectInfo> => {
  // Grab info about base project.
  const repoInfo = await api.repos.get({
    owner: "patlillis",
    repo: projectName,
  });

  const owner = repoInfo.data.owner.login;
  const repo = repoInfo.data.name;

  // Check stargazer info.
  const allStargazers = await api.activity.listStargazersForRepo({
    owner,
    repo,
  });
  const stargazers = (allStargazers.data as any[])
    .map((s) => s.login)
    .filter((s) => s !== "patlillis" && s !== "patlillis-xx");

  // Check watcher info.
  const allWatchers = await api.activity.listWatchersForRepo({ owner, repo });
  const watchers = allWatchers.data
    .map((w) => w.login)
    .filter((w) => w !== "patlillis" && w !== "patlillis-xx");

  // Check topics
  const topics = repoInfo.data.topics ?? [];

  // Check forks.
  const allForks = await api.repos.listForks({ owner, repo });
  const forks = allForks.data
    .map((f) => f.full_name)
    .filter((f) => f !== `patlillis/${projectName}`);

  // Check issues.
  const allIssues = await api.issues.listForRepo({ owner, repo });
  const issues = allIssues.data.map((i) => i.title);

  // Check github pages.
  let pages = null;
  if (repoInfo.data.has_pages) {
    const allPages = await api.repos.getPages({ owner, repo });
    pages = allPages.data.html_url;
  }

  // Check downloads.
  let downloads: string[] = [];
  if (repoInfo.data.has_downloads) {
    const allDownloads = await api.repos.listDownloads({ owner, repo });
    downloads = allDownloads.data.map((d) => d.name);
  }

  return {
    owner,
    repo,
    stargazers,
    watchers,
    topics,
    forks,
    issues,
    pages,
    downloads,
  };
};

const printProjectInfo = (info: ProjectInfo) => {
  const problems = [];

  // Print stargzer info.
  if (info.stargazers.length > 0) {
    problems.push(`\t${chalk.gray(`Stargazers: ${info.stargazers.length}`)}`);
  }

  // Print watcher info.
  if (info.watchers.length > 0) {
    problems.push(`\t${chalk.gray(`Watchers: ${info.watchers.length}`)}`);
  }

  // Print topics info.
  if (info.topics.length > 0) {
    problems.push(`\t${chalk.gray(`Topics: ${info.topics.length}`)}`);
  }

  // Print forks info.
  if (info.forks.length > 0) {
    problems.push(`\t${chalk.gray(`Forks: ${info.forks.length}`)}`);
  }

  // Print issues info.
  if (info.issues.length > 0) {
    problems.push(`\t${chalk.gray(`Issues: ${info.issues.length}`)}`);
  }

  // Print github pages info.
  if (info.pages != null) {
    problems.push(`\t${chalk.gray(`Pages: ${info.pages}`)}`);
  }

  // Print downloads info.
  if (info.downloads.length > 0) {
    problems.push(`\t${chalk.gray(`Downloads: ${info.downloads.length}`)}`);
  }

  if (problems.length === 0) {
    console.log(
      `${chalk.green("✓")} ${chalk.cyan(`${info.owner}/${info.repo}`)}`
    );
  } else {
    console.log(
      `${chalk.red("✕")} ${chalk.cyan(`${info.owner}/${info.repo}`)}`
    );
    for (const problem of problems) {
      console.log(problem);
    }
  }
};

const importRepo = async (projectName: string) => {
  console.log(`Importing project ${chalk.green(projectName)}`);

  // const forkName = `${projectName}-fork`;
  const cloneName = `${projectName}-clone`;

  // Grab info about base fork.
  const { data: repo } = await api.repos.get({
    owner: "patlillis",
    repo: projectName,
  });
  console.log(
    `\t${chalk.gray("Got info from repo")} ${chalk.cyan(
      `patlillis/${projectName}`
    )}`
  );

  // Rename fork to "-fork".
  // await api.repos.update({
  //   owner: "patlillis",
  //   repo: projectName,
  //   name: forkName,
  // });
  // console.log(
  //   `\t${chalk.gray("Renamed fork to")} ${chalk.cyan(`patlillis/${forkName}`)}`
  // );

  // Create empty project at new name.
  await api.repos.createForAuthenticatedUser({
    name: cloneName,
  });
  console.log(
    `\t${chalk.gray("Created empty repo ")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )}`
  );

  // Import project from patlillis-xx to patlillis
  console.log(
    `\t${chalk.gray("Started importing into")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )} ${chalk.gray("from")} ${chalk.cyan(repo.html_url)}`
  );
  let importStatus: string;
  let importStatusText: string;
  ({
    data: { status: importStatus, status_text: importStatusText },
  } = await api.migrations.startImport({
    owner: "patlillis",
    repo: cloneName,
    vcs_url: repo.html_url,
  }));

  while (IMPORT_IN_PROGRESS_STATUSES.includes(importStatus)) {
    console.log(
      `\t${chalk.gray("Import status:")} ${chalk.cyan(
        importStatusText ?? importStatus
      )}`
    );
    await new Promise((resolve) => setTimeout(resolve, IMPORT_POLL_INTERVAL));

    // Check import status again.
    ({
      data: { status: importStatus, status_text: importStatusText },
    } = await api.migrations.getImportStatus({
      owner: "patlillis",
      repo: cloneName,
    }));
  }

  if (importStatus === IMPORT_COMPLETE_STATUS) {
    console.log(
      `\t${chalk.gray("Import status:")} ${chalk.green(
        importStatusText ?? importStatus
      )}`
    );
  } else if (IMPORT_ERROR_STATUSES.includes(importStatus)) {
    console.log(
      `\t${chalk.gray("Import status:")} ${chalk.red(
        importStatusText ?? importStatus
      )}`
    );
  }

  // Update random settings that don't get imported.
  await api.repos.update({
    owner: "patlillis",
    repo: cloneName,
    default_branch: repo.default_branch,
    description: repo.description,
    has_issues: repo.has_issues,
    has_projects: repo.has_projects,
    has_wiki: repo.has_wiki,
    homepage: repo.homepage,
  });

  // Update topics (if necessary).
  const topics = repo.topics ?? [];
  if (repo.topics.length > 0) {
    await api.repos.replaceAllTopics({
      owner: "patlillis",
      repo: cloneName,
      names: topics,
    });
    console.log(
      `\t${chalk.gray("Added topics:")} ${chalk.cyan(topics.join(", "))}`
    );
  }

  // Update Pages (if necessary).
  if (repo.has_pages) {
    const pagesInfo = await api.repos.getPages({
      owner: "patlillis",
      repo: projectName,
    });
    await api.repos.createPagesSite({
      owner: "patlillis",
      repo: cloneName,
      source: {
        branch: pagesInfo.data.source.branch as any,
        path: pagesInfo.data.source.directory,
      },
    });
    if (pagesInfo.data.cname != null) {
      await api.repos.updateInformationAboutPagesSite({
        owner: "patlillis",
        repo: cloneName,
        cname: pagesInfo.data.cname,
      });
    }
  }
};

const revertImport = async (projectName: string) => {
  console.log(`Reverting import for project ${chalk.green(projectName)}`);

  const cloneName = `${projectName}-clone`;

  // Delete clone.
  await api.repos.delete({ owner: "patlillis", repo: cloneName });
  console.log(
    `\t${chalk.gray("Deleted project:")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )}`
  );
};

const main = async () => {
  // Get list of projects to check/import.
  const args = process.argv.slice(2);
  const importArgIndex = args.indexOf("--import");
  const revertArgIndex = args.indexOf("--revert");
  const statusArgIndex = args.indexOf("--status");

  // Check that only one action command was passed.
  const argSum =
    (importArgIndex === -1 ? 0 : 1) +
    (revertArgIndex === -1 ? 0 : 1) +
    (statusArgIndex === -1 ? 0 : 1);
  if (argSum === 0) {
    console.log(
      chalk.red(
        "Error: no action specfied. Use --import, --revert, or --status"
      )
    );
    return;
  }
  if (argSum > 1) {
    console.log(
      chalk.red(
        "Error: multiple actions specified. Use --import, --revert, or --status"
      )
    );
    return;
  }

  // Read token from "token.txt" file.
  let token: string;
  try {
    const tokenFile = await fs.readFile(path.join(__dirname, "token.txt"));
    token = tokenFile.toString();
  } catch (err) {
    console.error("Error reading token", err);
    return;
  }

  // Set up authed API.
  api = new Octokit({ auth: token });

  const projectsFile = await fs.readFile(path.join(__dirname, "projects.txt"));
  const projectsFromFile = projectsFile.toString().split("\n");

  // Import projects if "--import" is specified.
  if (importArgIndex !== -1) {
    args.splice(importArgIndex, 1);
    const projects = [];
    if (args.length === 0) {
      projects.push(...projectsFromFile);
      console.log(chalk.underline("Importing all projects\n"));
    } else {
      projects.push(...args);
      console.log(
        chalk.underline(`Importing projects: ${projects.join(", ")}\n`)
      );
    }
    for (const project of projects) {
      try {
        await importRepo(project);
      } catch (err) {
        console.log(chalk.red(err.stack));
      }
    }
    return;
  }

  // Revert import if "--revert" is specified.
  if (revertArgIndex !== -1) {
    args.splice(revertArgIndex, 1);
    const projects = [];
    if (args.length === 0) {
      projects.push(...projectsFromFile);
      console.log(chalk.underline("Reverting all projects\n"));
    } else {
      projects.push(...args);
      console.log(
        chalk.underline(`Reverting projects: ${projects.join(", ")}\n`)
      );
    }
    for (const project of projects) {
      try {
        await revertImport(project);
      } catch (err) {
        console.log(chalk.red(err.stack));
      }
    }
    return;
  }

  // Otherwise check project status.
  if (statusArgIndex !== -1) {
    const projectInfos: ProjectInfo[] = [];
    const projects = [];
    if (args.length === 0) {
      projects.push(...projectsFromFile);
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
          projectInfos.push(await getProjectInfo(project));
        } catch (err) {
          console.log(chalk.red(err.stack));
        }
      })
    );
    sortBy(projectInfos, [
      (p) => p.owner.toLocaleLowerCase(),
      (p) => p.repo.toLocaleLowerCase(),
    ]).forEach(printProjectInfo);
  }
};

main();
