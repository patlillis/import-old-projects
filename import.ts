import { Octokit } from "@octokit/rest";
import chalk from "chalk";

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

export const importRepo = async (api: Octokit, projectName: string) => {
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

export const revertImport = async (api: Octokit, projectName: string) => {
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
