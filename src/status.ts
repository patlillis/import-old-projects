import { Octokit } from "@octokit/rest";
import {
  OctokitResponse,
  ActivityListStargazersForRepoResponseData,
  IssuesListCommentsResponseData,
} from "@octokit/types";
import chalk from "chalk";

import { IN } from "./constants";
import { ProjectInfo } from "./types";

export const getProjectInfo = async (params: {
  api: Octokit;
  owner: string;
  repo: string;
}): Promise<ProjectInfo> => {
  const { api } = params;

  // Grab info about base project.
  const repoInfo = await api.repos.get({
    owner: params.owner,
    repo: params.repo,
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
    (f) => f.full_name !== `patlillis/${repo}`
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
    repo: repoInfo.data,
    stargazers,
    watchers,
    topics,
    forks,
    issues,
    issueComments,
    pages,
  };
};

export const printProjectInfo = ({
  api,
  projectInfo,
  namesOnly = false,
  printComments = false,
}: {
  api: Octokit;
  projectInfo: ProjectInfo;
  namesOnly?: boolean;
  printComments?: boolean;
}) => {
  console.log(chalk.green(`${projectInfo.repo.full_name}`));
  if (namesOnly) return;

  if (projectInfo.repo.fork) {
    if (projectInfo.repo.parent != null) {
      console.log(`${IN}${chalk.white(`Forked from:`)}`);
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(projectInfo.repo.parent.full_name)} (${
            projectInfo.repo.parent.html_url
          })`
        )
      );
    } else {
      console.log(`${IN}${chalk.white(`Fork`)}`);
    }
  }

  if (
    projectInfo.repo.description != null &&
    projectInfo.repo.description != ""
  ) {
    console.log(`${IN}${chalk.white(`Description:`)}`);
    console.log(
      chalk.gray(`${IN}${IN}- ${chalk.cyan(projectInfo.repo.description)}`)
    );
  }

  if (projectInfo.repo.homepage != null && projectInfo.repo.homepage != "") {
    console.log(`${IN}${chalk.white(`Homepage:`)}`);
    console.log(
      chalk.gray(`${IN}${IN}- ${chalk.cyan(projectInfo.repo.homepage)}`)
    );
  }

  // Print stargzer info.
  if (projectInfo.stargazers.length > 0) {
    console.log(`${IN}${chalk.white(`Stargazers:`)}`);
    for (const stargazer of projectInfo.stargazers) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(stargazer.login)} (${stargazer.html_url})`
        )
      );
    }
  }

  // Print watcher info.
  if (projectInfo.watchers.length > 0) {
    console.log(`${IN}${chalk.white(`Watchers:`)}`);
    for (const watcher of projectInfo.watchers) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(watcher.login)} (${watcher.html_url})`
        )
      );
    }
  }

  // Print topics info.
  if (projectInfo.topics.length > 0) {
    console.log(`${IN}${chalk.white(`Topics:`)}`);
    for (const topic of projectInfo.topics) {
      console.log(chalk.gray(`${IN}${IN}- ${chalk.cyan(topic)}`));
    }
  }

  // Print forks info.
  if (projectInfo.forks.length > 0) {
    console.log(`${IN}${chalk.white(`Forks:`)}`);
    for (const fork of projectInfo.forks) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(fork.full_name)} (${fork.html_url})`
        )
      );
    }
  }

  // Print issues info.
  if (projectInfo.issues.length > 0) {
    console.log(`${IN}${chalk.white(`Issues:`)}`);
    for (const issue of projectInfo.issues) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(`[${issue.number}] ${issue.title}`)} (${
            issue.html_url
          })`
        )
      );
      if (printComments) {
        if (issue.body != null && issue.body !== "") {
          console.log(
            chalk.gray(
              `${IN}${IN}${IN}- ${chalk.cyan(`[${issue.user.login}]`)} ${
                issue.body
              }`
            )
          );
        }
        for (const comment of projectInfo.issueComments[issue.number] ?? []) {
          console.log(
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
  if (projectInfo.pages != null) {
    console.log(`${IN}${chalk.white(`Pages:`)}`);
    console.log(
      chalk.gray(`${IN}${IN}- ${chalk.cyan(projectInfo.pages.html_url)}`)
    );
    if (projectInfo.pages.cname != null) {
      console.log(
        chalk.gray(`${IN}${IN}- CNAME: ${chalk.cyan(projectInfo.pages.cname)}`)
      );
    }
    console.log(
      chalk.gray(
        `${IN}${IN}- Source Branch: ${chalk.cyan(
          projectInfo.pages.source.branch
        )}`
      )
    );
    if (projectInfo.pages.source.directory != null) {
      console.log(
        chalk.gray(
          `${IN}${IN}- Source Directory: ${chalk.cyan(
            projectInfo.pages.source.directory
          )}`
        )
      );
    }
  }
};
