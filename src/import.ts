import { Octokit } from "@octokit/rest";
import chalk from "chalk";

import { IN } from "./constants";
import { getProjectInfo } from "./status";

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

export const importProject = async (api: Octokit, projectName: string) => {
  console.log(`Importing project ${chalk.green(projectName)}`);

  const cloneName = `${projectName}-clone`;

  // Grab info about base fork.
  const projectInfo = await getProjectInfo({
    api,
    owner: "patlillis-xx",
    repo: projectName,
  });
  console.log(
    `${IN}${chalk.gray("Got info for repo")} ${chalk.cyan(
      projectInfo.repo.full_name
    )}`
  );

  // Create empty project at new name.
  await api.repos.createForAuthenticatedUser({
    name: cloneName,
  });
  console.log(
    `${IN}${chalk.gray("Created empty repo ")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )}`
  );

  // Import project from patlillis-xx to patlillis
  console.log(
    `${IN}${chalk.gray("Started importing into")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )} ${chalk.gray("from")} ${chalk.cyan(projectInfo.repo.full_name)}`
  );
  let previousImportStatus: string;
  let importStatus: string;
  let importStatusText: string;
  ({
    data: { status: importStatus, status_text: importStatusText },
  } = await api.migrations.startImport({
    owner: "patlillis",
    repo: cloneName,
    vcs_url: projectInfo.repo.html_url,
  }));

  while (IMPORT_IN_PROGRESS_STATUSES.includes(importStatus)) {
    if (importStatus !== previousImportStatus) {
      console.log(
        `${IN}${chalk.gray("Import status:")} ${chalk.cyan(
          importStatusText ?? importStatus
        )}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, IMPORT_POLL_INTERVAL));

    // Check import status again.
    previousImportStatus = importStatus;
    ({
      data: { status: importStatus, status_text: importStatusText },
    } = await api.migrations.getImportStatus({
      owner: "patlillis",
      repo: cloneName,
    }));
  }

  if (importStatus === IMPORT_COMPLETE_STATUS) {
    console.log(
      `${IN}${chalk.gray("Import status:")} ${chalk.cyan(
        importStatusText ?? importStatus
      )}`
    );
  } else if (IMPORT_ERROR_STATUSES.includes(importStatus)) {
    console.log(
      `${IN}${chalk.gray("Import status:")} ${chalk.red(
        importStatusText ?? importStatus
      )}`
    );
    return;
  }

  // Update random settings that don't get imported.
  await api.repos.update({
    owner: "patlillis",
    repo: cloneName,
    default_branch: projectInfo.repo.default_branch,
    description: projectInfo.repo.description,
    homepage: projectInfo.repo.homepage,
    has_issues: projectInfo.repo.has_issues,
    has_projects: projectInfo.repo.has_projects,
    has_wiki: projectInfo.repo.has_wiki,
  });
  console.log(`${IN}${chalk.gray("Updated clone info")}`);

  // Update topics (if necessary).
  const topics = projectInfo.topics ?? [];
  if (topics.length > 0) {
    await api.repos.replaceAllTopics({
      owner: "patlillis",
      repo: cloneName,
      names: topics,
    });
    console.log(
      `${IN}${chalk.gray("Added topics:")} ${chalk.cyan(topics.join(", "))}`
    );
  }

  // Set clone to private.
  const updateResponse = await api.repos.update({
    owner: "patlillis",
    repo: cloneName,
    private: true,
  });
  console.log(`${IN}${chalk.gray("Set clone to private")}`);

  console.log(
    `${IN}${chalk.gray("Finished import: ")} ${chalk.green(
      updateResponse.data.full_name
    )} (${updateResponse.data.html_url})`
  );

  console.log();
};

export const revertImport = async (api: Octokit, projectName: string) => {
  console.log(`Reverting import for project ${chalk.green(projectName)}`);

  const cloneName = `${projectName}-clone`;

  // Delete clone.
  const deleteResponse = await api.repos.delete({
    owner: "patlillis",
    repo: cloneName,
  });
  console.log(
    `${IN}${chalk.gray("Deleted project:")} ${chalk.cyan(
      `patlillis/${cloneName}`
    )}`
  );
};
