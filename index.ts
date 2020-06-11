import { Octokit } from "@octokit/rest";
import {
  OctokitResponse,
  ReposGetPagesResponseData,
  ActivityListStargazersForRepoResponseData,
  ActivityListWatchersForRepoResponseData,
  ReposListForksResponseData,
  IssuesListForRepoResponseData,
  IssuesListCommentsResponseData,
} from "@octokit/types";
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
  topics: string[];
  stargazers: ActivityListStargazersForRepoResponseData;
  watchers: ActivityListWatchersForRepoResponseData;
  forks: ReposListForksResponseData;
  issues: IssuesListForRepoResponseData;
  issueComments: { [issueNumber: string]: IssuesListCommentsResponseData };
  pages: ReposGetPagesResponseData;
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
    owner: "patlillis-xx",
    repo: projectName,
  });

  const owner = repoInfo.data.owner.login;
  const repo = repoInfo.data.name;

  const [
    stargazersResponse,
    watchersResponse,
    forksResponse,
    issuesResponse,
    pagesResponse,
  ] = await Promise.all([
    api.activity.listStargazersForRepo({
      owner,
      repo,
    }),

    api.activity.listWatchersForRepo({
      owner,
      repo,
    }),

    api.repos.listForks({ owner, repo }),

    api.issues.listForRepo({
      owner,
      repo,
      state: "all",
    }),

    repoInfo.data.has_pages ? api.repos.getPages({ owner, repo }) : null,
  ]);

  // Check stargazer info.
  const stargazers = (stargazersResponse.data as ActivityListStargazersForRepoResponseData).filter(
    (s) => s.login !== "patlillis" && s.login !== "patlillis-xx"
  );
  // Check watcher info.
  const watchers = watchersResponse.data.filter(
    (w) => w.login !== "patlillis" && w.login !== "patlillis-xx"
  );

  // Check topics
  const topics = repoInfo.data.topics ?? [];

  // Check forks.
  const forks = forksResponse.data.filter(
    (f) => f.full_name !== `patlillis/${projectName}`
  );

  // Check issues.
  const { data: issues } = issuesResponse;
  issues.sort((a, b) => a.number - b.number);
  const issueCommentPromises: Promise<
    OctokitResponse<IssuesListCommentsResponseData>
  >[] = [];
  for (const issue of issues) {
    issueCommentPromises.push(
      api.issues.listComments({
        owner,
        repo,
        issue_number: issue.number,
      })
    );
  }
  const issueCommentResponses = await Promise.all(issueCommentPromises);
  const issueComments: {
    [issueNumber: string]: IssuesListCommentsResponseData;
  } = {};
  for (let i = 0; i < issueCommentResponses.length; i++) {
    const issue = issues[i];
    issueComments[issue.number] = issueCommentResponses[i].data;
  }

  // Check github pages.
  const { data: pages } = pagesResponse ?? {};

  return {
    owner,
    repo,
    stargazers,
    watchers,
    topics,
    forks,
    issues,
    issueComments,
    pages,
  };
};

