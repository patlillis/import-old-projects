import { Octokit } from "@octokit/rest";
import {
  OctokitResponse,
  ActivityListStargazersForRepoResponseData,
  IssuesListCommentsResponseData,
} from "@octokit/types";
import chalk from "chalk";

import { ProjectInfo } from "./types";

export const getProjectInfo = async (
  api: Octokit,
  projectName: string
): Promise<ProjectInfo> => {
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

export const printProjectInfo = (
  api: Octokit,
  info: ProjectInfo,
  { namesOnly, printComments }: { namesOnly: boolean; printComments: boolean }
) => {
  console.log(chalk.green(`${info.repo.full_name}`));
  if (namesOnly) return;

  const IN = "   ";

  if (info.repo.fork) {
    if (info.repo.parent != null) {
      console.log(`${IN}${chalk.white(`Forked from:`)}`);
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(info.repo.parent.full_name)} (${
            info.repo.parent.html_url
          })`
        )
      );
    } else {
      console.log(`${IN}${chalk.white(`Fork`)}`);
    }
  }

  if (info.repo.description != null && info.repo.description != "") {
    console.log(`${IN}${chalk.white(`Description:`)}`);
    console.log(chalk.gray(`${IN}${IN}- ${chalk.cyan(info.repo.description)}`));
  }

  if (info.repo.homepage != null && info.repo.homepage != "") {
    console.log(`${IN}${chalk.white(`Homepage:`)}`);
    console.log(chalk.gray(`${IN}${IN}- ${chalk.cyan(info.repo.homepage)}`));
  }

  // Print stargzer info.
  if (info.stargazers.length > 0) {
    console.log(`${IN}${chalk.white(`Stargazers:`)}`);
    for (const stargazer of info.stargazers) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(stargazer.login)} (${stargazer.html_url})`
        )
      );
    }
  }

  // Print watcher info.
  if (info.watchers.length > 0) {
    console.log(`${IN}${chalk.white(`Watchers:`)}`);
    for (const watcher of info.watchers) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(watcher.login)} (${watcher.html_url})`
        )
      );
    }
  }

  // Print topics info.
  if (info.topics.length > 0) {
    console.log(`${IN}${chalk.white(`Topics:`)}`);
    for (const topic of info.topics) {
      console.log(chalk.gray(`${IN}${IN}- ${chalk.cyan(topic)}`));
    }
  }

  // Print forks info.
  if (info.forks.length > 0) {
    console.log(`${IN}${chalk.white(`Forks:`)}`);
    for (const fork of info.forks) {
      console.log(
        chalk.gray(
          `${IN}${IN}- ${chalk.cyan(fork.full_name)} (${fork.html_url})`
        )
      );
    }
  }

  // Print issues info.
  if (info.issues.length > 0) {
    console.log(`${IN}${chalk.white(`Issues:`)}`);
    for (const issue of info.issues) {
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
        for (const comment of info.issueComments[issue.number] ?? []) {
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
  if (info.pages != null) {
    console.log(`${IN}${chalk.white(`Pages:`)}`);
    console.log(chalk.gray(`${IN}${IN}- ${chalk.cyan(info.pages.html_url)}`));
    if (info.pages.cname != null) {
      console.log(
        chalk.gray(`${IN}${IN}- CNAME: ${chalk.cyan(info.pages.cname)}`)
      );
    }
    console.log(
      chalk.gray(
        `${IN}${IN}- Source Branch: ${chalk.cyan(info.pages.source.branch)}`
      )
    );
    if (info.pages.source.directory != null) {
      console.log(
        chalk.gray(
          `${IN}${IN}- Source Directory: ${chalk.cyan(
            info.pages.source.directory
          )}`
        )
      );
    }
  }
};
