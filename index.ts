import { Octokit } from "@octokit/rest"
import fs from "fs-extra"
import path from "path";

let api: Octokit;

const importRepo = async (projectName: string) => {
    // Grab info about base fork.
    const repo = await api.repos.get({ owner: "patlillis", repo: projectName })
    console.log(repo.data.svn_url)

    // 1. Rename fork to "-fork".
    // await api.repos.update({ owner: "patlillis", repo: projectName, name: `${projectName}-fork` })

    // 2. Import project from patlillis-xx to patlillis
    // await api.migrations.startImport({ owner: "patlillis", repo: projectName, vcs_url: repo.data.svn_url })
    //    - Include description?
    //    - Include issues?
    //    - Include github pages?
}

const main = async () => {
    const tokenFile = await fs.readFile(path.join(__dirname, "token.txt"));
    const token = tokenFile.toString();

    api = new Octokit({ auth: token })
    await importRepo("kondo")
}

main();