const printProjectInfo = (
  info: ProjectInfo,
  { namesOnly, printComments }: { namesOnly: boolean; printComments: boolean }
) => {
  const IN = "   ";
  const problems = [];

  // Print stargzer info.
  if (info.stargazers.length > 0) {
    problems.push(`${IN}${chalk.white(`Stargazers:`)}`);
    for (const stargazer of info.stargazers) {
      problems.push(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(stargazer.login)} (${stargazer.html_url})`
        )
      );
    }
  }

  // Print watcher info.
  if (info.watchers.length > 0) {
    problems.push(`${IN}${chalk.white(`Watchers:`)}`);
    for (const watcher of info.watchers) {
      problems.push(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(watcher.login)} (${watcher.html_url})`
        )
      );
    }
  }

  // Print topics info.
  if (info.topics.length > 0) {
    problems.push(`${IN}${chalk.white(`Topics:`)}`);
    for (const topic of info.topics) {
      problems.push(chalk.gray(`${IN}${IN}- ${chalk.cyan(topic)}`));
    }
  }

  // Print forks info.
  if (info.forks.length > 0) {
    problems.push(`${IN}${chalk.white(`Forks:`)}`);
    for (const fork of info.forks) {
      problems.push(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(fork.full_name)} (${fork.html_url})`
        )
      );
    }
  }

  // Print issues info.
  if (info.issues.length > 0) {
    problems.push(`${IN}${chalk.white(`Issues:`)}`);
    for (const issue of info.issues) {
      problems.push(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(`[${issue.number}] ${issue.title}`)} (${
            issue.html_url
          })`
        )
      );
      if (printComments) {
        if (issue.body != null && issue.body !== "") {
          problems.push(
            chalk.gray(
              `${IN}${IN}${IN}- ${chalk.cyan(`[${issue.user.login}]`)} ${
                issue.body
              }`
            )
          );
        }
        for (const comment of info.issueComments[issue.number] ?? []) {
          problems.push(
            chalk.gray(
              `${IN}${IN}${IN}- ${chalk.cyan(`[${comment.user.login}]`)} ${
                comment.body
              }`
            )
          );
        }
      }
    }
  }

  // Print github pages info.
  if (info.pages != null) {
    problems.push(`${IN}${chalk.white(`Pages:`)}`);
    problems.push(chalk.gray(`${IN}${IN}- ${chalk.cyan(info.pages.html_url)}`));
    if (info.pages.cname != null) {
      problems.push(
        chalk.gray(`${IN}${IN}- CNAME: ${chalk.cyan(info.pages.cname)}`)
      );
    }
    problems.push(
      chalk.gray(
        `${IN}${IN}- Source Branch: ${chalk.cyan(info.pages.source.branch)}`
      )
    );
    if (info.pages.source.directory != null) {
      problems.push(
        chalk.gray(
          `${IN}${IN}- Source Directory: ${chalk.cyan(
            info.pages.source.directory
          )}`
        )
      );
    }
  }

  if (problems.length === 0) {
    console.log(
      `${chalk.green("✓")} ${chalk.green(`${info.owner}/${info.repo}`)}`
    );
  } else {
    console.log(`${chalk.red("✕")} ${chalk.red(`${info.owner}/${info.repo}`)}`);
    if (!namesOnly) {
      for (const problem of problems) {
        console.log(problem);
      }
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
  let args = process.argv.slice(2);
  const importArg = args.includes("--import");
  const revertArg = args.includes("--revert");
  const statusArg = args.includes("--status");
  const writeStatusFileArg = args.includes("--write-status-file");
  const readStatusFileArg = args.includes("--read-status-file");
  const showCommentsArg = args.includes("--show-comments");
  const namesOnlyArg = args.includes("--names-only");
  args = args.filter(
    (a) =>
      a !== "--import" &&
      a !== "--revert" &&
      a !== "--status" &&
      a !== "--write-status-file" &&
      a !== "--read-status-file" &&
      a !== "--show-comments" &&
      a !== "--names-only"
  );

  // Check that only one action command was passed.
  const argSum =
    (importArg ? 1 : 0) +
    (revertArg ? 1 : 0) +
    (statusArg ? 1 : 0) +
    (writeStatusFileArg ? 1 : 0) +
    (readStatusFileArg ? 1 : 0);
  if (argSum === 0) {
    console.log(
      chalk.red(
        "Error: no action specfied. Use --import, --revert, --status, --write-status-file, or --read-status-file"
      )
    );
    return;
  }
  if (argSum > 1) {
    console.log(
      chalk.red(
        "Error: multiple actions specified. Use --import, --revert, --status, --write-status-file, or --read-status-file"
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
  if (revertArg) {
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
        await revertImport(project);
      } catch (err) {
        console.log(chalk.red(err.stack));
      }
    }
    return;
  }

  // Read status from a file.
  if (readStatusFileArg) {
    const projectInfos = await fs.readJson("output.json");
    projectInfos.projects
      .filter((p) => args.length === 0 || args.includes(p.repo))
      .forEach((p) =>
        printProjectInfo(p, {
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
          projectInfos.push(await getProjectInfo(project));
        } catch (err) {
          console.log(chalk.red(err.stack));
        }
      })
    );
    const sortedProjectInfos = sortBy(projectInfos, [
      (p) => p.owner.toLocaleLowerCase(),
      (p) => p.repo.toLocaleLowerCase(),
    ]);

    if (statusArg) {
      sortedProjectInfos.forEach((p) =>
        printProjectInfo(p, {
          printComments: showCommentsArg,
          namesOnly: namesOnlyArg,
        })
      );
    } else if (writeStatusFileArg) {
      console.log(`Wrote output to ${chalk.cyan("output.json")}`);
      await fs.writeJson(
        "output.json",
        { projects: sortedProjectInfos },
        { spaces: 2 }
      );
    }
  }
};

main();
