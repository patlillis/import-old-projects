import type {
  ReposGetResponseData,
  ReposGetPagesResponseData,
  ActivityListStargazersForRepoResponseData,
  ActivityListWatchersForRepoResponseData,
  ReposListForksResponseData,
  IssuesListForRepoResponseData,
  IssuesListCommentsResponseData,
} from "@octokit/types";

export type ProjectInfo = {
  repo: ReposGetResponseData;
  topics: string[];
  stargazers: ActivityListStargazersForRepoResponseData;
  watchers: ActivityListWatchersForRepoResponseData;
  forks: ReposListForksResponseData;
  issues: IssuesListForRepoResponseData;
  issueComments: { [issueNumber: string]: IssuesListCommentsResponseData };
  pages: ReposGetPagesResponseData;
};
