import type { NextConfig } from "next";

const githubPagesBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const isStaticDeployment = isGitHubPagesBuild || process.env.MOMENTUM_STATIC_EXPORT === "true" || process.env.CLOUDFLARE_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isStaticDeployment
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        ...(isGitHubPagesBuild
          ? {
              basePath: githubPagesBasePath,
              assetPrefix: githubPagesBasePath,
              trailingSlash: true,
            }
          : { trailingSlash: false }),
      }
    : {}),
};

export default nextConfig;
