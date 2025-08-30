import { $ } from "bun";
import type { NpmRepositoryInfo, MichijsDependabotParams, WorkflowParams } from "./types";
import type { paths } from "@octokit/openapi-types"
export default async ({ params: { updatedPackages, oldPackageJson, githubRepository, ref }, runGroup }: WorkflowParams<MichijsDependabotParams>) => {

  const REPO = githubRepository.split("/");
  const OWNER = REPO[0];
  const REPO_NAME = REPO[1];
  // const ghHeaders = `-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28"`;
  const ghHeaders = ``;

  async function getPublicRepoInfo(pkgName: string) {
    const repoInfo = await $`bunx --silent npm view ${pkgName} --json repository`.json() as NpmRepositoryInfo;
    const url = (repoInfo.url || "").replace(/^git\+/, "").replace(/\.git$/, "");
    const parts = url.split("/");
    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];
    return { owner, repo, directory: repoInfo.directory || "" };
  }

  function getRepoInfo(pkgName: string) {
    const [org, package_name] = pkgName.split("/");
    if (!package_name)
      return {}
    return {
      owner: org.replace("@", ""),
      repo: package_name
    };
  }

  function cleanVersion(version: string) {
    // Match: major.minor.patch (all numeric)
    const match = version.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : "";
  }

  async function isValid(v1: string, v2: string) {
    try {
      await $`bunx semver "${cleanVersion(v1)}" -r ">=${cleanVersion(v2)}"`.text();
      return true;
    } catch {
      return false;
    }
  }

  function clearBody(body: string) {
    return body.replaceAll("@", "@&ZeroWidthSpace;").replaceAll("github.com", "redirect.github.com")
  }

  async function getChangelog(owner: string, repo: string, oldVersion: string) {
    try {
      const releases = await $`gh api ${ghHeaders} repos/${owner}/${repo}/releases`.json() as paths["/repos/{owner}/{repo}/releases"]["get"]["responses"]["200"]["content"]["application/json"];
      const changelog = (
        await Promise.all(
          releases.map(async r => {
            return await isValid(r.tag_name, oldVersion) ? `\n### ${r.tag_name}\n\n${r.body || ""}\n\n` : ""
          })
        )
      ).join("");
      if (changelog && changelog !== "") {
        return `<details>
        <summary>Changelog:</summary>
        <blockquote><em>Sourced from <a href="https://redirect.github.com/${owner}/${repo}/releases">releases</a>.</em>
        ${clearBody(changelog)}</blockquote></details>`;
      }
    } catch (err) {
      console.log(`No changelog for ${owner}/${repo}: ${err.message}`);
    }
    return "";
  }

  async function getCommitHistory(owner: string, repo: string, oldVersion: string, newVersion: string): Promise<string | undefined> {
    const compareCommitsRequest = $`gh api ${ghHeaders} repos/${owner}/${repo}/compare/v${oldVersion}...v${newVersion} --jq ".commits"`;
    const listCommitsRequest = $`gh api ${ghHeaders} repos/${owner}/${repo}/commits`;
    const [comparePromise, listCommits] = await Promise.allSettled([compareCommitsRequest, listCommitsRequest]);
    let commits: paths["/repos/{owner}/{repo}/commits"]["get"]["responses"]["200"]["content"]["application/json"];

    if (comparePromise.status === "fulfilled")
      commits = comparePromise.value.json();
    else if (listCommits.status === "fulfilled")
      commits = listCommits.value.json();
    else
      return undefined
    return clearBody(commits.map(c => `<li><a href="${c.html_url}"><code>${c.sha.slice(0, 6)}</code></a> ${c.commit.message}</li>`)?.join(""))
  }

  let updatedPackagesString = "";
  let comments: string[] = [];
  await runGroup("Get information about the releases", async () => await Promise.all(Object.entries(updatedPackages).map(async ([pkgName, newVersion]) => {
    const [resultPublic, result] = await Promise.allSettled([getPublicRepoInfo(pkgName), getRepoInfo(pkgName)]);
    console.log(pkgName, { resultPublic, result });
    const { owner, repo } = resultPublic.status === "fulfilled" ? resultPublic.value : (result.status === "fulfilled" ? result.value : {});
    console.log(pkgName, { owner, repo });
    if (!owner || !repo) return;

    const oldVersion =
      oldPackageJson.dependencies?.[pkgName] ||
      oldPackageJson.devDependencies?.[pkgName] ||
      oldPackageJson.optionalDependencies?.[pkgName] ||
      oldPackageJson.peerDependencies?.[pkgName] ||
      oldPackageJson.packageManager?.split("@")?.[1] ||
      "Not found";

    console.log(pkgName, { oldVersion });

    const idBump = `bump-${pkgName}`
    const bumpLabel = `Bump <a href="https://redirect.github.com/${owner}/${repo}">${clearBody(pkgName)}</a> from <a href="#user-content-${idBump}">${oldVersion} to ${newVersion}</a>`;
    updatedPackagesString += `<li>${bumpLabel}</li>`;

    const [changelog, commitHistory] = await Promise.all([
      getChangelog(owner, repo, oldVersion),
      getCommitHistory(owner, repo, oldVersion, newVersion)
    ]);
    console.log(pkgName, { changelog, commitHistory });

    comments.push(`<h3 id=${idBump}>${bumpLabel}</h3>${changelog}${commitHistory ? `<details><summary>Commit history:</summary><ul>${commitHistory}</ul></details>` : ""}`)

  })));

  const pr = await runGroup("Create PR", () => $`gh api --method POST ${ghHeaders} repos/${OWNER}/${REPO_NAME}/pulls -f "title=[${ref}] Michijs Dependabot changes" -f "body=## Updated Packages\n\n<ul>${updatedPackagesString}</ul>" -f "head=michijs-dependabot" -f "base=${ref}"`.json() as Promise<paths["/repos/{owner}/{repo}/pulls"]["post"]["responses"]["201"]["content"]["application/json"]>);
  
  await runGroup("Add comments regarding each update", () => Promise.all(comments.map(comment =>
    $`gh api --method POST ${ghHeaders} repos/${OWNER}/${REPO_NAME}/issues/${pr.number}/comments -f "body=${comment}"`
  )));
  
}
